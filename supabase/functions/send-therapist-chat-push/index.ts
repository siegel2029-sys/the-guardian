/**
 * Therapist-initiated chat push (JWT). Complements the DB webhook → `notify-new-message` path.
 *
 * **Auth:** Caller `Authorization: Bearer <therapist JWT>`; requires `app_metadata.role=therapist`
 * and `patients.therapist_id === user.id`.
 * **Secrets:** `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (optional stale clear),
 * `EXPO_ACCESS_TOKEN`, `WEB_PUSH_VAPID_PUBLIC_KEY`, `WEB_PUSH_VAPID_PRIVATE_KEY`.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  hasDeliverableReminderToken,
  markPatientPushTokenStale,
  sendPatientReminder,
} from "../_shared/patientPushDelivery.ts";
import { readPushTokenFromPatientPayload } from "../_shared/patientPayloadMeta.ts";
import { patientLogRef } from "../_shared/reminderEligibility.ts";
import { parseBody, TherapistChatPushBodySchema } from "../_shared/schemas.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CHAT_NOTIFY_BODY = "שלחתי לך הודעה חדשה בצ'אט. כנס לראות!";
const PORTAL_MESSAGES_PATH = "/patient-portal/messages";
const PUSH_SYNC_NOTIFY_BODY =
  "נדרש רענון מנוי ההתראות — פתחו את הפורטל; הסנכרון יתבצע אוטומטית.";
const PUSH_SYNC_PORTAL_PATH = "/patient-portal";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function appMetadataRole(user: { app_metadata?: Record<string, unknown> }): string {
  const role = user.app_metadata?.role;
  return typeof role === "string" ? role.trim().toLowerCase() : "";
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
    console.warn("[send-therapist-chat-push] auth rejected:", authError?.message ?? "no user");
    return jsonResponse(
      { error: "Unauthorized", detail: "Invalid or expired session" },
      401,
    );
  }

  if (appMetadataRole(user) !== "therapist") {
    return jsonResponse({ error: "Forbidden", detail: "therapist_role_required" }, 403);
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const parsed = parseBody(TherapistChatPushBodySchema, rawBody);
  if (!parsed.ok) {
    return jsonResponse({ error: "invalid_payload" }, 400);
  }

  const patientId = parsed.data.patientId;
  const pushSyncIntent = parsed.data.intent === "push_sync";

  const { data: patient, error: patientErr } = await supabaseAuth
    .from("patients")
    .select("id, payload, therapist_id")
    .eq("id", patientId)
    .maybeSingle();

  if (patientErr) {
    console.error("[send-therapist-chat-push] patients select:", patientErr.message);
    return jsonResponse({ ok: false, error: "patient_lookup_failed" }, 503);
  }

  if (!patient) {
    return jsonResponse({ ok: false, error: "patient_not_found_or_forbidden" }, 403);
  }

  const therapistId =
    typeof patient.therapist_id === "string" ? patient.therapist_id.trim() : "";
  if (!therapistId || therapistId !== user.id) {
    return jsonResponse({ ok: false, error: "patient_not_owned" }, 403);
  }

  const label = patientLogRef(patientId);
  const token = readPushTokenFromPatientPayload(patient.payload);
  console.log(
    "[send-therapist-chat-push] therapist",
    patientLogRef(user.id),
    "patient",
    label,
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

  // Never trust client-supplied notification body (PHI / abuse). Server constants only.
  const notifyBody = pushSyncIntent ? PUSH_SYNC_NOTIFY_BODY : CHAT_NOTIFY_BODY;
  const portalPath = pushSyncIntent ? PUSH_SYNC_PORTAL_PATH : PORTAL_MESSAGES_PATH;
  const notifyTag = pushSyncIntent
    ? "physioshield-push-sync-request"
    : "physioshield-chat-message";

  const pushResult = await sendPatientReminder(token, notifyBody, patient.payload, {
    expoTitle: "Physio-Shield",
    webPushPayloadExtras: {
      data: { url: portalPath, intent: pushSyncIntent ? "push_sync" : "chat" },
      tag: notifyTag,
    },
  });

  console.log(
    `[send-therapist-chat-push] Gateway response for ${label}: ${
      pushResult.ok ? "sent_ok" : "failed"
    }${pushResult.statusCode ? ` [HTTP ${pushResult.statusCode}]` : ""}${
      pushResult.stale ? " [STALE]" : ""
    }`,
  );

  if (!pushResult.ok) {
    console.error("[send-therapist-chat-push] Push failed for", label);
    if (pushResult.stale) {
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      if (serviceKey) {
        const supabaseService = createClient(supabaseUrl, serviceKey);
        await markPatientPushTokenStale(supabaseService, patientId, pushResult.detail ?? "stale");
      } else {
        console.warn(
          "[send-therapist-chat-push] Stale token not cleared — SUPABASE_SERVICE_ROLE_KEY missing",
        );
      }
    }
    return jsonResponse({
      ok: false,
      patientId,
      error: pushResult.stale ? "stale_token" : "push_failed",
      stale: pushResult.stale ?? false,
    }, 200);
  }

  console.log(
    "[send-therapist-chat-push] Push sent OK:",
    label,
    pushSyncIntent ? "(push_sync)" : "(chat)",
  );
  return jsonResponse({
    ok: true,
    sent: true,
    patientId,
    intent: pushSyncIntent ? "push_sync" : "chat",
  });
});
