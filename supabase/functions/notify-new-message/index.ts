/**
 * Database Webhook target: INSERT on `public.chat_messages` (legacy alias: `messages` if you rename later).
 *
 * Expects Supabase webhook JSON (`type`, `table`, `record`, …). Sends push to the **patient** when the therapist
 * posts a normal chat row (`from_patient = false`, `ai_clinical_alert = false`).
 *
 * **Auth:** Set secret `INTERNAL_MESSAGES_WEBHOOK_SECRET` (recommended), or reuse `INTERNAL_CRON_SECRET`.
 * Send the same value as header `x-webhook-secret` **or** query `?secret=` (same pattern as reminder-cron).
 *
 * **Secrets:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EXPO_ACCESS_TOKEN` (Expo), `WEB_PUSH_VAPID_PUBLIC_KEY`,
 * `WEB_PUSH_VAPID_PRIVATE_KEY` (Web Push / Safari / Chrome).
 *
 * **Patient resolution:** Reads `record.patient_id`, `record.recipient_id`, `recipientId`, `patientId`, etc.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import {
  hasDeliverableReminderToken,
  isWebPushEndpoint,
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

function coerceBool(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v === null || v === undefined) return false;
  if (typeof v === "string") return v.toLowerCase() === "true" || v === "1";
  return Boolean(v);
}

function pickRecipientPatientId(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  const keys = [
    "patient_id",
    "recipient_id",
    "recipientId",
    "patientId",
    "to_patient_id",
  ];
  for (const k of keys) {
    const v = record[k];
    if (typeof v === "string" && v.trim().length > 0) return v.trim();
  }
  return null;
}

function describeSender(record: Record<string, unknown>): string {
  const fromPatient = coerceBool(record.from_patient);
  const tid = typeof record.therapist_id === "string" ? record.therapist_id.trim() : "";
  if (fromPatient) return "patient";
  if (tid.length > 0) return `therapist(${tid})`;
  return "therapist";
}

/** Push copy targets patients only when the row is a therapist → patient chat line. */
function shouldSendPatientPush(record: Record<string, unknown> | null): boolean {
  if (!record) return false;
  return !coerceBool(record.from_patient) && !coerceBool(record.ai_clinical_alert);
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
        hint: "POST JSON body from Database Webhook (INSERT on public.chat_messages)",
      });
    }
    payload = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json_body" }, 400);
  }

  const payloadObj = payload as Record<string, unknown>;
  const tableName = typeof payloadObj.table === "string" ? payloadObj.table : "(unknown)";
  const record = extractRecord(payload);
  const recipientId = pickRecipientPatientId(record);

  if (!recipientId) {
    console.warn("[notify-new-message] No recipient patient id on payload", {
      table: tableName,
      type: payloadObj.type,
    });
    return jsonResponse({
      ok: false,
      error: "missing_recipient_id",
      hint: "chat_messages row should include patient_id for the patient thread",
    }, 200);
  }

  const senderLabel = describeSender(record ?? {});
  console.log(
    `[notify-new-message] New message in table ${tableName} from ${senderLabel} to patient(${recipientId})`,
  );

  if (!shouldSendPatientPush(record)) {
    console.log(
      `[notify-new-message] Skip push (from_patient or ai_clinical_alert row — patient-targeted notify only).`,
    );
    return jsonResponse({
      ok: true,
      sent: false,
      skipped: "not_therapist_chat_notify_target",
      patientId: recipientId,
    });
  }

  const { data: patient, error: patientErr } = await supabase
    .from("patients")
    .select("id, push_token, payload, first_name")
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

  const friendly =
    typeof patient.first_name === "string" && patient.first_name.trim().length > 0
      ? patient.first_name.trim()
      : recipientId;

  const token = (patient.push_token as string | null | undefined)?.trim() ?? "";
  if (!hasDeliverableReminderToken(token)) {
    console.log(
      `[notify-new-message] Patient ${friendly} (${recipientId}) has no Expo/Web Push token`,
    );
    return jsonResponse({
      ok: true,
      sent: false,
      patientId: recipientId,
      reason: "no_deliverable_push_token",
    });
  }

  if (isWebPushEndpoint(token)) {
    console.log(`[notify-new-message] Patient ${friendly} (${recipientId}) has Web Push endpoint`);
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

  console.log("[notify-new-message] Push sent OK:", recipientId, friendly);

  return jsonResponse({
    ok: true,
    sent: true,
    patientId: recipientId,
  });
});
