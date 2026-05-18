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

/** `keys` object (handles JSON string via {@link coerceJsonRecord}). */
function parseKeysMaterial(rawKeys: unknown): { p256dh: string; auth: string } | null {
  const obj = coerceJsonRecord(rawKeys);
  if (!obj) return null;
  const p256dh = trimStr(obj.p256dh) || trimStr(obj.P256DH);
  const auth = trimStr(obj.auth) || trimStr(obj.Auth);
  if (!p256dh || !auth) return null;
  return { p256dh, auth };
}

function subscriptionObjectFromRecord(
  sub: Record<string, unknown>,
  pushTokenEndpoint: string,
): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const token = pushTokenEndpoint.trim();
  const jsonEp = trimStr(sub.endpoint);
  const endpoint = (token && isWebPushEndpoint(token)) ? token : jsonEp;
  if (!endpoint || !isWebPushEndpoint(endpoint)) return null;

  const nested = parseKeysMaterial(sub.keys ?? sub.Keys);
  if (nested) return { endpoint, keys: nested };

  const flatP256 = trimStr(sub.p256dh) || trimStr(sub.P256DH);
  const flatAuth = trimStr(sub.auth) || trimStr(sub.Auth);
  if (flatP256 && flatAuth) return { endpoint, keys: { p256dh: flatP256, auth: flatAuth } };

  return null;
}

function collectNestedSubscriptionRaws(root: Record<string, unknown>): unknown[] {
  const out: unknown[] = [
    root.webPushSubscription,
    root.web_push_subscription,
    root.WebPushSubscription,
  ];
  const innerPayload = coerceJsonRecord(root.payload);
  if (innerPayload) {
    out.push(
      innerPayload.webPushSubscription,
      innerPayload.web_push_subscription,
      innerPayload.WebPushSubscription,
    );
  }
  return out;
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
  console.log(
    "patient-push: WEB_PUSH_VAPID_PUBLIC_KEY loaded:",
    "length=" + publicKey.length,
    "prefix=" + publicKey.slice(0, 8),
    "(must match browser VITE_WEB_PUSH_VAPID_PUBLIC_KEY bytes)",
  );
  return { ok: true };
}

/**
 * Minimal plain object for `web-push.sendNotification` — only `endpoint` and `keys`.
 * Never pass the whole patient `payload` / `patientPayload` here.
 */
export function toWebPushLibrarySubscription(
  parsed: { endpoint: string; keys: { p256dh: string; auth: string } },
): { endpoint: string; keys: { p256dh: string; auth: string } } {
  return JSON.parse(
    JSON.stringify({
      endpoint: String(parsed.endpoint).trim(),
      keys: {
        p256dh: String(parsed.keys.p256dh).trim(),
        auth: String(parsed.keys.auth).trim(),
      },
    }),
  );
}

export function parseWebPushSubscriptionFromPayload(
  patientPayload: unknown,
  pushTokenEndpoint: string,
): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const tokenEndpoint = pushTokenEndpoint.trim();
  if (!tokenEndpoint || !isWebPushEndpoint(tokenEndpoint)) return null;

  /** `coerceJsonRecord` already applies `JSON.parse` when `patients.payload` is stored as a string. */
  const root = coerceJsonRecord(patientPayload);
  if (!root) return null;

  // (1) Prefer nested `webPushSubscription` (canonical) so we never use an unrelated root `keys` by mistake.
  for (const raw of collectNestedSubscriptionRaws(root)) {
    const sub = coerceJsonRecord(raw);
    if (!sub) continue;
    const built = subscriptionObjectFromRecord(sub, tokenEndpoint);
    if (built) {
      if (trimStr(sub.endpoint) && trimStr(sub.endpoint) !== tokenEndpoint) {
        console.warn(
          "patient-push: push_token endpoint differs from payload.webPushSubscription.endpoint; using push_token",
        );
      }
      return { endpoint: tokenEndpoint, keys: built.keys };
    }
  }

  // (2) Root-level `payload.keys` + optional `payload.endpoint` (legacy mirror).
  const rootKeys = parseKeysMaterial(root.keys);
  const rootEp = trimStr(root.endpoint);
  if (rootKeys) {
    if (rootEp && isWebPushEndpoint(rootEp)) {
      return { endpoint: tokenEndpoint || rootEp, keys: rootKeys };
    }
    return { endpoint: tokenEndpoint, keys: rootKeys };
  }

  // (3) Legacy: subscription-shaped object at root without `webPushSubscription` wrapper.
  const rootAsSub = subscriptionObjectFromRecord(root, tokenEndpoint);
  if (rootAsSub) return { endpoint: tokenEndpoint, keys: rootAsSub.keys };

  return null;
}

/**
 * Try several shapes callers may pass (column JSON, `{ payload: ... }` wrapper, double-nested payload).
 * Sending uses **only** a successful parse — never raw `patientPayload` for encryption.
 */
export function tryParseWebPushSubscription(
  patientPayload: unknown,
  pushTokenEndpoint: string,
): { endpoint: string; keys: { p256dh: string; auth: string } } | null {
  const candidates: unknown[] = [patientPayload];
  const root = coerceJsonRecord(patientPayload);
  if (root && root.payload !== undefined) {
    candidates.push(root.payload);
  }
  const inner = root ? coerceJsonRecord(root.payload) : null;
  if (inner && inner.payload !== undefined) {
    candidates.push(inner.payload);
  }

  for (const cand of candidates) {
    const p = parseWebPushSubscriptionFromPayload(cand, pushTokenEndpoint);
    if (p != null) return p;
  }
  return null;
}

async function sendWebPushJsonPayload(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: Record<string, unknown>,
): Promise<{ ok: boolean; detail?: string }> {
  const vapid = ensureWebPushVapid();
  if (!vapid.ok) return vapid;

  const pushSub = toWebPushLibrarySubscription(subscription);

  try {
    console.log(
      "FINAL_CHECK: Key p256dh is:",
      pushSub.keys?.p256dh ? "FOUND" : "MISSING",
    );
    await webPush.sendNotification(pushSub, JSON.stringify(payload), {
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
    const parsedSubscription = tryParseWebPushSubscription(patientPayload, token);
    const root = coerceJsonRecord(patientPayload);
    console.log("Payload keys detected:", !!(root && parseKeysMaterial(root.keys)));
    console.log(
      "webPushSubscription.keys detected:",
      !!(parsedSubscription?.keys?.p256dh && parsedSubscription.keys.auth),
    );

    if (parsedSubscription == null) {
      return {
        ok: false,
        detail:
          "[web_push_vapid] Web Push requires patients.payload (json/object or JSON string) with webPushSubscription.keys.p256dh and keys.auth. If payload is stored as text, it must parse to an object.",
      };
    }

    /** Only this minimal object is passed to `web-push` — never `patientPayload`. */
    const webPushSubscriptionForSend = toWebPushLibrarySubscription(parsedSubscription);
    console.log(
      "patient-push: send target endpoint prefix:",
      webPushSubscriptionForSend.endpoint.slice(0, 48),
    );

    const wpPayload: Record<string, unknown> = {
      title,
      body: expoBody,
      ...(opts?.webPushPayloadExtras ?? {}),
    };
    const r = await sendWebPushJsonPayload(webPushSubscriptionForSend, wpPayload);
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
