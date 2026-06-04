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
  markPatientPushTokenStale,
  markTherapistPushTokenStale,
  sendPatientReminder,
} from "../_shared/patientPushDelivery.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-webhook-secret, x-cron-secret, content-type",
};

/** Therapist → patient: opens patient portal messages tab on tap. */
const CHAT_NOTIFY_BODY = "שלחתי לך הודעה חדשה בצ'אט. כנס לראות!";
const PORTAL_MESSAGES_PATH = "/patient-portal/messages";

/** Patient → therapist: opens the therapist dashboard messages panel on tap. */
const THERAPIST_CHAT_NOTIFY_BODY = "מטופל שלח לך הודעה חדשה בצ'אט.";
const THERAPIST_ALERT_NOTIFY_BODY = "התקבלה התראה קלינית חדשה ממטופל — היכנס לבדוק.";
const THERAPIST_MESSAGES_PATH = "/therapist";

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

function pickTherapistId(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  const keys = ["therapist_id", "therapistId", "to_therapist_id"];
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

type ChatDirection = "to_patient" | "to_therapist";

/**
 * A therapist → patient chat line (not an AI alert) notifies the patient.
 * A patient → therapist line, or any `ai_clinical_alert` row, notifies the therapist.
 */
function resolveChatDirection(record: Record<string, unknown> | null): ChatDirection {
  if (!record) return "to_patient";
  const fromPatient = coerceBool(record.from_patient);
  const isAiAlert = coerceBool(record.ai_clinical_alert);
  if (fromPatient || isAiAlert) return "to_therapist";
  return "to_patient";
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
  const direction = resolveChatDirection(record);
  const senderLabel = describeSender(record ?? {});

  console.log(
    `[notify-new-message] Trigger fired: table=${tableName} type=${
      typeof payloadObj.type === "string" ? payloadObj.type : "?"
    } from=${senderLabel} direction=${direction}`,
  );

  if (direction === "to_therapist") {
    return await notifyTherapist(supabase, record, tableName);
  }

  return await notifyPatient(supabase, record, tableName);
});

/** Therapist → patient chat line: deliver a live push to the patient's device. */
async function notifyPatient(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, unknown> | null,
  tableName: string,
): Promise<Response> {
  const recipientId = pickRecipientPatientId(record);
  if (!recipientId) {
    console.warn("[notify-new-message] No recipient patient id on payload", { table: tableName });
    return jsonResponse({
      ok: false,
      error: "missing_recipient_id",
      hint: "chat_messages row should include patient_id for the patient thread",
    }, 200);
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
    return jsonResponse({ ok: false, error: "patient_not_found", patientId: recipientId }, 200);
  }

  const friendly =
    typeof patient.first_name === "string" && patient.first_name.trim().length > 0
      ? patient.first_name.trim()
      : recipientId;

  const token = (patient.push_token as string | null | undefined)?.trim() ?? "";
  if (!hasDeliverableReminderToken(token)) {
    console.log(`[notify-new-message] Tokens resolved: 0 for patient ${friendly} (${recipientId}).`);
    return jsonResponse({
      ok: true,
      sent: false,
      patientId: recipientId,
      reason: "no_deliverable_push_token",
    });
  }

  console.log(
    `[notify-new-message] Tokens resolved: 1 deliverable ${
      isWebPushEndpoint(token) ? "web_push" : "expo"
    } token for patient(${recipientId}); routing to gateway...`,
  );

  const pushResult = await sendPatientReminder(token, CHAT_NOTIFY_BODY, patient.payload, {
    expoTitle: "Physio-Shield",
    webPushPayloadExtras: {
      data: { url: PORTAL_MESSAGES_PATH },
      tag: "physioshield-chat-message",
    },
  });

  console.log(
    `[notify-new-message] Gateway response for patient(${recipientId}): ${
      pushResult.ok ? "sent_ok" : pushResult.detail ?? "failed"
    }${pushResult.statusCode ? ` [HTTP ${pushResult.statusCode}]` : ""}${
      pushResult.stale ? " [STALE → clearing token]" : ""
    }`,
  );

  if (!pushResult.ok) {
    console.error("[notify-new-message] Patient push failed:", pushResult.detail);
    if (pushResult.stale) {
      await markPatientPushTokenStale(supabase, recipientId, `chat: ${pushResult.detail ?? "stale"}`);
    }
    return jsonResponse({
      ok: false,
      patientId: recipientId,
      deliveryError: pushResult.detail,
      stale: pushResult.stale ?? false,
    }, 200);
  }

  console.log("[notify-new-message] Push sent OK to patient:", recipientId, friendly);
  return jsonResponse({ ok: true, sent: true, recipient: "patient", patientId: recipientId });
}

/** Patient → therapist chat line (or AI clinical alert): deliver a live push to the therapist. */
async function notifyTherapist(
  supabase: ReturnType<typeof createClient>,
  record: Record<string, unknown> | null,
  tableName: string,
): Promise<Response> {
  const therapistId = pickTherapistId(record);
  if (!therapistId) {
    console.warn("[notify-new-message] No therapist id on payload", { table: tableName });
    return jsonResponse({
      ok: false,
      error: "missing_therapist_id",
      hint: "chat_messages row should include therapist_id for the therapist thread",
    }, 200);
  }

  const isAiAlert = coerceBool(record?.ai_clinical_alert);

  // Graceful fallback: tolerate environments where the profiles push columns are not yet migrated.
  const PROFILE_PUSH_SELECT = "id, name, push_token, push_payload";
  const PROFILE_PUSH_SELECT_LEGACY = "id, name";
  let profile: Record<string, unknown> | null = null;
  let profileErr: { message: string } | null = null;

  ({ data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select(PROFILE_PUSH_SELECT)
    .eq("id", therapistId)
    .maybeSingle());

  if (profileErr && /push_token|push_payload|column.*does not exist/i.test(profileErr.message)) {
    console.warn(
      "[notify-new-message] profiles push columns missing — apply migration 20260605120200_profiles_push_subscription.sql. Falling back.",
    );
    ({ data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select(PROFILE_PUSH_SELECT_LEGACY)
      .eq("id", therapistId)
      .maybeSingle());
  }

  if (profileErr) {
    console.error("[notify-new-message] profiles select error:", profileErr.message);
    return jsonResponse({ ok: false, error: profileErr.message }, 503);
  }

  if (!profile) {
    return jsonResponse({ ok: false, error: "therapist_not_found", therapistId }, 200);
  }

  const friendly =
    typeof profile.name === "string" && profile.name.trim().length > 0
      ? profile.name.trim()
      : therapistId;

  const token = (profile.push_token as string | null | undefined)?.trim() ?? "";
  if (!hasDeliverableReminderToken(token)) {
    console.log(
      `[notify-new-message] Tokens resolved: 0 for therapist ${friendly} (${therapistId}) — therapist has not registered push on this device.`,
    );
    return jsonResponse({
      ok: true,
      sent: false,
      therapistId,
      reason: "no_deliverable_push_token",
    });
  }

  console.log(
    `[notify-new-message] Tokens resolved: 1 deliverable ${
      isWebPushEndpoint(token) ? "web_push" : "expo"
    } token for therapist(${therapistId}); routing to gateway...`,
  );

  const pushResult = await sendPatientReminder(
    token,
    isAiAlert ? THERAPIST_ALERT_NOTIFY_BODY : THERAPIST_CHAT_NOTIFY_BODY,
    profile.push_payload,
    {
      expoTitle: "Physio-Shield",
      webPushPayloadExtras: {
        data: { url: THERAPIST_MESSAGES_PATH, intent: isAiAlert ? "clinical_alert" : "chat" },
        tag: isAiAlert ? "physioshield-clinical-alert" : "physioshield-therapist-chat",
      },
    },
  );

  console.log(
    `[notify-new-message] Gateway response for therapist(${therapistId}): ${
      pushResult.ok ? "sent_ok" : pushResult.detail ?? "failed"
    }${pushResult.statusCode ? ` [HTTP ${pushResult.statusCode}]` : ""}${
      pushResult.stale ? " [STALE → clearing token]" : ""
    }`,
  );

  if (!pushResult.ok) {
    console.error("[notify-new-message] Therapist push failed:", pushResult.detail);
    if (pushResult.stale) {
      await markTherapistPushTokenStale(supabase, therapistId, `chat: ${pushResult.detail ?? "stale"}`);
    }
    return jsonResponse({
      ok: false,
      therapistId,
      deliveryError: pushResult.detail,
      stale: pushResult.stale ?? false,
    }, 200);
  }

  console.log("[notify-new-message] Push sent OK to therapist:", therapistId, friendly);
  return jsonResponse({ ok: true, sent: true, recipient: "therapist", therapistId });
}
