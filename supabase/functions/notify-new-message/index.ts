/**
 * Database Webhook target: INSERT on `public.messages`.
 *
 * Expects Supabase webhook JSON (`type`, `table`, `record`, …). Resolves the recipient patient and sends a push
 * (Expo or Web Push — same delivery stack as `reminder-cron` via `_shared/patientPushDelivery.ts`).
 *
 * **Auth:** Set secret `INTERNAL_MESSAGES_WEBHOOK_SECRET` (recommended), or reuse `INTERNAL_CRON_SECRET`.
 * Send the same value as header `x-webhook-secret` **or** query `?secret=` (same pattern as reminder-cron).
 *
 * **Secrets:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EXPO_ACCESS_TOKEN` (Expo), `WEB_PUSH_VAPID_PUBLIC_KEY`,
 * `WEB_PUSH_VAPID_PRIVATE_KEY` (Web Push / Safari / Chrome).
 *
 * **Patient resolution:** Reads `record.recipient_id` (also accepts `patient_id`, `recipientId`, `patientId`).
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  hasDeliverableReminderToken,
  sendPatientReminder,
} from "../_shared/patientPushDelivery.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-webhook-secret, x-cron-secret, content-type",
};

const CHAT_NOTIFY_BODY = "שלחתי לך הודעה חדשה בצ'אט. כנס לראות!";
/** Opens patient portal messages tab when the user taps the notification (service worker reads `data.url`). */
const PORTAL_MESSAGES_PATH = "/patient-portal/messages";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getWebhookSecret(): string {
  return (
    Deno.env.get("INTERNAL_MESSAGES_WEBHOOK_SECRET") ??
    Deno.env.get("INTERNAL_CRON_SECRET") ??
    ""
  ).trim();
}

/** Supabase Database Webhooks send `{ type, table, record }`; keep fallbacks for manual testing. */
function extractRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const raw = o.record ?? o.new ?? o.payload;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    return raw as Record<string, unknown>;
  }
  return null;
}

function pickRecipientPatientId(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  const keys = ["recipient_id", "recipientId", "patient_id", "patientId", "to_patient_id"];
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const secret = getWebhookSecret();
  const authHeader =
    req.headers.get("x-webhook-secret")?.trim() ??
    req.headers.get("x-cron-secret")?.trim() ??
    "";
  const url = new URL(req.url);
  const qsSecret = url.searchParams.get("secret")?.trim() ?? "";

  if (!secret || (authHeader !== secret && qsSecret !== secret)) {
    console.error("[notify-new-message] Unauthorized — missing or invalid webhook secret");
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) {
    return jsonResponse({ ok: false, error: "missing_supabase_env" }, 503);
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let payload: unknown;
  try {
    if (req.method === "GET" || req.method === "HEAD") {
      return jsonResponse({
        ok: true,
        hint: "POST JSON body from Database Webhook (INSERT messages)",
      });
    }
    payload = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json_body" }, 400);
  }

  const record = extractRecord(payload);
  const recipientId = pickRecipientPatientId(record);

  if (!recipientId) {
    console.warn("[notify-new-message] No recipient patient id on payload", {
      table: (payload as Record<string, unknown>)?.table,
      type: (payload as Record<string, unknown>)?.type,
    });
    return jsonResponse({
      ok: false,
      error: "missing_recipient_id",
      hint: "messages row should include recipient_id (or patient_id) for the patient",
    }, 200);
  }

  console.log("[notify-new-message] Incoming message for patient:", recipientId);

  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("id, push_token, payload")
    .eq("id", recipientId)
    .maybeSingle();

  if (patientErr) {
    console.error("[notify-new-message] patients select error:", patientErr.message);
    return jsonResponse({ ok: false, error: patientErr.message }, 503);
  }

  if (!patient) {
    return jsonResponse({
      ok: false,
      error: "patient_not_found",
      patientId: recipientId,
    }, 200);
  }

  const token = (patient.push_token as string | null | undefined)?.trim() ?? "";
  if (!hasDeliverableReminderToken(token)) {
    console.log("[notify-new-message] Patient has no Expo/Web Push token:", recipientId);
    return jsonResponse({
      ok: true,
      sent: false,
      patientId: recipientId,
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
    console.error("[notify-new-message] Push failed:", pushResult.detail);
    return jsonResponse({
      ok: false,
      patientId: recipientId,
      deliveryError: pushResult.detail,
    }, 200);
  }

  console.log("[notify-new-message] Push sent OK:", recipientId);

  return jsonResponse({
    ok: true,
    sent: true,
    patientId: recipientId,
  });
});
