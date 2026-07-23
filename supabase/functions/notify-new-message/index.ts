/**
 * Database Webhook target: INSERT on `public.chat_messages`.
 *
 * Routes a live Web Push either to the patient (therapist → patient chat line) or to the
 * therapist (patient → therapist line, or any `ai_clinical_alert` row).
 *
 * IMPORTANT — why this function does NOT use the `web-push` npm library:
 *   The Supabase MCP `deploy_edge_function` bundler cannot deploy a bootable worker when the
 *   Node-polyfilled `web-push` (npm: or esm.sh) is combined with `supabase-js` and non-trivial
 *   code — the cold-boot dependency graph exceeds the gateway boot deadline and every request
 *   returns HTTP 503. We therefore send Web Push using the pure Web-Crypto library
 *   `@negrel/webpush`, which has a tiny boot graph and boots reliably on the Edge runtime.
 *   The existing VAPID secrets (base64url strings created with `web-push`) are converted to a
 *   Web-Crypto `CryptoKeyPair` at runtime, so no key rotation / re-subscription is required.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * WEB_PUSH_VAPID_PUBLIC_KEY, WEB_PUSH_VAPID_PRIVATE_KEY, WEB_PUSH_VAPID_SUBJECT,
 * INTERNAL_MESSAGES_WEBHOOK_SECRET (or INTERNAL_CRON_SECRET).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.103.0";
import * as webpush from "jsr:@negrel/webpush@0.5.0";
import {
  mergePatientPayloadFields,
  readPushTokenFromPatientPayload,
  stripPushFieldsFromPatientPayload,
} from "../_shared/patientPayloadMeta.ts";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-webhook-secret, x-cron-secret, content-type",
};

const CHAT_NOTIFY_BODY = "שלחתי לך הודעה חדשה בצ'אט. כנס לראות!";
const PORTAL_MESSAGES_PATH = "/patient-portal/messages";

const THERAPIST_CHAT_NOTIFY_BODY = "מטופל שלח לך הודעה חדשה בצ'אט.";
const THERAPIST_ALERT_NOTIFY_BODY = "התקבלה התראה קלינית חדשה ממטופל — היכנס לבדוק.";
const THERAPIST_MESSAGES_PATH = "/therapist";

type PushSendResult = { ok: boolean; detail?: string; statusCode?: number; stale?: boolean };

// ---------------------------------------------------------------------------
// Web Push (Web-Crypto / @negrel/webpush)
// ---------------------------------------------------------------------------

function isWebPushEndpoint(token: string): boolean {
  return token.trim().toLowerCase().startsWith("https://");
}

function hasDeliverableToken(token: string): boolean {
  return token.trim().length > 0 && isWebPushEndpoint(token);
}

function coerceJsonRecord(value: unknown): Record<string, unknown> | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const p = JSON.parse(value);
      return p && typeof p === "object" && !Array.isArray(p) ? p : null;
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

/** Resolve `{ p256dh, auth }` from the stored push_payload (handles nested webPushSubscription + flat shapes). */
function extractKeys(payload: unknown): { p256dh: string; auth: string } | null {
  const root = coerceJsonRecord(payload);
  if (!root) return null;
  const sub = coerceJsonRecord(root.webPushSubscription) ??
    coerceJsonRecord((coerceJsonRecord(root.payload) ?? {}).webPushSubscription) ??
    root;
  const keys = coerceJsonRecord(sub.keys) ?? (sub as Record<string, unknown>);
  const p256dh = typeof keys.p256dh === "string" ? keys.p256dh.trim() : "";
  const auth = typeof keys.auth === "string" ? keys.auth.trim() : "";
  return p256dh && auth ? { p256dh, auth } : null;
}

function normKey(raw: string | undefined | null): string {
  return (raw ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\r\n\u2028\u2029]+/g, "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, "")
    .trim();
}

function b64urlToBytes(s: string): Uint8Array {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = t.length % 4 === 0 ? "" : "=".repeat(4 - (t.length % 4));
  const bin = atob(t + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Convert the web-push-format VAPID secrets (base64url public point + private scalar) into a Web-Crypto key pair. */
async function buildVapidKeys(pubB64: string, privB64: string): Promise<CryptoKeyPair> {
  const pub = b64urlToBytes(pubB64);
  const x = bytesToB64url(pub.slice(1, 33));
  const y = bytesToB64url(pub.slice(33, 65));
  const d = privB64.replace(/=+$/, "");
  const privateKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, d, ext: true, key_ops: ["sign"] },
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign"],
  );
  const publicKey = await crypto.subtle.importKey(
    "jwk",
    { kty: "EC", crv: "P-256", x, y, ext: true, key_ops: ["verify"] },
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["verify"],
  );
  return { privateKey, publicKey };
}

let appServerPromise: Promise<webpush.ApplicationServer> | null = null;

function getAppServer(): Promise<webpush.ApplicationServer> {
  if (appServerPromise) return appServerPromise;
  appServerPromise = (async () => {
    const pub = normKey(Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY"));
    const priv = normKey(Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY"));
    if (pub.length <= 40 || priv.length < 40) {
      throw new Error("Missing or malformed WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY");
    }
    const subject = (Deno.env.get("WEB_PUSH_VAPID_SUBJECT") ?? "mailto:noreply@physioshield.app").trim() ||
      "mailto:noreply@physioshield.app";
    const vapidKeys = await buildVapidKeys(pub, priv);
    return await webpush.ApplicationServer.new({ contactInformation: subject, vapidKeys });
  })();
  return appServerPromise;
}

function statusFromPushError(e: unknown): number | undefined {
  if (e && typeof e === "object") {
    const resp = (e as { response?: { status?: number } }).response;
    if (resp && typeof resp.status === "number") return resp.status;
    const sc = (e as { statusCode?: number }).statusCode;
    if (typeof sc === "number") return sc;
  }
  const msg = e instanceof Error ? e.message : String(e);
  const m = msg.match(/\b(403|404|410)\b/);
  return m ? Number(m[1]) : undefined;
}

async function sendWebPush(
  endpoint: string,
  payload: unknown,
  body: string,
  extras: Record<string, unknown>,
): Promise<PushSendResult> {
  const keys = extractKeys(payload);
  if (!keys) {
    return { ok: false, detail: "No valid subscription keys found after parsing", stale: true };
  }

  let appServer: webpush.ApplicationServer;
  try {
    appServer = await getAppServer();
  } catch (e) {
    return { ok: false, detail: e instanceof Error ? e.message : String(e) };
  }

  try {
    const subscriber = appServer.subscribe({
      endpoint,
      keys,
      expirationTime: null,
    } as unknown as PushSubscriptionJSON);
    await subscriber.pushTextMessage(JSON.stringify({ title: "Physio-Shield", body, ...extras }), {});
    return { ok: true };
  } catch (e: unknown) {
    const statusCode = statusFromPushError(e);
    let detail = e instanceof Error ? e.message : String(e);
    if (typeof statusCode === "number") detail = `HTTP ${statusCode}: ${detail}`;
    return {
      ok: false,
      detail: detail.slice(0, 500),
      statusCode,
      stale: statusCode === 403 || statusCode === 404 || statusCode === 410,
    };
  }
}

type SupabaseClient = ReturnType<typeof createClient>;

async function markPatientPushTokenStaleInPayload(
  supabase: SupabaseClient,
  patientId: string,
  detail: string,
): Promise<void> {
  try {
    const { data: row, error: fetchErr } = await supabase
      .from("patients")
      .select("payload")
      .eq("id", patientId)
      .maybeSingle();

    if (fetchErr) {
      console.error(`patient-push: failed to load payload for stale clear patients.id=${patientId}: ${fetchErr.message}`);
      return;
    }
    if (!row) return;

    const stripped = stripPushFieldsFromPatientPayload(row.payload);
    const merged =
      stripped &&
      mergePatientPayloadFields(stripped, {
        pushLastError: detail.slice(0, 300),
        pushInvalidatedAt: new Date().toISOString(),
      });

    if (!merged) {
      console.error(`patient-push: failed to strip push fields from payload for patients.id=${patientId}`);
      return;
    }

    const { error } = await supabase
      .from("patients")
      .update({ payload: merged })
      .eq("id", patientId);

    if (error) {
      console.error(`patient-push: failed to flag stale token for patients.id=${patientId}: ${error.message}`);
    } else {
      console.log(`patient-push: flagged stale push token for patients.id=${patientId} (cleared payload.pushToken).`);
    }
  } catch (e) {
    console.error(`patient-push: exception flagging stale token for patients.id=${patientId}:`, e instanceof Error ? e.message : String(e));
  }
}

async function markProfilePushTokenStale(
  supabase: SupabaseClient,
  profileId: string,
  detail: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("profiles")
      .update({
        push_token: null,
        push_invalidated_at: new Date().toISOString(),
        push_last_error: detail.slice(0, 300),
      })
      .eq("id", profileId);
    if (error) {
      console.error(`patient-push: failed to flag stale token for profiles.id=${profileId}: ${error.message}`);
    } else {
      console.log(`patient-push: flagged stale push token for profiles.id=${profileId} (cleared push_token).`);
    }
  } catch (e) {
    console.error(`patient-push: exception flagging stale token for profiles.id=${profileId}:`, e instanceof Error ? e.message : String(e));
  }
}

/** Delete a single stale device row (410 Gone / 404 / 403) without touching the therapist's other devices. */
async function deleteStaleTherapistSubscription(
  supabase: SupabaseClient,
  rowId: string,
  detail: string,
): Promise<void> {
  try {
    const { error } = await supabase
      .from("therapist_push_subscriptions")
      .delete()
      .eq("id", rowId);
    if (error) {
      console.error(`therapist-push: failed to delete stale subscription id=${rowId}: ${error.message}`);
    } else {
      console.log(`therapist-push: deleted stale subscription id=${rowId} (${detail.slice(0, 120)}).`);
    }
  } catch (e) {
    console.error(`therapist-push: exception deleting stale subscription id=${rowId}:`, e instanceof Error ? e.message : String(e));
  }
}

// ---------------------------------------------------------------------------
// Webhook routing
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getWebhookSecret(): string {
  // Dedicated secret only — no fallback to INTERNAL_CRON_SECRET, so a leaked
  // cron secret cannot be replayed against the message webhook (and vice versa).
  return (Deno.env.get("INTERNAL_MESSAGES_WEBHOOK_SECRET") ?? "").trim();
}

function extractRecord(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const o = payload as Record<string, unknown>;
  const raw = o.record ?? o.new ?? o.payload;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

function coerceBool(v: unknown): boolean {
  if (v === true) return true;
  if (v === false || v == null) return false;
  if (typeof v === "string") return v.toLowerCase() === "true" || v === "1";
  return Boolean(v);
}

function pickId(record: Record<string, unknown> | null, keys: string[]): string | null {
  if (!record) return null;
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

function resolveChatDirection(record: Record<string, unknown> | null): ChatDirection {
  if (!record) return "to_patient";
  if (coerceBool(record.from_patient) || coerceBool(record.ai_clinical_alert)) return "to_therapist";
  return "to_patient";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Secret is accepted via the x-webhook-secret header only; query-string secrets
  // leak into proxy and load-balancer access logs.
  const secret = getWebhookSecret();
  const authHeader = req.headers.get("x-webhook-secret")?.trim() ?? "";
  const isValid = secret.length > 0 && authHeader === secret;
  if (!isValid) {
    console.error("[notify-new-message] Unauthorized — missing or invalid webhook secret");
    return jsonResponse({ ok: false, error: "Unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceKey) return jsonResponse({ ok: false, error: "missing_supabase_env" }, 503);

  const supabase = createClient(supabaseUrl, serviceKey);

  let payload: unknown;
  try {
    if (req.method === "GET" || req.method === "HEAD") {
      return jsonResponse({ ok: true, hint: "POST JSON body from Database Webhook (INSERT on public.chat_messages)" });
    }
    payload = await req.json();
  } catch {
    return jsonResponse({ ok: false, error: "invalid_json_body" }, 400);
  }

  const payloadObj = payload as Record<string, unknown>;

  // ── test-notification helper: POST {"type":"test-notification"} (with the secret header)
  // to verify end-to-end reachability without inserting a chat row. Echoes the payload back
  // and logs it, so you can confirm in the Dashboard logs that requests actually arrive.
  if (payloadObj.type === "test-notification") {
    console.log(
      "[notify-new-message][test-notification] Reached function with valid secret. Payload:",
      JSON.stringify(payloadObj).slice(0, 1000),
    );
    return jsonResponse({ ok: true, test: true, receivedAt: new Date().toISOString(), echo: payloadObj });
  }

  const tableName = typeof payloadObj.table === "string" ? payloadObj.table : "(unknown)";
  const record = extractRecord(payload);
  const direction = resolveChatDirection(record);
  console.log(`[notify-new-message] Trigger fired: table=${tableName} from=${describeSender(record ?? {})} direction=${direction}`);

  // Log the exact push content the recipient will receive (static strings — no chat PHI).
  const previewBody = direction === "to_therapist"
    ? (coerceBool(record?.ai_clinical_alert) ? THERAPIST_ALERT_NOTIFY_BODY : THERAPIST_CHAT_NOTIFY_BODY)
    : CHAT_NOTIFY_BODY;
  const previewUrl = direction === "to_therapist" ? THERAPIST_MESSAGES_PATH : PORTAL_MESSAGES_PATH;
  console.log(
    `[notify-new-message] Valid payload received: message=${pickId(record, ["id"]) ?? "(no id)"} ` +
      `patient=${pickId(record, ["patient_id"]) ?? "(none)"} therapist=${pickId(record, ["therapist_id"]) ?? "(none)"} ` +
      `→ push {title="Physio-Shield", body="${previewBody}", url="${previewUrl}"}`,
  );

  if (direction === "to_therapist") return await notifyTherapist(supabase, record);
  return await notifyPatient(supabase, record);
});

async function notifyPatient(supabase: SupabaseClient, record: Record<string, unknown> | null): Promise<Response> {
  const recipientId = pickId(record, ["patient_id", "recipient_id", "recipientId", "patientId", "to_patient_id"]);
  if (!recipientId) {
    return jsonResponse({ ok: false, error: "missing_recipient_id", hint: "chat_messages row should include patient_id" }, 200);
  }

  const { data: patient, error } = await supabase
    .from("patients")
    .select("id, payload")
    .eq("id", recipientId)
    .maybeSingle();
  if (error) {
    console.error("[notify-new-message] patient lookup failed:", error.code ?? "unknown");
    return jsonResponse({ ok: false, error: "patient_lookup_failed" }, 503);
  }
  if (!patient) return jsonResponse({ ok: false, error: "patient_not_found" }, 200);

  const token = readPushTokenFromPatientPayload(patient.payload);
  if (!hasDeliverableToken(token)) {
    console.log(`[notify-new-message] Tokens resolved: 0 for patient (${recipientId}).`);
    return jsonResponse({ ok: true, sent: false, patientId: recipientId, reason: "no_deliverable_push_token" });
  }

  console.log(`[notify-new-message] Tokens resolved: 1 web_push token for patient(${recipientId}); routing to gateway...`);
  const res = await sendWebPush(token, patient.payload, CHAT_NOTIFY_BODY, {
    data: { url: PORTAL_MESSAGES_PATH },
    tag: "physioshield-chat-message",
  });
  console.log(`[notify-new-message] Gateway response for patient(${recipientId}): ${res.ok ? "sent_ok" : res.detail ?? "failed"}${res.stale ? " [STALE → clearing token]" : ""}`);

  if (!res.ok) {
    if (res.stale) await markPatientPushTokenStaleInPayload(supabase, recipientId, `chat: ${res.detail ?? "stale"}`);
    return jsonResponse({ ok: false, patientId: recipientId, deliveryError: res.detail, stale: res.stale ?? false }, 200);
  }
  return jsonResponse({ ok: true, sent: true, recipient: "patient", patientId: recipientId });
}

type TherapistSubscriptionRow = {
  id: string;
  endpoint: string;
  subscription_data: unknown;
};

async function notifyTherapist(supabase: SupabaseClient, record: Record<string, unknown> | null): Promise<Response> {
  const therapistId = pickId(record, ["therapist_id", "therapistId", "to_therapist_id"]);
  if (!therapistId) {
    return jsonResponse({ ok: false, error: "missing_therapist_id", hint: "chat_messages row should include therapist_id" }, 200);
  }

  const isAiAlert = coerceBool(record?.ai_clinical_alert);
  const notifyBody = isAiAlert ? THERAPIST_ALERT_NOTIFY_BODY : THERAPIST_CHAT_NOTIFY_BODY;
  const notifyExtras = {
    data: { url: THERAPIST_MESSAGES_PATH, intent: isAiAlert ? "clinical_alert" : "chat" },
    tag: isAiAlert ? "physioshield-clinical-alert" : "physioshield-therapist-chat",
  };

  // Multi-device path: one row per registered device in therapist_push_subscriptions.
  const { data: subRows, error: subErr } = await supabase
    .from("therapist_push_subscriptions")
    .select("id, endpoint, subscription_data")
    .eq("user_id", therapistId);

  const tableMissing =
    subErr != null && /therapist_push_subscriptions|relation.*does not exist|schema cache/i.test(subErr.message);
  if (subErr && !tableMissing) {
    console.error("[notify-new-message] therapist subscriptions lookup failed:", subErr.code ?? "unknown");
    return jsonResponse({ ok: false, error: "therapist_subscriptions_lookup_failed" }, 503);
  }
  if (tableMissing) {
    console.warn("[notify-new-message] therapist_push_subscriptions table missing — apply migration 20260610120000. Using legacy profiles path.");
  }

  const devices = ((subRows ?? []) as TherapistSubscriptionRow[]).filter((row) =>
    hasDeliverableToken(row.endpoint ?? "")
  );

  // STRICT if/else: when device rows exist, the legacy profiles.push_token path is NEVER used,
  // so a therapist registered on both paths can never receive duplicate notifications.
  if (devices.length > 0) {
    console.log(`[notify-new-message] Tokens resolved: ${devices.length} device subscription(s) for therapist(${therapistId}); fanning out...`);

    const results = await Promise.allSettled(
      devices.map((row) => sendWebPush(row.endpoint.trim(), row.subscription_data, notifyBody, notifyExtras)),
    );

    let sent = 0;
    const failures: Array<{ endpointId: string; detail?: string; stale: boolean }> = [];
    const cleanups: Promise<void>[] = [];

    results.forEach((settled, i) => {
      const row = devices[i];
      const res: PushSendResult = settled.status === "fulfilled"
        ? settled.value
        : { ok: false, detail: settled.reason instanceof Error ? settled.reason.message : String(settled.reason) };
      if (res.ok) {
        sent++;
        return;
      }
      failures.push({ endpointId: row.id, detail: res.detail, stale: res.stale ?? false });
      if (res.stale) {
        // 410 Gone (and 404/403) — this specific device subscription is dead; delete only its row.
        cleanups.push(deleteStaleTherapistSubscription(supabase, row.id, `chat: ${res.detail ?? "stale"}`));
      }
    });
    await Promise.allSettled(cleanups);

    console.log(`[notify-new-message] Fan-out for therapist(${therapistId}): sent=${sent} failed=${failures.length} total=${devices.length}${failures.some((f) => f.stale) ? " [stale rows deleted]" : ""}`);

    if (sent === 0) {
      return jsonResponse({ ok: false, therapistId, sent, failed: failures.length, total: devices.length, failures }, 200);
    }
    return jsonResponse({ ok: true, recipient: "therapist", therapistId, sent, failed: failures.length, total: devices.length });
  }

  // Legacy single-device fallback: profiles.push_token / push_payload (devices not yet re-registered).
  let profile: Record<string, unknown> | null = null;
  let profileErr: { message: string } | null = null;
  ({ data: profile, error: profileErr } = await supabase
    .from("profiles")
    .select("id, name, push_token, push_payload")
    .eq("id", therapistId)
    .maybeSingle());

  if (profileErr && /push_token|push_payload|column.*does not exist/i.test(profileErr.message)) {
    console.warn("[notify-new-message] profiles push columns missing — apply migration. Falling back.");
    ({ data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("id, name")
      .eq("id", therapistId)
      .maybeSingle());
  }

  if (profileErr) {
    console.error("[notify-new-message] therapist profile lookup failed:", (profileErr as { code?: string }).code ?? "unknown");
    return jsonResponse({ ok: false, error: "therapist_profile_lookup_failed" }, 503);
  }
  if (!profile) return jsonResponse({ ok: false, error: "therapist_not_found" }, 200);

  const token = (profile.push_token as string | null | undefined)?.trim() ?? "";
  if (!hasDeliverableToken(token)) {
    console.log(`[notify-new-message] Tokens resolved: 0 for therapist (${therapistId}) — not registered on any device.`);
    return jsonResponse({ ok: true, sent: false, therapistId, reason: "no_deliverable_push_token" });
  }

  console.log(`[notify-new-message] Tokens resolved: 1 legacy web_push token for therapist(${therapistId}); routing to gateway...`);
  const res = await sendWebPush(token, profile.push_payload, notifyBody, notifyExtras);
  console.log(`[notify-new-message] Gateway response for therapist(${therapistId}): ${res.ok ? "sent_ok" : res.detail ?? "failed"}${res.stale ? " [STALE → clearing token]" : ""}`);

  if (!res.ok) {
    if (res.stale) await markProfilePushTokenStale(supabase, therapistId, `chat: ${res.detail ?? "stale"}`);
    return jsonResponse({ ok: false, therapistId, deliveryError: res.detail, stale: res.stale ?? false }, 200);
  }
  return jsonResponse({ ok: true, sent: true, recipient: "therapist", therapistId });
}
