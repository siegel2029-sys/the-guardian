import { createClient } from "@supabase/supabase-js";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const GEMINI_HOST = "https://generativelanguage.googleapis.com";
const GEMINI_VERSION = "v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash";

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
};

/** Simple Latin "First Last" → initials or placeholder before sending to Gemini. */
function deidentifyText(text: string, patientInitials?: string): string {
  const placeholder = patientInitials?.trim() || "[Patient]";
  return text.replace(/\b([A-Z][a-z]{1,31})\s+([A-Z][a-z]{1,31})\b/g, () => placeholder);
}

function scrubGeneration(gen: GenerationBody, patientInitials?: string): GenerationBody {
  const contents = gen.contents.map((c) => ({
    ...c,
    parts: c.parts.map((p) => ({ text: deidentifyText(p.text, patientInitials) })),
  }));

  const prefix = CLINICAL_SYSTEM_PREFIX;
  let systemInstruction: { parts: GenPart[] };
  if (gen.systemInstruction?.parts?.length) {
    systemInstruction = {
      parts: gen.systemInstruction.parts.map((p, i) => ({
        text: i === 0 ? prefix + deidentifyText(p.text, patientInitials) : deidentifyText(p.text, patientInitials),
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

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.trim()) {
    return jsonResponse({ error: "Unauthorized: missing or invalid Authorization" }, 401);
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
    return jsonResponse(
      {
        error: "Unauthorized",
        detail: authError?.message ?? "Invalid or expired session",
      },
      401,
    );
  }

  // Set in Supabase Dashboard → Edge Functions → Secrets, or: `supabase secrets set GEMINI_API_KEY=...`
  // Local serve: use `supabase secrets set` or a `.env` loaded for the functions runtime.
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
    );
  }

  let payload: RequestPayload;
  try {
    payload = (await req.json()) as RequestPayload;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const gen = payload?.generation;
  if (!gen?.contents?.length || !gen.generationConfig || typeof gen.generationConfig !== "object") {
    return jsonResponse({ error: "Missing generation.contents or generation.generationConfig" }, 400);
  }

  const modelId = (Deno.env.get("GEMINI_MODEL") ?? DEFAULT_MODEL).trim();
  const scrubbed = scrubGeneration(gen, payload.patientInitials);
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
    // Never forward Gemini upstream 401/403 as HTTP 401 — the browser client maps 401 to
    // "Supabase session expired". API key / quota issues must not look like JWT auth failures.
    return jsonResponse(
      { error: `Gemini HTTP ${geminiRes.status}`, detail: rawBody.slice(0, 500) },
      502,
    );
  }

  let parsed: Parameters<typeof getResponseText>[0];
  try {
    parsed = JSON.parse(rawBody) as Parameters<typeof getResponseText>[0];
  } catch {
    return jsonResponse({ error: "Invalid JSON from Gemini" }, 502);
  }

  if (parsed.error?.message) {
    return jsonResponse({ error: parsed.error.message }, 502);
  }

  try {
    const text = getResponseText(parsed);
    return jsonResponse({ text, model: modelId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return jsonResponse({ error: msg }, 502);
  }
});
