/**
 * Shared patient push delivery (Expo Push API + Web Push / VAPID).
 * Used by reminder-cron, notify-new-message, and future Edge Functions.
 */
import webPush from "npm:web-push@3.6.7";
import {
  mergePatientPayloadFields,
  stripPushFieldsFromPatientPayload,
} from "./patientPayloadMeta.ts";
import { isWebPushEndpoint } from "./webPushEndpointAllowlist.ts";
import { patientLogRef } from "./reminderEligibility.ts";

export { isWebPushEndpoint } from "./webPushEndpointAllowlist.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/**
 * Result of a single push attempt.
 * `stale === true` means the gateway permanently rejected the registration (VAPID 403 mismatch,
 * 404, 410 Gone, or Expo DeviceNotRegistered) — callers should clear the token so we stop retrying.
 */
export type PushSendResult = {
  ok: boolean;
  detail?: string;
  statusCode?: number;
  stale?: boolean;
};

/** HTTP statuses that mean "this subscription is dead — stop sending to it". */
export function isStaleSubscriptionStatus(status: number | undefined): boolean {
  return status === 403 || status === 404 || status === 410;
}

export function isExpoPushToken(token: string): boolean {
  const t = token.trim();
  return t.startsWith("ExponentPushToken[") || t.startsWith("ExpoPushToken");
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

/** Depth-first search for `webPushSubscription` (or aliases) anywhere in a JSON tree. */
function findWebPushSubscriptionDeep(
  value: unknown,
  depth = 0,
  seen = new Set<unknown>(),
): Record<string, unknown> | null {
  if (depth > 6 || value == null) return null;
  if (seen.has(value)) return null;
  seen.add(value);

  const rec = coerceJsonRecord(value);
  if (!rec) return null;

  for (const key of ["webPushSubscription", "web_push_subscription", "WebPushSubscription"] as const) {
    const raw = rec[key];
    const sub = coerceJsonRecord(raw);
    if (sub && (sub.keys != null || sub.Keys != null || sub.p256dh != null || sub.P256DH != null)) {
      return sub;
    }
  }

  for (const v of Object.values(rec)) {
    if (v != null && typeof v === "object") {
      const found = findWebPushSubscriptionDeep(v, depth + 1, seen);
      if (found) return found;
    }
  }
  return null;
}

async function sendExpoPush(
  token: string,
  body: string,
  title = "Physio-Shield",
): Promise<PushSendResult> {
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
    return { ok: false, detail: text.slice(0, 500), statusCode: r.status };
  }
  try {
    const j = JSON.parse(text) as {
      data?: { status?: string; details?: { error?: string } };
    };
    const st = j.data?.status;
    if (st && st !== "ok") {
      // Expo signals a permanently dead token via DeviceNotRegistered.
      const errCode = j.data?.details?.error ?? "";
      const stale = errCode === "DeviceNotRegistered";
      return { ok: false, detail: text.slice(0, 500), stale };
    }
  } catch {
    /* ignore */
  }
  return { ok: true };
}

function sanitizeVapidSubjectEnv(raw: string | undefined): string {
  let s = (raw ?? "").replace(/^\uFEFF/, "").replace(/[\r\n]+/g, "").trim();
  s = s.replace(/^['"]|['"]$/g, "").trim();
  return s || "mailto:noreply@physioshield.app";
}

let webPushVapidConfigured = false;
/** Resolved VAPID public key actually handed to web-push (and exposed to the client so subscriptions match). */
let resolvedVapidPublicKey = "";

/**
 * Last-resort public key removed — fail closed when WEB_PUSH_VAPID_PUBLIC_KEY is missing
 * so subscriptions never silently pair with the wrong signer.
 */

function normalizeVapidKeyString(raw: string | undefined | null): string {
  return (raw ?? "")
    .replace(/^\uFEFF/, "")
    .replace(/[\r\n\u2028\u2029]+/g, "")
    .replace(/^['"]|['"]$/g, "")
    .replace(/\s+/g, "")
    .trim();
}

/**
 * The canonical public key the server signs with — the client MUST subscribe with these exact bytes
 * or the gateway returns HTTP 403 (VAPID credential mismatch). Served by the `web-push-public-key` function.
 */
export function getConfiguredVapidPublicKey(): string {
  if (resolvedVapidPublicKey) return resolvedVapidPublicKey;
  const envPublic = normalizeVapidKeyString(Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY"));
  return envPublic.length > 40 ? envPublic : "";
}

/** Length + format flags only — never log key material (Iron Rule 1 / secret hygiene). */
function logVapidKeyShapeTelemetry(label: string, key: string): void {
  const len = key.length;
  const flags = {
    hasWhitespace: /\s/.test(key),
    hasSingleQuotes: key.includes("'"),
    hasDoubleQuotes: key.includes('"'),
    hasNewline: /[\r\n\u2028\u2029]/.test(key),
    hasBackslash: key.includes("\\"),
  };
  console.log(
    `patient-push: VAPID ${label} resolved length=${len} formatFlags=`,
    JSON.stringify(flags),
  );
}

function ensureWebPushVapid(): { ok: true } | { ok: false; detail: string } {
  if (webPushVapidConfigured) return { ok: true };

  const ENV_PUBLIC_KEY = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY");
  const envPublicKey = normalizeVapidKeyString(ENV_PUBLIC_KEY);
  const publicKey = envPublicKey.length > 40 ? envPublicKey : "";
  const privateKey = normalizeVapidKeyString(Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY"));

  const subject = sanitizeVapidSubjectEnv(Deno.env.get("WEB_PUSH_VAPID_SUBJECT"));

  if (!publicKey || !privateKey) {
    return {
      ok: false,
      detail:
        "Missing WEB_PUSH_VAPID_PUBLIC_KEY or WEB_PUSH_VAPID_PRIVATE_KEY. Public must match browser subscription key. " +
        "Generate: npx web-push generate-vapid-keys",
    };
  }

  const envPrivateRaw = Deno.env.get("WEB_PUSH_VAPID_PRIVATE_KEY") ?? "";
  console.log(
    "patient-push: ensureWebPushVapid — pre-setVapidDetails telemetry",
    JSON.stringify({
      subjectLength: subject.length,
      envPublicRawLength: ENV_PUBLIC_KEY?.length ?? 0,
      envPrivateRawLength: envPrivateRaw.length,
      resolvedPublicLength: publicKey.length,
      resolvedPrivateLength: privateKey.length,
      // Hardcoded public-key fallback was removed (fail-closed). Keep field for log continuity.
      publicUsedHardcodedFallback: false,
    }),
  );
  logVapidKeyShapeTelemetry("publicKey (resolved)", publicKey);
  logVapidKeyShapeTelemetry("privateKey (resolved)", privateKey);

  try {
    webPush.setVapidDetails(subject, publicKey, privateKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      ok: false,
      detail:
        `${msg} — re-set WEB_PUSH_VAPID_PUBLIC_KEY / WEB_PUSH_VAPID_PRIVATE_KEY without quotes, spaces, or line breaks ` +
        `(PowerShell: supabase secrets set WEB_PUSH_VAPID_PUBLIC_KEY=YourKeyHere)`,
    };
  }

  webPushVapidConfigured = true;
  resolvedVapidPublicKey = publicKey;
  console.log(
    "patient-push: WEB_PUSH_VAPID_PUBLIC_KEY loaded:",
    "length=" + publicKey.length,
    "(must match browser subscription key bytes)",
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

  // (1) Prefer nested `webPushSubscription` (canonical).
  for (const raw of collectNestedSubscriptionRaws(root)) {
    const sub = coerceJsonRecord(raw);
    if (!sub) continue;
    const built = subscriptionObjectFromRecord(sub, tokenEndpoint);
    if (built) {
      if (trimStr(sub.endpoint) && trimStr(sub.endpoint) !== tokenEndpoint) {
        console.warn(
          "patient-push: payload.pushToken endpoint differs from payload.webPushSubscription.endpoint; using pushToken",
        );
      }
      return { endpoint: tokenEndpoint, keys: built.keys };
    }
  }

  // (1b) Deep search — catches webPushSubscription nested under arbitrary patient JSONB keys.
  const deepSub = findWebPushSubscriptionDeep(root);
  if (deepSub) {
    const built = subscriptionObjectFromRecord(deepSub, tokenEndpoint);
    if (built) return { endpoint: tokenEndpoint, keys: built.keys };
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
): Promise<PushSendResult> {
  const title = opts?.expoTitle ?? "Physio-Shield";
  const endpoint = token.trim();

  if (isWebPushEndpoint(endpoint)) {
    // Single parse — `parsedSub` is the ONLY subscription source for this send (never `patientPayload`).
    const parsedSub = tryParseWebPushSubscription(patientPayload, endpoint);
    if (!parsedSub?.keys?.p256dh || !parsedSub.keys.auth) {
      console.log(
        "patient-push: parse miss endpoint=",
        endpoint.slice(0, 48),
        "payloadType=",
        typeof patientPayload,
      );
      // Incomplete registration (missing schema keys) — the client must re-register a full
      // { endpoint, keys } subscription, so flag as stale to trigger cleanup + re-subscribe.
      return {
        ok: false,
        detail: "No valid subscription keys found after parsing",
        stale: true,
      };
    }

    const pushSub = toWebPushLibrarySubscription(parsedSub);
    console.log(
      "patient-push: using parsedSub endpoint=",
      pushSub.endpoint.slice(0, 48),
      "p256dh=",
      pushSub.keys.p256dh ? "FOUND" : "MISSING",
    );
    console.log(
      "FINAL_CHECK: Key p256dh is:",
      pushSub.keys?.p256dh ? "FOUND" : "MISSING",
    );

    const vapid = ensureWebPushVapid();
    if (!vapid.ok) return vapid;

    const notificationBody: Record<string, unknown> = {
      title,
      body: expoBody,
      ...(opts?.webPushPayloadExtras ?? {}),
    };

    try {
      await webPush.sendNotification(pushSub, JSON.stringify(notificationBody), {
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
      return {
        ok: false,
        detail,
        statusCode,
        stale: isStaleSubscriptionStatus(statusCode),
      };
    }
  }

  const r = await sendExpoPush(endpoint, expoBody, title);
  if (!r.ok && r.detail && !r.detail.startsWith("[expo_push]")) {
    return { ...r, detail: `[expo_push] ${r.detail}` };
  }
  return r;
}

/** Minimal Supabase client surface needed to flag a stale push registration. */
type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (
        column: string,
        value: string,
      ) => {
        maybeSingle: () => Promise<{
          data: { payload?: unknown } | null;
          error: { message: string } | null;
        }>;
      };
    };
    update: (values: Record<string, unknown>) => {
      eq: (column: string, value: string) => Promise<{ error: { message: string } | null }>;
    };
  };
};

/**
 * Clears dead push fields inside `patients.payload` after a persistent gateway rejection.
 * The frontend re-registers on the user's next app open.
 */
export async function markPatientPushTokenStale(
  supabase: SupabaseLike,
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
      console.error(
        `patient-push: failed to load payload for stale clear ${patientLogRef(patientId)}: ${fetchErr.message}`,
      );
      return;
    }
    if (!row) {
      console.warn(`patient-push: stale clear skipped — patient ${patientLogRef(patientId)} not found`);
      return;
    }

    const stripped = stripPushFieldsFromPatientPayload(row.payload);
    const merged =
      stripped &&
      mergePatientPayloadFields(stripped, {
        pushLastError: detail.slice(0, 300),
        pushInvalidatedAt: new Date().toISOString(),
      });

    if (!merged) {
      console.error(
        `patient-push: failed to strip push fields from payload for ${patientLogRef(patientId)}`,
      );
      return;
    }

    const { error } = await supabase
      .from("patients")
      .update({ payload: merged })
      .eq("id", patientId);

    if (error) {
      console.error(
        `patient-push: failed to flag stale token for ${patientLogRef(patientId)}: ${error.message}`,
      );
    } else {
      console.log(
        `patient-push: flagged stale push token for ${patientLogRef(patientId)} (cleared payload.pushToken)`,
      );
    }
  } catch (e) {
    console.error(
      `patient-push: exception flagging stale token for ${patientLogRef(patientId)}:`,
      e instanceof Error ? e.message : String(e),
    );
  }
}

/**
 * Clears a dead therapist push registration in `public.profiles` (top-level columns).
 */
export async function markTherapistPushTokenStale(
  supabase: Pick<SupabaseLike, "from">,
  therapistId: string,
  detail: string,
): Promise<void> {
  await markProfilePushTokenStale(supabase, { table: "profiles", id: therapistId, detail });
}

async function markProfilePushTokenStale(
  supabase: Pick<SupabaseLike, "from">,
  opts: { table: string; idColumn?: string; id: string; detail: string },
): Promise<void> {
  const { table, id, detail } = opts;
  const idColumn = opts.idColumn ?? "id";
  try {
    const { error } = await supabase
      .from(table)
      .update({
        push_token: null,
        push_invalidated_at: new Date().toISOString(),
        push_last_error: detail.slice(0, 300),
      })
      .eq(idColumn, id);
    if (error) {
      console.error(
        `patient-push: failed to flag stale token for ${table}.${idColumn}=${id}: ${error.message}`,
      );
    } else {
      console.log(
        `patient-push: flagged stale push token for ${table}.${idColumn}=${id} (cleared push_token). Reason: ${detail.slice(0, 120)}`,
      );
    }
  } catch (e) {
    console.error(
      `patient-push: exception flagging stale token for ${table}.${idColumn}=${id}:`,
      e instanceof Error ? e.message : String(e),
    );
  }
}
