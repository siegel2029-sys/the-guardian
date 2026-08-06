import { createClient } from "npm:@supabase/supabase-js@2";
import { GeminiProxyBodySchema, parseJsonText } from "../_shared/schemas.ts";
import { corsHeadersFor, isOriginForbidden } from "../_shared/cors.ts";
import { parseJsonObject } from "../_shared/safeJson.ts";

const GEMINI_HOST = "https://generativelanguage.googleapis.com";
const GEMINI_VERSION = "v1beta";
/** Current stable Flash model (as of 2026-08). Override with GEMINI_MODEL secret. */
const DEFAULT_MODEL = "gemini-3.6-flash";
/** Tried in order when primary returns 404 / NOT_FOUND. */
const MODEL_FALLBACKS = ["gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash"] as const;

/** Max request body size. Patients get a tighter cap than therapists. */
const MAX_BODY_BYTES_THERAPIST = 256 * 1024;
const MAX_BODY_BYTES_PATIENT = 48 * 1024;

/** Simple per-user sliding window (Edge isolate memory; best-effort abuse brake). */
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const rateBuckets = new Map<string, number[]>();

const CLINICAL_SYSTEM_PREFIX =
  "You are a clinical assistant. Never output or store full patient names.\n\n";

type GenPart = { text: string };
type GenContent = { role?: string; parts: GenPart[] };
type GenerationBody = {
  contents: GenContent[];
  systemInstruction?: { parts: GenPart[] };
  generationConfig: Record<string, unknown>;
};

type GeminiGeneratePayload = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
    finishReason?: string;
  }>;
  error?: { message?: string; status?: string; code?: number };
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * De-identify text before Gemini:
 * 1) Replace explicit nameTokens (works for Hebrew names).
 * 2) Latin "First Last" → initials / placeholder.
 */
function deidentifyText(
  text: string,
  patientInitials?: string,
  nameTokens?: string[],
): string {
  const placeholder = patientInitials?.trim() || "[Patient]";
  let out = text;
  const tokens = (nameTokens ?? [])
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 32);
  for (const token of tokens) {
    out = out.replace(new RegExp(escapeRegExp(token), "gi"), placeholder);
  }
  return out.replace(/\b([A-Z][a-z]{1,31})\s+([A-Z][a-z]{1,31})\b/g, () => placeholder);
}

function scrubGeneration(
  gen: GenerationBody,
  patientInitials?: string,
  nameTokens?: string[],
): GenerationBody {
  const contents = gen.contents.map((c) => ({
    ...c,
    parts: c.parts.map((p) => ({
      text: deidentifyText(p.text, patientInitials, nameTokens),
    })),
  }));

  const prefix = CLINICAL_SYSTEM_PREFIX;
  let systemInstruction: { parts: GenPart[] };
  if (gen.systemInstruction?.parts?.length) {
    systemInstruction = {
      parts: gen.systemInstruction.parts.map((p, i) => ({
        text: i === 0
          ? prefix + deidentifyText(p.text, patientInitials, nameTokens)
          : deidentifyText(p.text, patientInitials, nameTokens),
      })),
    };
  } else {
    systemInstruction = { parts: [{ text: prefix.trim() }] };
  }

  return {
    contents,
    systemInstruction,
    generationConfig: gen.generationConfig ?? {},
  };
}

function jsonResponse(
  body: unknown,
  status: number,
  cors: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function resolveModelCandidates(): string[] {
  const primary = (Deno.env.get("GEMINI_MODEL") ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  const ordered = [primary, ...MODEL_FALLBACKS];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of ordered) {
    const id = m.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/** Concatenate all text parts from the first candidate (thinking models may split parts). */
function getResponseText(data: GeminiGeneratePayload): string {
  const parts = data.candidates?.[0]?.content?.parts ?? [];
  const text = parts
    .map((p) => (typeof p.text === "string" ? p.text : ""))
    .join("")
    .trim();
  if (text) return text;
  const reason = data.candidates?.[0]?.finishReason;
  throw new Error(
    reason ? `Empty model text (finishReason: ${reason})` : "Empty model response text",
  );
}

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const prev = rateBuckets.get(userId) ?? [];
  const recent = prev.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (recent.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(userId, recent);
    return false;
  }
  recent.push(now);
  rateBuckets.set(userId, recent);
  return true;
}

/**
 * Resolve payload budget from DB membership — not editable user_metadata.
 * Patient: row in patients with auth_user_id = uid.
 * Therapist: row in profiles for uid.
 * Fallback: app_metadata.role/tier only (never user_metadata).
 */
async function resolveIsPatientBudget(
  supabaseAuth: ReturnType<typeof createClient>,
  userId: string,
  appMetadata: Record<string, unknown> | undefined,
): Promise<boolean> {
  const [{ data: patientRow }, { data: profileRow }] = await Promise.all([
    supabaseAuth.from("patients").select("id").eq("auth_user_id", userId).maybeSingle(),
    supabaseAuth.from("profiles").select("id").eq("id", userId).maybeSingle(),
  ]);

  if (patientRow?.id) return true;
  if (profileRow?.id) return false;

  const role = typeof appMetadata?.role === "string" ? appMetadata.role.trim() : "";
  const tier = typeof appMetadata?.tier === "string" ? appMetadata.tier.trim() : "";
  if (role === "therapist") return false;
  if (role === "patient" || tier === "free" || tier === "pro") return true;
  // Unknown → tighter patient budget (fail closed on payload size).
  return true;
}

function isModelNotFound(status: number, body: string, parsed: GeminiGeneratePayload | null): boolean {
  if (status === 404) return true;
  const msg = (parsed?.error?.message ?? body).toLowerCase();
  return msg.includes("not found") || msg.includes("is not found") || msg.includes("not supported");
}

async function callGeminiGenerate(
  apiKey: string,
  modelId: string,
  scrubbed: GenerationBody,
): Promise<{ status: number; rawBody: string; parsed: GeminiGeneratePayload | null }> {
  const url =
    `${GEMINI_HOST}/${GEMINI_VERSION}/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const geminiRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scrubbed),
  });
  const rawBody = await geminiRes.text();
  const parsed = parseJsonObject(rawBody) as GeminiGeneratePayload | null;
  return { status: geminiRes.status, rawBody, parsed };
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const allowedDenied = isOriginForbidden(req);
  if (allowedDenied) {
    return jsonResponse({ error: "Origin not allowed" }, 403, corsHeaders);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500, corsHeaders);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.trim()) {
    return jsonResponse({ error: "Unauthorized: missing or invalid Authorization" }, 401, corsHeaders);
  }

  // Forward the caller's Authorization header on the Supabase client so `getUser()` uses the
  // server-side JWT verification path (supports ES256). Do not pass the raw JWT string to
  // `getUser(jwt)` — that path can reject ES256 tokens.
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user) {
    console.warn("[gemini-proxy] auth rejected:", authError?.message ?? "no user");
    return jsonResponse(
      { error: "Unauthorized", detail: "Invalid or expired session" },
      401,
      corsHeaders,
    );
  }

  if (!checkRateLimit(user.id)) {
    return jsonResponse({ error: "Rate limited" }, 429, corsHeaders);
  }

  const isPatient = await resolveIsPatientBudget(
    supabaseAuth,
    user.id,
    user.app_metadata as Record<string, unknown> | undefined,
  );
  const maxBodyBytes = isPatient ? MAX_BODY_BYTES_PATIENT : MAX_BODY_BYTES_THERAPIST;

  const contentLength = Number.parseInt(req.headers.get("content-length") ?? "0", 10);
  if (Number.isFinite(contentLength) && contentLength > maxBodyBytes) {
    return jsonResponse({ error: "Payload too large" }, 413, corsHeaders);
  }

  const apiKey =
    Deno.env.get("GEMINI_API_KEY")?.trim() ||
    Deno.env.get("GOOGLE_AI_API_KEY")?.trim() ||
    Deno.env.get("GOOGLE_GENERATIVE_AI_API_KEY")?.trim();
  if (!apiKey) {
    return jsonResponse(
      {
        error: "GEMINI_API_KEY is not set",
        detail: "Configure the Gemini API key as an Edge Function secret (GEMINI_API_KEY).",
      },
      500,
      corsHeaders,
    );
  }

  let payload: {
    generation: GenerationBody;
    patientInitials?: string;
    nameTokens?: string[];
  };
  try {
    const rawText = await req.text();
    if (rawText.length > maxBodyBytes) {
      return jsonResponse({ error: "Payload too large" }, 413, corsHeaders);
    }
    const parsed = parseJsonText(GeminiProxyBodySchema, rawText);
    if (!parsed.ok) {
      return jsonResponse(
        { error: parsed.error === "invalid_json" ? "Invalid JSON body" : "invalid_payload" },
        400,
        corsHeaders,
      );
    }
    payload = {
      generation: {
        contents: parsed.data.generation.contents,
        systemInstruction: parsed.data.generation.systemInstruction,
        generationConfig: parsed.data.generation.generationConfig as Record<string, unknown>,
      },
      patientInitials: parsed.data.patientInitials,
      nameTokens: parsed.data.nameTokens,
    };
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
  }

  const gen = payload.generation;
  const scrubbed = scrubGeneration(gen, payload.patientInitials, payload.nameTokens);
  const modelCandidates = resolveModelCandidates();

  let lastStatus = 0;
  let lastRaw = "";
  let lastParsed: GeminiGeneratePayload | null = null;
  let usedModel = modelCandidates[0] ?? DEFAULT_MODEL;

  try {
    for (const modelId of modelCandidates) {
      usedModel = modelId;
      const result = await callGeminiGenerate(apiKey, modelId, scrubbed);
      lastStatus = result.status;
      lastRaw = result.rawBody;
      lastParsed = result.parsed;

      if (result.status === 429) {
        console.error("[gemini-proxy] Gemini HTTP 429:", result.rawBody.slice(0, 200));
        return jsonResponse({ error: "Rate limited", model: modelId }, 429, corsHeaders);
      }

      if (result.status >= 200 && result.status < 300) {
        break;
      }

      if (isModelNotFound(result.status, result.rawBody, result.parsed)) {
        console.warn("[gemini-proxy] model unavailable, trying fallback:", modelId);
        continue;
      }

      console.error(`[gemini-proxy] Gemini HTTP ${result.status}:`, result.rawBody.slice(0, 200));
      return jsonResponse(
        {
          error: "upstream_failed",
          detail: "Upstream AI service error",
          model: modelId,
          upstreamStatus: result.status,
        },
        502,
        corsHeaders,
      );
    }

    if (!(lastStatus >= 200 && lastStatus < 300)) {
      console.error(`[gemini-proxy] all models failed; last HTTP ${lastStatus}:`, lastRaw.slice(0, 200));
      return jsonResponse(
        {
          error: "upstream_failed",
          detail: "Upstream AI service error",
          model: usedModel,
          upstreamStatus: lastStatus || undefined,
        },
        502,
        corsHeaders,
      );
    }

    if (!lastParsed) {
      console.error("[gemini-proxy] non-JSON Gemini body:", lastRaw.slice(0, 200));
      return jsonResponse(
        {
          error: "invalid_upstream_json",
          detail: "Upstream AI returned a non-JSON body",
          model: usedModel,
        },
        502,
        corsHeaders,
      );
    }

    if (lastParsed.error?.message) {
      console.error(
        "[gemini-proxy] Gemini API error:",
        String(lastParsed.error.message).slice(0, 200),
      );
      return jsonResponse(
        {
          error: "upstream_failed",
          detail: "Upstream AI service error",
          model: usedModel,
        },
        502,
        corsHeaders,
      );
    }

    const text = getResponseText(lastParsed);
    return jsonResponse({ text, model: usedModel }, 200, corsHeaders);
  } catch (e) {
    console.error(
      "[gemini-proxy] empty/invalid model response:",
      e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
    );
    return jsonResponse(
      {
        error: "upstream_failed",
        detail: "Upstream AI returned an empty or unusable response",
        model: usedModel,
      },
      502,
      corsHeaders,
    );
  }
});
