import { createClient } from "npm:@supabase/supabase-js@2";

const GEMINI_HOST = "https://generativelanguage.googleapis.com";
const GEMINI_VERSION = "v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";

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

type RequestPayload = {
  generation: GenerationBody;
  patientInitials?: string;
  /** Explicit name/alias tokens from the client (Hebrew + Latin) — scrubbed before Gemini. */
  nameTokens?: string[];
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseAllowedOrigins(): string[] {
  return (Deno.env.get("ALLOWED_ORIGINS") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function corsHeadersFor(req: Request): Record<string, string> {
  const allowed = parseAllowedOrigins();
  const origin = req.headers.get("Origin") ?? "";
  let allowOrigin = "*";
  if (allowed.length > 0) {
    allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  }
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
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

function getResponseText(data: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
  error?: { message?: string };
}): string {
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text === "string" && text.trim()) return text;
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
 * Fallback: metadata patient_id only if neither row exists (legacy portal JWTs).
 */
async function resolveIsPatientBudget(
  supabaseAuth: ReturnType<typeof createClient>,
  userId: string,
  userMetadata: Record<string, unknown> | undefined,
): Promise<boolean> {
  const [{ data: patientRow }, { data: profileRow }] = await Promise.all([
    supabaseAuth.from("patients").select("id").eq("auth_user_id", userId).maybeSingle(),
    supabaseAuth.from("profiles").select("id").eq("id", userId).maybeSingle(),
  ]);

  if (patientRow?.id) return true;
  if (profileRow?.id) return false;

  const metaPid = userMetadata?.patient_id;
  return typeof metaPid === "string" && metaPid.trim().length > 0;
}

Deno.serve(async (req) => {
  const corsHeaders = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const allowed = parseAllowedOrigins();
  const origin = req.headers.get("Origin") ?? "";
  if (allowed.length > 0 && origin && !allowed.includes(origin)) {
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
    user.user_metadata as Record<string, unknown> | undefined,
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

  let payload: RequestPayload;
  try {
    const rawText = await req.text();
    if (rawText.length > maxBodyBytes) {
      return jsonResponse({ error: "Payload too large" }, 413, corsHeaders);
    }
    payload = JSON.parse(rawText) as RequestPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, corsHeaders);
  }

  const gen = payload?.generation;
  if (!gen?.contents?.length || !gen.generationConfig || typeof gen.generationConfig !== "object") {
    return jsonResponse(
      { error: "Missing generation.contents or generation.generationConfig" },
      400,
      corsHeaders,
    );
  }

  const modelId = (Deno.env.get("GEMINI_MODEL") ?? DEFAULT_MODEL).trim();
  const scrubbed = scrubGeneration(gen, payload.patientInitials, payload.nameTokens);
  const url = `${GEMINI_HOST}/${GEMINI_VERSION}/models/${modelId}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const geminiRes = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(scrubbed),
  });

  const rawBody = await geminiRes.text();

  if (geminiRes.status === 429) {
    return new Response(rawBody || JSON.stringify({ error: "Rate limited" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!geminiRes.ok) {
    console.error(`[gemini-proxy] Gemini HTTP ${geminiRes.status}:`, rawBody.slice(0, 200));
    return jsonResponse(
      { error: "upstream_failed", detail: "Upstream AI service error" },
      502,
      corsHeaders,
    );
  }

  let parsed: Parameters<typeof getResponseText>[0];
  try {
    parsed = JSON.parse(rawBody) as Parameters<typeof getResponseText>[0];
  } catch {
    return jsonResponse({ error: "Invalid JSON from Gemini" }, 502, corsHeaders);
  }

  if (parsed.error?.message) {
    console.error("[gemini-proxy] Gemini API error:", String(parsed.error.message).slice(0, 200));
    return jsonResponse({ error: "upstream_failed" }, 502, corsHeaders);
  }

  try {
    const text = getResponseText(parsed);
    return jsonResponse({ text, model: modelId }, 200, corsHeaders);
  } catch (e) {
    console.error(
      "[gemini-proxy] empty/invalid model response:",
      e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
    );
    return jsonResponse({ error: "upstream_failed" }, 502, corsHeaders);
  }
});
