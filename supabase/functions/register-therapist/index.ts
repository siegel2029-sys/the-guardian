/**
 * Secure therapist registration. Clients cannot set app_metadata on signUp;
 * this function creates the Auth user with app_metadata.role=therapist via service_role.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, REGISTER_THERAPIST_SECRET
 * Optional: ALLOWED_ORIGINS (comma-separated). Localhost Vite origins always allowed.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { z } from "npm:zod@3.25.76";
import { corsHeadersFor, isOriginForbidden } from "../_shared/cors.ts";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 8;
const rateBuckets = new Map<string, number[]>();

const RegisterBodySchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(8).max(128),
    full_name: z.string().trim().min(1).max(120),
    registration_secret: z.string().trim().min(1).max(256),
  })
  .strict();

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

function timingSafeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const aa = enc.encode(a);
  const bb = enc.encode(b);
  if (aa.length !== bb.length) return false;
  let out = 0;
  for (let i = 0; i < aa.length; i++) out |= aa[i]! ^ bb[i]!;
  return out === 0;
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: cors });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, cors);
  }

  if (isOriginForbidden(req)) {
    return jsonResponse({ error: "Origin not allowed" }, 403, cors);
  }

  const ip = clientIp(req);
  if (!allowRate(`ip:${ip}`)) {
    return jsonResponse({ error: "rate_limited" }, 429, cors);
  }

  const expectedSecret = (Deno.env.get("REGISTER_THERAPIST_SECRET") ?? "").trim();
  if (!expectedSecret) {
    console.error("[register-therapist] REGISTER_THERAPIST_SECRET not configured");
    return jsonResponse({ error: "Server misconfigured" }, 500, cors);
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

  if (!timingSafeEqual(parsed.data.registration_secret, expectedSecret)) {
    return jsonResponse({ error: "forbidden" }, 403, cors);
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
      needsEmailVerification: true,
    },
    200,
    cors,
  );
});
