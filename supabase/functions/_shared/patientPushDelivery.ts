/**
 * Shared patient push delivery (Expo Push API + Web Push / VAPID).
 * Used by reminder-cron, notify-new-message, and future Edge Functions.
 */
import webPush from "npm:web-push@3.6.7";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

export function isExpoPushToken(token: string): boolean {
  const t = token.trim();
  return t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken");
}

/** HTTPS PushSubscription endpoints (FCM, Safari / Apple, Firefox autopush, …). */
export function isWebPushEndpoint(token: string): boolean {
  return token.trim().toLowerCase().startsWith("https://");
}

export function hasDeliverableReminderToken(token: string): boolean {
  const t = token.trim();
  return t.length > 0 && (isExpoPushToken(t) || isWebPushEndpoint(t));
}

/**
 * Some DB exports store JSON columns as **text**.
 * Unwrap string → object once (or pass through if already a plain object).
 */
export function coerceJsonRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return null;
    try {
      const parsed = JSON.parse(s) as unknown;
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
    return null;
  }
  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function trimStr(v: unknown): string {
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v).trim();
  return "";
}

async function sendExpoPush(
  token: string,
  body: string,
  title = "Physio-Shield",
): Promise<{ ok: boolean; detail?: string }> {
  const expoAccessToken = Deno.env.get("EXPO_ACCESS_TOKEN")?.trim() ?? "";
  if (!expoAccessToken) {
    return { ok: false, detail: "EXPO_ACCESS_TOKEN secret missing or empty" };
  }

  const r = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-encoding": "gzip, deflate",
      Authorization: `Bearer ${expoAccessToken}`,
    },
    body: JSON.stringify({
      to: token.trim(),
      title,
      body,
      sound: "default",
      priority: "high",
    }),
  });
  const text = await r.text();
  if (!r.ok) {
    return { ok: false, detail: text.slice(0, 500) };
  }
  try {
    const j = JSON.parse(text) as { data?: { status?: string } };
    const st = j.data?.status;
    if (st && st !== "ok") {
      return { ok: false, detail: text.slice(0, 500) };
    }
  } catch {
    /* ignore */
  }
  return { ok: true };
}

/** Strip BOM/quotes/whitespace so dashboard-copied secrets match `web-push` expectations. */
function normalizeVapidKeyEnv(raw: string): string {
  let s = raw.replace(/^\uFEFF/, "").trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\s+/g, "");
}

let webPushVapidConfigured = false;

function ensureWebPushVapid(): { ok: true } | { ok: false; detail: string } {
  if (webPushVapidConfigured) return { ok: true };

  const publicKey = normalizeVapidKeyEnv(Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY") ?? "");
  const privateKey = normalizeVapidKeyEnv(Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") ?? "");
  const subject =
    Deno.env.get("WEB_PUSH_VAPID_SUBJECT")?.trim() || "mailto:noreply@physioshield.app";

  if (!publicKey || !privateKey) {
    return {
      ok: false,
      detail:
        "Missing WEB_PUSH_VAPID_PUBLIC_KEY or WEB_PUSH_VAPID_PRIVATE_KEY. Public must match VITE_WEB_PUSH_VAPID_PUBLIC_KEY. " +
        "Generate: npx web-push generate-vapid-keys",
    };
  }

  webPush.setVapidDetails(subject, publicKey, privateKey);
  webPushVapidConfigured = true;
  return { ok: true };
}

export function parseWebPushSubscriptionFromPayload(
  patientPayload: unknown,
  pushTokenEndpoint: string,
): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const tokenEndpoint = pushTokenEndpoint.trim();

  const root = coerceJsonRecord(patientPayload);
  if (!root) return null;

  const rawSub =
    root.webPushSubscription ??
    root.web_push_subscription ??
    root.WebPushSubscription;

  let sub = coerceJsonRecord(rawSub);

  /** Legacy / mis-synced rows: full PushSubscription JSON stored at payload root (endpoint + keys). */
  if (!sub) {
    const epRoot = trimStr(root.endpoint);
    const keysAtRoot = coerceJsonRecord(root.keys);
    const p256Root =
      keysAtRoot ? trimStr(keysAtRoot.p256dh) || trimStr(keysAtRoot.P256DH) : "";
    const authRoot =
      keysAtRoot ? trimStr(keysAtRoot.auth) || trimStr(keysAtRoot.Auth) : "";
    if (
      epRoot && p256Root && authRoot && isWebPushEndpoint(epRoot)
    ) {
      sub = { endpoint: epRoot, keys: { p256dh: p256Root, auth: authRoot } };
    }
  }

  if (!sub) return null;

  const rawKeys = sub.keys ?? sub.Keys;
  const keysObj = coerceJsonRecord(rawKeys);
  if (!keysObj) return null;

  const p256dh =
    trimStr(keysObj.p256dh) ||
    trimStr(keysObj.P256DH);
  const auth =
    trimStr(keysObj.auth) ||
    trimStr(keysObj.Auth);
  if (!p256dh || !auth) return null;

  const jsonEndpoint = trimStr(sub.endpoint);
  const endpoint = tokenEndpoint || jsonEndpoint;
  if (!endpoint) return null;

  if (jsonEndpoint && tokenEndpoint && jsonEndpoint !== tokenEndpoint) {
    console.warn(
      "patient-push: push_token URL differs from payload.webPushSubscription.endpoint; using push_token",
    );
  }

  return { endpoint, keys: { p256dh, auth } };
}

async function sendWebPushJsonPayload(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; detail?: string }> {
  const vapid = ensureWebPushVapid();
  if (!vapid.ok) return vapid;

  try {
    await webPush.sendNotification(subscription, JSON.stringify(payload), {
      TTL: 86_400,
      urgency: "high",
    });
    return { ok: true };
  } catch (e: unknown) {
    let detail = e instanceof Error ? e.message : String(e);
    if (e && typeof e === "object" && "body" in e) {
      const b = (e as { body?: string }).body;
      if (typeof b === "string" && b.length > 0) detail = b.slice(0, 500);
    }
    const statusCode = (e as { statusCode?: number }).statusCode;
    if (typeof statusCode === "number") detail = `HTTP ${statusCode}: ${detail}`;
    return { ok: false, detail };
  }
}

export type SendPatientPushOptions = {
  expoTitle?: string;
  /** Merged into Web Push JSON body alongside `title` and `body` (e.g. `{ data: { url: '/patient-portal/messages' } }`). */
  webPushPayloadExtras?: Record<string, unknown>;
};

export async function sendPatientReminder(
  token: string,
  expoBody: string,
  patientPayload: unknown,
  opts?: SendPatientPushOptions,
): Promise<{ ok: boolean; detail?: string }> {
  const title = opts?.expoTitle ?? "Physio-Shield";

  if (isWebPushEndpoint(token)) {
    const parsedPayload = coerceJsonRecord(patientPayload);
    console.log("Payload keys detected:", !!parsedPayload?.keys);

    const sub = parseWebPushSubscriptionFromPayload(patientPayload, token);
    if (!sub) {
      return {
        ok: false,
        detail:
          "[web_push_vapid] Web Push requires patients.payload (json/object or JSON string) with webPushSubscription.keys.p256dh and keys.auth. If payload is stored as text, it must parse to an object.",
      };
    }
    const wpPayload: Record<string, unknown> = {
      title,
      body: expoBody,
      ...(opts?.webPushPayloadExtras ?? {}),
    };
    const r = await sendWebPushJsonPayload(sub, wpPayload);
    if (!r.ok && r.detail && !r.detail.startsWith("[web_push_vapid]")) {
      return { ok: false, detail: `[web_push_vapid] ${r.detail}` };
    }
    return r;
  }

  const r = await sendExpoPush(token, expoBody, title);
  if (!r.ok && r.detail && !r.detail.startsWith("[expo_push]")) {
    return { ok: false, detail: `[expo_push] ${r.detail}` };
  }
  return r;
}
