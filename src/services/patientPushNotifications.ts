import { supabase, supabaseAnonKey, supabaseUrl } from '../lib/supabase';
import { getSupabaseAuthSession } from '../lib/supabaseSessionGuard';
import type { Patient } from '../types';

export type WebPushSubscriptionPayload = NonNullable<Patient['webPushSubscription']>;

/**
 * Canonical `{ endpoint, keys: { p256dh, auth } }` for `patients.payload.webPushSubscription`.
 * Subscribe with `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` from the active build (.env at `vite` dev/build time).
 */
export function normalizeCanonicalWebPushSubscription(
  sub: WebPushSubscriptionPayload,
): WebPushSubscriptionPayload {
  const p256 = (sub.keys?.p256dh ?? '').toString().trim();
  const auth = (sub.keys?.auth ?? '').toString().trim();
  const endpoint = (sub.endpoint ?? '').toString().trim();
  return JSON.parse(
    JSON.stringify({
      endpoint,
      keys: { p256dh: p256, auth: auth },
    }),
  ) as WebPushSubscriptionPayload;
}

const PUSH_PROMPT_KEY = 'physioshield_push_permission_prompted_v1';
/** Last VAPID public key used for a successful `pushManager.subscribe` (normalized). Used when `subscription.options.applicationServerKey` is unavailable. */
const VAPID_PUBLIC_KEY_STORAGE_KEY = 'physioshield_web_push_vapid_public_key_v1';

async function requireSupabaseAuthSessionForWrite(scope: string): Promise<boolean> {
  if (!supabase) return false;
  const session = await getSupabaseAuthSession(supabase);
  if (!session) {
    console.warn(`[PhysioShield push] Skipping database persistence (${scope}): no active auth session.`);
    return false;
  }
  return true;
}
/**
 * Last successful PushSubscription JSON (endpoint + keys). If this exists but omits `keys`, we force
 * `unsubscribe` so a fresh `subscribe` repopulates encryption keys for the server.
 */
const WEB_PUSH_SUBSCRIPTION_SNAPSHOT_KEY = 'physioshield_web_push_subscription_snapshot_v1';

function pushSubscriptionJsonLacksKeys(json: unknown): boolean {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return true;
  const keys = (json as { keys?: unknown }).keys;
  if (!keys || typeof keys !== 'object' || Array.isArray(keys)) return true;
  const k = keys as { p256dh?: unknown; auth?: unknown };
  const p256 = typeof k.p256dh === 'string' ? k.p256dh.trim() : '';
  const auth = typeof k.auth === 'string' ? k.auth.trim() : '';
  return !p256 || !auth;
}

/** Serialize PushSubscription for storage + Supabase: `JSON.stringify` ensures a portable plain object with `keys`. */
function subscriptionToPlainPushJson(sub: PushSubscription): WebPushSubscriptionPayload | null {
  try {
    const wire = JSON.stringify(sub.toJSON());
    const json = JSON.parse(wire) as WebPushSubscriptionPayload;
    if (pushSubscriptionJsonLacksKeys(json)) {
      console.warn('[PhysioShield push] PushSubscription.toJSON() missing keys — cannot send encrypted Web Push');
      return null;
    }
    if (!json?.endpoint || typeof json.endpoint !== 'string') return null;
    return normalizeCanonicalWebPushSubscription(json);
  } catch (e) {
    console.warn('[PhysioShield push] subscriptionToPlainPushJson failed:', e);
    return null;
  }
}

function readWebPushSnapshotLacksKeys(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const raw = localStorage.getItem(WEB_PUSH_SUBSCRIPTION_SNAPSHOT_KEY);
    if (raw === null) return false;
    let parsed: unknown = raw;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return true;
    }
    return pushSubscriptionJsonLacksKeys(parsed);
  } catch {
    return false;
  }
}

function writeWebPushSnapshot(json: WebPushSubscriptionPayload): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(WEB_PUSH_SUBSCRIPTION_SNAPSHOT_KEY, JSON.stringify(json));
  } catch {
    /* ignore */
  }
}

function coercePatientPayloadRoot(payload: unknown): Record<string, unknown> | null {
  if (payload == null) return null;
  let p: unknown = payload;
  if (typeof payload === 'string') {
    const s = payload.trim();
    if (!s) return null;
    try {
      p = JSON.parse(s) as unknown;
    } catch {
      return null;
    }
  }
  if (typeof p !== 'object' || p === null || Array.isArray(p)) return null;
  return p as Record<string, unknown>;
}

/** Merge Web Push keys into the existing patient JSON document — never replace the whole payload blindly. */
function mergeWebPushIntoPatientPayload(
  existingPayload: unknown,
  subscription: WebPushSubscriptionPayload,
): Record<string, unknown> | null {
  const base = coercePatientPayloadRoot(existingPayload);
  if (!base || typeof base.id !== 'string' || !base.id.trim()) {
    return null;
  }
  const next = { ...base };
  next.webPushSubscription = JSON.parse(
    JSON.stringify(normalizeCanonicalWebPushSubscription(subscription)),
  ) as Patient['webPushSubscription'];
  return next;
}

function stripWebPushFromPatientPayload(existingPayload: unknown): Record<string, unknown> | null {
  const base = coercePatientPayloadRoot(existingPayload);
  if (!base || typeof base.id !== 'string' || !base.id.trim()) {
    return null;
  }
  delete base.webPushSubscription;
  delete base.web_push_subscription;
  delete base.WebPushSubscription;
  delete base.pushToken;
  delete base.push_token;
  return base;
}

/** Read deliverable push token from `patients.payload` (no top-level column). */
export function readPushTokenFromPatientPayload(payload: unknown): string {
  const root = coercePatientPayloadRoot(payload);
  if (!root) return '';
  const token = root.pushToken ?? root.push_token;
  return typeof token === 'string' ? token.trim() : '';
}

function mergeScalarFieldsIntoPatientPayload(
  existingPayload: unknown,
  fields: Record<string, unknown>,
): Record<string, unknown> | null {
  const base = coercePatientPayloadRoot(existingPayload);
  if (!base || typeof base.id !== 'string' || !base.id.trim()) {
    return null;
  }
  return { ...base, ...fields };
}

async function patchPatientRow(
  patientId: string,
  values: Record<string, unknown>,
): Promise<{ data: { id: string } | null; error: { message: string } | null }> {
  const { data, error } = await supabase!
    .from('patients')
    .update(values)
    .eq('id', patientId)
    .select('id')
    .maybeSingle();
  return { data: data as { id: string } | null, error };
}

function isPatientWebPushHttpsToken(token: string): boolean {
  return token.trim().toLowerCase().startsWith('https://');
}

/**
 * If the DB row has an HTTPS Web Push endpoint but `patients.payload.webPushSubscription` lacks `keys`,
 * refresh from the live `PushSubscription` or run the same path as `forceReregisterPatientWebPush`.
 */
export async function syncWebPushDatabasePayloadIfStale(patientId: string): Promise<void> {
  if (!supabase || typeof window === 'undefined') return;
  if (!(await requireSupabaseAuthSessionForWrite('syncWebPushDatabasePayloadIfStale'))) return;
  if (getNativeExpoPushTokenSync()) return;

  const { data: row, error } = await supabase
    .from('patients')
    .select('payload')
    .eq('id', patientId)
    .maybeSingle();

  if (error || !row) return;

  const token = readPushTokenFromPatientPayload(row.payload);
  if (!isPatientWebPushHttpsToken(token)) return;

  const root = coercePatientPayloadRoot(row.payload);
  const rawSub = root?.webPushSubscription;
  const dbSub =
    rawSub && typeof rawSub === 'object' && !Array.isArray(rawSub) ? rawSub : null;

  const dbEndpoint =
    dbSub && typeof (dbSub as { endpoint?: unknown }).endpoint === 'string'
      ? (dbSub as { endpoint: string }).endpoint.trim()
      : '';
  const lacksKeys = pushSubscriptionJsonLacksKeys(dbSub);
  // The Edge Function logs when payload.pushToken and webPushSubscription.endpoint diverge
  // and would encrypt with mismatched keys — re-sync both from the live browser registration.
  const endpointDrift = dbEndpoint !== token;
  if (!lacksKeys && !endpointDrift) return;

  console.warn(
    lacksKeys
      ? '[PhysioShield push] patients.payload.webPushSubscription missing encryption keys — repairing for Web Push'
      : '[PhysioShield push] patients.payload.webPushSubscription endpoint differs from payload.pushToken — re-syncing both fields',
  );

  try {
    const sw = await navigator.serviceWorker.ready;
    const live = await sw.pushManager.getSubscription();
    if (live) {
      const plain = subscriptionToPlainPushJson(live);
      if (plain) {
        await persistPatientPushProfile({
          patientId,
          token: plain.endpoint,
          webPushSubscription: plain,
        });
        return;
      }
    }
  } catch (e) {
    console.warn('[PhysioShield push] DB repair from live subscription failed:', e);
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  if (!(await resolveVapidPublicKey())) return;

  const regResult = await forceReregisterPatientWebPush(patientId);
  if (!regResult.ok) return;
  await persistPatientPushProfile({
    patientId,
    token: regResult.token,
    webPushSubscription: regResult.webPushSubscription,
  });
}

function getNativeExpoPushTokenSync(): string | null {
  try {
    const g = globalThis as unknown as {
      __EXPO_PUSH_TOKEN__?: string;
      expo?: { getPushToken?: () => string | null };
    };
    if (typeof g.__EXPO_PUSH_TOKEN__ === 'string' && g.__EXPO_PUSH_TOKEN__.trim().length > 0) {
      return g.__EXPO_PUSH_TOKEN__.trim();
    }
    const t = g.expo?.getPushToken?.();
    if (typeof t === 'string' && t.trim().length > 0) return t.trim();
  } catch {
    /* ignore */
  }
  return null;
}

function buildWebPlaceholderToken(patientId: string): string {
  const key = 'physioshield_web_push_device_id_v1';
  let id = '';
  try {
    id = localStorage.getItem(key) ?? '';
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(key, id);
    }
  } catch {
    id = `mem-${patientId}-${Date.now()}`;
  }
  return `web-notify:${id}`;
}

/**
 * Normalize VAPID public key from `import.meta.env`: trim, strip a single pair of wrapping quotes,
 * and remove stray whitespace/newlines (common when copying from dashboards or multi-line .env).
 */
function normalizeVapidPublicKeyString(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let s = raw.replace(/^\uFEFF/, '').trim();
  if (
    (s.startsWith('"') && s.endsWith('"')) ||
    (s.startsWith("'") && s.endsWith("'"))
  ) {
    s = s.slice(1, -1).trim();
  }
  return s.replace(/\s+/g, '');
}

/**
 * Browser env: `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` (or `VITE_VAPID_PUBLIC_KEY`) must be the **same**
 * public key bytes as Edge Function secret `WEB_PUSH_VAPID_PUBLIC_KEY` (pair with `WEB_PUSH_VAPID_PRIVATE_KEY`).
 */
function getVapidPublicKey(): string {
  const raw =
    import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY ?? import.meta.env.VITE_VAPID_PUBLIC_KEY;
  return normalizeVapidPublicKeyString(raw);
}

/** In-memory cache for the server-validated VAPID public key (per page load). */
let serverVapidPublicKeyCache: string | null = null;

function getWebPushPublicKeyUrl(): string | null {
  if (!supabaseUrl) return null;
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/web-push-public-key`;
}

/**
 * Fetches the canonical VAPID public key the Edge Functions actually sign with, so the browser
 * subscribes with matching bytes (prevents HTTP 403 "VAPID credentials do not correspond").
 * Falls back to the build-time `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` if the endpoint is unreachable.
 */
async function fetchServerVapidPublicKey(): Promise<string> {
  if (serverVapidPublicKeyCache) return serverVapidPublicKeyCache;
  const url = getWebPushPublicKeyUrl();
  if (!url || !supabaseAnonKey) return '';
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { apikey: supabaseAnonKey, Authorization: `Bearer ${supabaseAnonKey}` },
    });
    if (!res.ok) {
      console.warn('[PhysioShield push] web-push-public-key HTTP', res.status);
      return '';
    }
    const json = (await res.json()) as { ok?: boolean; publicKey?: unknown };
    const key = normalizeVapidPublicKeyString(json.publicKey);
    if (json.ok && key.length > 40) {
      serverVapidPublicKeyCache = key;
      return key;
    }
    console.warn('[PhysioShield push] web-push-public-key returned no usable key');
    return '';
  } catch (e) {
    console.warn('[PhysioShield push] web-push-public-key fetch failed:', e);
    return '';
  }
}

/**
 * Single source of truth for the VAPID public key used to subscribe: server-validated key first,
 * build-time env as fallback. Logs when the two disagree (a classic 403 root cause).
 */
async function resolveVapidPublicKey(): Promise<string> {
  const server = await fetchServerVapidPublicKey();
  const envKey = getVapidPublicKey();
  if (server) {
    if (envKey && envKey !== server) {
      console.warn(
        '[PhysioShield push] VITE_WEB_PUSH_VAPID_PUBLIC_KEY differs from server key — using server key to avoid 403 mismatch.',
      );
    }
    return server;
  }
  return envKey;
}

/**
 * VAPID / Web Push: URL-safe base64 (RFC 4648 §5) → `Uint8Array` for
 * `pushManager.subscribe({ applicationServerKey })`.
 *
 * Order: strip whitespace → URL-safe → standard base64 (`-`/`_` → `+`/`/`) → pad to multiple of 4 → `atob` → bytes.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  let base64 = base64String.replace(/\s+/g, '').trim();
  base64 = base64.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4 !== 0) {
    base64 += '=';
  }
  const binary = atob(base64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Uncompressed P-256 public key for Web Push VAPID (`04 || X || Y`). */
const VAPID_APPLICATION_SERVER_KEY_LENGTH = 65;

function uint8ArraysEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

/**
 * Returns true if this subscription was created with the same VAPID applicationServerKey
 * as we use now. If the key pair was rotated server-side but the browser kept an old
 * subscription, this is false → caller should unsubscribe and subscribe again (avoids HTTP 403).
 */
function subscriptionMatchesCurrentVapid(
  sub: PushSubscription,
  expectedApplicationServerKey: Uint8Array,
  normalizedPublicKey: string,
): boolean {
  const rawOpt = sub.options?.applicationServerKey;
  if (rawOpt != null && typeof rawOpt !== 'undefined') {
    const actual = new Uint8Array(rawOpt as ArrayBuffer);
    if (actual.length === expectedApplicationServerKey.length) {
      return uint8ArraysEqual(actual, expectedApplicationServerKey);
    }
    return false;
  }
  try {
    const stored = localStorage.getItem(VAPID_PUBLIC_KEY_STORAGE_KEY);
    return Boolean(stored && stored === normalizedPublicKey);
  } catch {
    return false;
  }
}

/**
 * After notification permission is granted: register SW + `pushManager.subscribe` (VAPID).
 */
export async function subscribeWebPushAfterPermissionGranted(): Promise<WebPushSubscriptionPayload | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }

  const vapidPublic = await resolveVapidPublicKey();
  if (!vapidPublic) {
    console.warn(
      '[PhysioShield push] No VAPID public key (server endpoint + VITE_WEB_PUSH_VAPID_PUBLIC_KEY both empty) — cannot call pushManager.subscribe'
    );
    return null;
  }

  try {
    await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    const reg = await navigator.serviceWorker.ready;
    if (!reg.pushManager) {
      console.warn('[PhysioShield push] pushManager missing on registration');
      return null;
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidPublic);
    if (applicationServerKey.length !== VAPID_APPLICATION_SERVER_KEY_LENGTH) {
      throw new Error(
        `VAPID public key must decode to exactly ${VAPID_APPLICATION_SERVER_KEY_LENGTH} bytes (uncompressed P-256: 0x04 || X || Y); decoded length is ${applicationServerKey.length}. ` +
          'Confirm VITE_WEB_PUSH_VAPID_PUBLIC_KEY (or VITE_VAPID_PUBLIC_KEY) is the URL-safe base64 **public** key from web-push generateVAPIDKeys (not the private key) and is not truncated.'
      );
    }

    let sub = await reg.pushManager.getSubscription();

    const snapshotStale = readWebPushSnapshotLacksKeys();
    const liveJson = sub ? subscriptionToPlainPushJson(sub) : null;
    if (snapshotStale || (sub && !liveJson)) {
      console.warn(
        '[PhysioShield push] Stored subscription snapshot missing encryption keys and/or live subscription incomplete — forcing unsubscribe + re-subscribe.',
      );
      if (sub) {
        try {
          await sub.unsubscribe();
        } catch (unsubErr) {
          console.warn('[PhysioShield push] unsubscribe() (key refresh) failed:', unsubErr);
        }
      }
      sub = null;
      try {
        localStorage.removeItem(WEB_PUSH_SUBSCRIPTION_SNAPSHOT_KEY);
        localStorage.removeItem(VAPID_PUBLIC_KEY_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }

    if (sub && !subscriptionMatchesCurrentVapid(sub, applicationServerKey, vapidPublic)) {
      console.warn(
        '[PhysioShield push] Existing subscription does not match current VAPID public key — unsubscribing and re-subscribing.'
      );
      try {
        await sub.unsubscribe();
      } catch (unsubErr) {
        console.warn('[PhysioShield push] unsubscribe() failed:', unsubErr);
      }
      sub = null;
      try {
        localStorage.removeItem(VAPID_PUBLIC_KEY_STORAGE_KEY);
      } catch {
        /* ignore */
      }
    }

    if (!sub) {
      try {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey as BufferSource,
        });
      } catch (subscribeErr) {
        console.error('Push: subscribe() threw:', subscribeErr);
        throw subscribeErr;
      }
    }

    try {
      localStorage.setItem(VAPID_PUBLIC_KEY_STORAGE_KEY, vapidPublic);
    } catch {
      /* ignore */
    }

    const json = subscriptionToPlainPushJson(sub);
    if (!json) {
      console.warn('Push: subscription JSON missing endpoint or encryption keys', sub?.toJSON?.());
      return null;
    }
    writeWebPushSnapshot(json);
    return json;
  } catch (e) {
    console.error('Push: subscribe flow failed (exact error):', e);
    return null;
  }
}

async function subscribeWebPushAfterPermissionGrantedWithRetries(
  attempts = 4,
  delayMs = 400
): Promise<WebPushSubscriptionPayload | null> {
  for (let i = 0; i < attempts; i++) {
    const json = await subscribeWebPushAfterPermissionGranted();
    if (json?.endpoint) return json;
    if (i + 1 < attempts) {
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  console.warn('Push: all subscribe retries exhausted without a subscription');
  return null;
}

export type PushRegisterResult =
  | {
      ok: true;
      token: string;
      permission: NotificationPermission | 'unsupported';
      webPushSubscription?: WebPushSubscriptionPayload;
    }
  | { ok: false; reason: string };

/**
 * Requests notification permission. On web with `VITE_WEB_PUSH_VAPID_PUBLIC_KEY` set and permission granted,
 * registers the SW, waits for readiness, and requires a real PushSubscription (retries). Without VAPID, may fall back
 * to a placeholder token when subscribe is unavailable.
 */
export async function registerPatientPushForSupabase(patientId: string): Promise<PushRegisterResult> {
  const native = getNativeExpoPushTokenSync();
  if (native) {
    return { ok: true, token: native, permission: 'granted' };
  }

  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    return { ok: false, reason: 'notifications_unsupported' };
  }

  let prompted = false;
  try {
    prompted = localStorage.getItem(PUSH_PROMPT_KEY) === '1';
  } catch {
    prompted = false;
  }

  let permission = Notification.permission;
  if (!prompted && permission === 'default') {
    try {
      localStorage.setItem(PUSH_PROMPT_KEY, '1');
    } catch {
      /* ignore */
    }
    permission = await Notification.requestPermission();
  } else if (!prompted) {
    try {
      localStorage.setItem(PUSH_PROMPT_KEY, '1');
    } catch {
      /* ignore */
    }
  }

  if (permission === 'denied') {
    return { ok: false, reason: 'permission_denied' };
  }

  const vapidPublic = await resolveVapidPublicKey();

  let webPushSubscription: WebPushSubscriptionPayload | undefined;
  let token: string;

  if (permission === 'granted') {
    if (vapidPublic) {
      const subJson = await subscribeWebPushAfterPermissionGrantedWithRetries();
      if (!subJson?.endpoint) {
        console.warn(
          '[PhysioShield push] VAPID key is set but pushManager.subscribe did not produce a subscription'
        );
        return { ok: false, reason: 'web_push_subscribe_failed' };
      }
      webPushSubscription = subJson;
      token = subJson.endpoint;
    } else {
      const subJson = await subscribeWebPushAfterPermissionGranted();
      if (subJson?.endpoint) {
        webPushSubscription = subJson;
        token = subJson.endpoint;
      } else {
        token = buildWebPlaceholderToken(patientId);
      }
    }
  } else {
    token = buildWebPlaceholderToken(patientId);
  }

  return {
    ok: true,
    token,
    permission: permission === 'granted' ? 'granted' : 'default',
    webPushSubscription: webPushSubscription
      ? normalizeCanonicalWebPushSubscription(webPushSubscription)
      : undefined,
  };
}

/**
 * Clears `pushToken` and all Web Push fragments from `patients.payload` (other payload keys preserved).
 * Call before force re-register so no stale subscription JSON remains in Supabase.
 */
export async function clearPatientWebPushFieldsInDatabase(patientId: string): Promise<{
  ok: boolean;
  message?: string;
}> {
  if (!supabase) {
    return { ok: false, message: 'supabase_not_configured' };
  }
  if (!(await requireSupabaseAuthSessionForWrite('clearPatientWebPushFieldsInDatabase'))) {
    return { ok: false, message: 'auth_session_missing' };
  }
  const { data: row, error: fetchErr } = await supabase
    .from('patients')
    .select('payload')
    .eq('id', patientId)
    .maybeSingle();

  if (fetchErr) return { ok: false, message: fetchErr.message };
  if (!row) return { ok: false, message: 'patient_not_found_or_unauthorized' };

  const clearedPayload = stripWebPushFromPatientPayload(row.payload);
  if (!clearedPayload) {
    return { ok: false, message: 'patient_payload_unreadable' };
  }

  const { data: updated, error } = await patchPatientRow(patientId, { payload: clearedPayload });

  if (error) return { ok: false, message: error.message };
  if (!updated?.id) {
    return {
      ok: false,
      message:
        'patient_update_returned_no_rows (check RLS and patients.auth_user_id matches the signed-in user)',
    };
  }
  return { ok: true };
}

/**
 * Clears DB push row + local SW subscription, then re-subscribes and persists canonical `webPushSubscription`.
 */
export async function forceReregisterPatientWebPushClearStaleAndPersist(patientId: string): Promise<{
  register: PushRegisterResult;
  persist: { ok: boolean; message?: string };
  clear: { ok: boolean; message?: string };
}> {
  const clear = await clearPatientWebPushFieldsInDatabase(patientId);
  const register = await forceReregisterPatientWebPush(patientId);
  if (!register.ok) {
    return { clear, register, persist: { ok: false, message: 'register_failed' } };
  }
  const persist = await persistPatientPushProfile({
    patientId,
    token: register.token,
    webPushSubscription: register.webPushSubscription,
  });
  return { clear, register, persist };
}

/**
 * Dev / migration: drop SW push subscription + local snapshot so the next subscribe persists
 * full JSON (endpoint + keys) to `patients.payload.webPushSubscription`.
 */
export async function forceReregisterPatientWebPush(patientId: string): Promise<PushRegisterResult> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return { ok: false, reason: 'notifications_unsupported' };
  }
  try {
    localStorage.removeItem(WEB_PUSH_SUBSCRIPTION_SNAPSHOT_KEY);
    localStorage.removeItem(VAPID_PUBLIC_KEY_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  try {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await existing.unsubscribe();
    }
  } catch (e) {
    console.warn('[PhysioShield push] forceReregister: unsubscribe failed', e);
  }
  return registerPatientPushForSupabase(patientId);
}

/** Dev / debug: sequential alerts + Notification (isolates wiring vs browser policy). */
export async function showPhysioshieldTestNotification(): Promise<void> {
  if (typeof window === 'undefined') return;

  globalThis.alert('Button Clicked!');

  if (!('Notification' in globalThis)) {
    console.warn('[Physio-Shield Test Push] Notification API unavailable — likely browser restriction');
    globalThis.alert('Notification API not available in this context.');
    return;
  }

  const permission = await Notification.requestPermission();
  globalThis.alert('Permission: ' + permission);

  if (permission === 'granted') {
    await subscribeWebPushAfterPermissionGranted();
    try {
      // eslint-disable-next-line no-new
      new Notification('Test', { body: 'It works!' });
    } catch (e) {
      console.error('[Physio-Shield Test Push] new Notification() failed — browser/OS restriction?', e);
    }
  } else {
    console.warn('[Physio-Shield Test Push] permission not granted');
  }
}

export async function persistPatientPushProfile(params: {
  patientId: string;
  token: string;
  webPushSubscription?: WebPushSubscriptionPayload;
}): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) {
    return { ok: false, message: 'supabase_not_configured' };
  }
  if (!(await requireSupabaseAuthSessionForWrite('persistPatientPushProfile'))) {
    return { ok: false, message: 'auth_session_missing' };
  }
  const tz =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
      : 'UTC';

  // Edge Functions read pushToken + webPushSubscription from patients.payload. Keep both in sync
  // so encryption keys always match the canonical endpoint.
  const canonicalSubscription = params.webPushSubscription
    ? normalizeCanonicalWebPushSubscription(params.webPushSubscription)
    : undefined;
  const canonicalEndpoint = canonicalSubscription?.endpoint?.trim();
  const tokenToPersist =
    canonicalEndpoint && isPatientWebPushHttpsToken(canonicalEndpoint)
      ? canonicalEndpoint
      : params.token;

  const { data: row, error: fetchErr } = await supabase
    .from('patients')
    .select('payload')
    .eq('id', params.patientId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, message: fetchErr.message };
  }
  if (!row) {
    return { ok: false, message: 'patient_not_found_or_unauthorized' };
  }

  const payloadFields: Record<string, unknown> = {
    pushToken: tokenToPersist,
    reminderTimezone: tz,
    lastLoginAt: new Date().toISOString(),
  };

  let mergedPayload = row.payload;
  if (canonicalSubscription) {
    mergedPayload =
      mergeWebPushIntoPatientPayload(row.payload, canonicalSubscription) ?? mergedPayload;
  }
  mergedPayload = mergeScalarFieldsIntoPatientPayload(mergedPayload, payloadFields);

  if (!mergedPayload) {
    return { ok: false, message: 'patient_payload_unreadable' };
  }

  const { data: updated, error } = await patchPatientRow(params.patientId, {
    payload: mergedPayload,
  });

  if (error) {
    return { ok: false, message: error.message };
  }
  if (!updated?.id) {
    return {
      ok: false,
      message:
        'patient_update_returned_no_rows (check RLS and patients.auth_user_id matches the signed-in user)',
    };
  }
  return { ok: true };
}

const lastLoginWriteByPatient = new Map<string, number>();
const lastSeenPingInFlightByPatient = new Set<string>();

const PATIENT_LAST_SEEN_PING_LS_PREFIX = 'guardian-patient-last-seen-ping-v1:';

function lastSeenPingStorageKey(patientId: string): string {
  return `${PATIENT_LAST_SEEN_PING_LS_PREFIX}${patientId.trim()}`;
}

function readLastSeenPingMs(patientId: string): number {
  try {
    const raw = localStorage.getItem(lastSeenPingStorageKey(patientId));
    if (!raw) return 0;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
  } catch {
    return 0;
  }
}

function writeLastSeenPingMs(patientId: string, ms: number): void {
  try {
    localStorage.setItem(lastSeenPingStorageKey(patientId), String(ms));
  } catch {
    /* private mode / quota — in-memory throttle still applies */
  }
}

async function touchPatientPayloadTimestampField(
  patientId: string,
  field: 'lastLoginAt' | 'lastWorkoutAt',
  scope: string,
): Promise<void> {
  const nowIso = new Date().toISOString();
  const { data: row, error: fetchErr } = await supabase!
    .from('patients')
    .select('payload')
    .eq('id', patientId)
    .maybeSingle();

  if (fetchErr) {
    if (import.meta.env.DEV) {
      console.warn(`[${scope}] fetch`, fetchErr.message);
    }
    return;
  }
  if (!row) return;

  const merged = mergeScalarFieldsIntoPatientPayload(row.payload, {
    [field]: nowIso,
  });
  if (!merged) {
    if (import.meta.env.DEV) {
      console.warn(`[${scope}] patient payload unreadable`);
    }
    return;
  }

  const rowPatch: Record<string, unknown> = {
    payload: merged,
    updated_at: nowIso,
  };

  const { error } = await supabase!.from('patients').update(rowPatch).eq('id', patientId);
  if (error && import.meta.env.DEV) {
    console.warn(`[${scope}]`, error.message);
  }
}

/**
 * Throttled heartbeat for reminder "momentum" logic (stored in `patients.payload.lastLoginAt`).
 */
export async function touchPatientLastLoginThrottled(
  patientId: string,
  minIntervalMs = 120_000
): Promise<void> {
  try {
    if (!supabase) return;
    if (!(await requireSupabaseAuthSessionForWrite('touchPatientLastLogin'))) return;

    const now = Date.now();
    const prev = lastLoginWriteByPatient.get(patientId) ?? 0;
    if (now - prev < minIntervalMs) return;
    lastLoginWriteByPatient.set(patientId, now);

    await touchPatientPayloadTimestampField(patientId, 'lastLoginAt', 'touchPatientLastLoginThrottled');
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[touchPatientLastLoginThrottled] catch', e);
    }
  }
}

/**
 * Portal open / hydration "last seen" ping — merges `payload.lastLoginAt` and bumps
 * `updated_at` so the therapist roster reflects portal visits without a password re-login.
 *
 * Uses localStorage + in-memory gates (default 1 h) to avoid writes on every remount.
 * Failures (missing session, RLS) are non-blocking and only logged in DEV.
 */
export async function touchPatientPortalLastSeenThrottled(
  patientId: string,
  minIntervalMs = 60 * 60 * 1000
): Promise<void> {
  const id = patientId.trim();
  if (!id) return;

  try {
    if (!supabase) return;

    const now = Date.now();
    const lastLs = readLastSeenPingMs(id);
    const lastMem = lastLoginWriteByPatient.get(`lastSeen:${id}`) ?? 0;
    if (now - lastLs < minIntervalMs && now - lastMem < minIntervalMs) {
      return;
    }
    if (lastSeenPingInFlightByPatient.has(id)) return;

    if (!(await requireSupabaseAuthSessionForWrite('touchPatientPortalLastSeen'))) return;

    writeLastSeenPingMs(id, now);
    lastLoginWriteByPatient.set(`lastSeen:${id}`, now);
    lastSeenPingInFlightByPatient.add(id);

    await touchPatientPayloadTimestampField(id, 'lastLoginAt', 'touchPatientPortalLastSeen');
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[touchPatientPortalLastSeenThrottled] catch', e);
    }
  } finally {
    lastSeenPingInFlightByPatient.delete(id);
  }
}

/** @deprecated Use touchPatientLastLoginThrottled */
export const touchPatientLastActivityThrottled = touchPatientLastLoginThrottled;

/** Stamp `payload.lastWorkoutAt` when patient completes an exercise (portal auth session). */
export async function touchPatientLastWorkout(patientId: string): Promise<void> {
  try {
    if (!supabase) return;
    if (!(await requireSupabaseAuthSessionForWrite('touchPatientLastWorkout'))) return;
    await touchPatientPayloadTimestampField(patientId, 'lastWorkoutAt', 'touchPatientLastWorkout');
  } catch (e) {
    if (import.meta.env.DEV) {
      console.warn('[touchPatientLastWorkout] catch', e);
    }
  }
}

export { registerPatientPushForSupabase as registerPushNotification };
