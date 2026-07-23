/**
 * Secure therapist registration. Clients cannot set app_metadata on signUp;
 * this function creates the Auth user with app_metadata.role=therapist via service_role.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY (CORS/apikey).
 * Optional: ALLOWED_ORIGINS (comma-separated); empty → Access-Control-Allow-Origin: *
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 8;
const rateBuckets = new Map<string, number[]>();

const RegisterBodySchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(128),
    full_name: z.string().trim().min(1).max(120),
  })
  .strict();

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

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd) return fwd.slice(0, 64);
  return "unknown";
}

function allowRate(key: string): boolean {
  const now = Date.now();
  const prev = rateBuckets.get(key) ?? [];
  const windowed = prev.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (windowed.length >= RATE_LIMIT_MAX) {
    rateBuckets.set(key, windowed);
    return false;
  }
  windowed.push(now);
  rateBuckets.set(key, windowed);
  return true;
}

function passwordPolicyOk(password: string): boolean {
  const p = password.trim();
  if (p.length < 8) return false;
  if (!/[a-zA-Z]/.test(p) || !/\d/.test(p)) return false;
  return true;
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, cors);
  }

  const ip = clientIp(req);
  if (!allowRate(`ip:${ip}`)) {
    return jsonResponse({ error: "rate_limited" }, 429, cors);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    console.error("[register-therapist] missing SUPABASE_URL or SERVICE_ROLE_KEY");
    return jsonResponse({ error: "Server misconfigured" }, 500, cors);
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, cors);
  }

  const parsed = RegisterBodySchema.safeParse(raw);
  if (!parsed.success) {
    return jsonResponse({ error: "invalid_payload" }, 400, cors);
  }

  const email = parsed.data.email.trim().toLowerCase();
  const password = parsed.data.password;
  const fullName = parsed.data.full_name.trim();

  if (!passwordPolicyOk(password)) {
    return jsonResponse({ error: "invalid_password" }, 400, cors);
  }

  if (!allowRate(`email:${email}`)) {
    return jsonResponse({ error: "rate_limited" }, 429, cors);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: { full_name: fullName },
    app_metadata: { role: "therapist" },
  });

  if (error) {
    const msg = (error.message ?? "").toLowerCase();
    // Generic client messages — no stack / internal detail.
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      return jsonResponse({ error: "email_taken" }, 409, cors);
    }
    console.error("[register-therapist] createUser failed:", error.message);
    return jsonResponse({ error: "registration_failed" }, 400, cors);
  }

  const userId = data.user?.id;
  if (!userId) {
    console.error("[register-therapist] createUser returned no user id");
    return jsonResponse({ error: "registration_failed" }, 500, cors);
  }

  // Defense-in-depth: ensure app_metadata.role survived the BEFORE INSERT promote trigger.
  const role = (data.user?.app_metadata as Record<string, unknown> | undefined)?.role;
  if (role !== "therapist") {
    const { error: updErr } = await admin.auth.admin.updateUserById(userId, {
      app_metadata: { role: "therapist" },
    });
    if (updErr) {
      console.error("[register-therapist] app_metadata repair failed:", updErr.message);
      return jsonResponse({ error: "registration_failed" }, 500, cors);
    }
  }

  console.log("[register-therapist] therapist created");
  return jsonResponse(
    {
      ok: true,
      // Session is created client-side via signInWithPassword after verify-email when required.
      needsEmailVerification: true,
    },
    200,
    cors,
  );
});
