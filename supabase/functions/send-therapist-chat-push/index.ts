/**
 * Therapist-initiated chat push (JWT). Complements the DB webhook → `notify-new-message` path.
 *
 * **Auth:** Caller `Authorization: Bearer <therapist JWT>`; patient row loaded via RLS on anon client.
 * **Secrets:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (optional fallback),
 * `EXPO_ACCESS_TOKEN`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  hasDeliverableReminderToken,
  sendPatientReminder,
} from "../_shared/patientPushDelivery.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHAT_NOTIFY_BODY = "שלחתי לך הודעה חדשה בצ'אט. כנס לראות!";
const PORTAL_MESSAGES_PATH = "/patient-portal/messages";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.trim()) {
    return jsonResponse({ error: "Unauthorized: missing Authorization" }, 401);
  }

  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();
  if (authError || !user?.id) {
    return jsonResponse(
      { error: "Unauthorized", detail: authError?.message ?? "Invalid session" },
      401,
    );
  }

  let body: { patientId?: string; body?: string };
  try {
    body = (await req.json()) as { patientId?: string; body?: string };
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const patientId = typeof body.patientId === "string" ? body.patientId.trim() : "";
  if (!patientId) {
    return jsonResponse({ error: "missing_patientId" }, 400);
  }

  const { data: patient, error: patientErr } = await supabaseAuth
    .from("patients")
    .select("id, push_token, payload, therapist_id")
    .eq("id", patientId)
    .maybeSingle();

  if (patientErr) {
    console.error("[send-therapist-chat-push] patients select:", patientErr.message);
    return jsonResponse({ ok: false, error: patientErr.message }, 503);
  }

  if (!patient) {
    return jsonResponse({ ok: false, error: "patient_not_found_or_forbidden" }, 403);
  }

  const token = (patient.push_token as string | null | undefined)?.trim() ?? "";
  console.log(
    "[send-therapist-chat-push] therapist",
    user.id,
    "patient",
    patientId,
    "token:",
    hasDeliverableReminderToken(token),
  );

  if (!hasDeliverableReminderToken(token)) {
    return jsonResponse({
      ok: true,
      sent: false,
      patientId,
      reason: "no_deliverable_push_token",
    });
  }

  const pushResult = await sendPatientReminder(token, CHAT_NOTIFY_BODY, patient.payload, {
    expoTitle: "Physio-Shield",
    webPushPayloadExtras: {
      data: { url: PORTAL_MESSAGES_PATH },
      tag: "physioshield-chat-message",
    },
  });

  if (!pushResult.ok) {
    console.error("[send-therapist-chat-push] Push failed:", pushResult.detail);
    return jsonResponse({
      ok: false,
      patientId,
      deliveryError: pushResult.detail,
    }, 200);
  }

  console.log("[send-therapist-chat-push] Push sent OK:", patientId);
  return jsonResponse({ ok: true, sent: true, patientId });
});
