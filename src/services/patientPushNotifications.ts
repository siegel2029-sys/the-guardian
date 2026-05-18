import { supabase } from '../lib/supabase';
import type { Patient } from '../types';

const PUSH_PROMPT_KEY = 'physioshield_push_permission_prompted_v1';
/** Last VAPID public key used for a successful `pushManager.subscribe` (normalized). Used when `subscription.options.applicationServerKey` is unavailable. */
const VAPID_PUBLIC_KEY_STORAGE_KEY = 'physioshield_web_push_vapid_public_key_v1';

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

function getVapidPublicKey(): string {
  const raw =
    import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY ?? import.meta.env.VITE_VAPID_PUBLIC_KEY;
  return normalizeVapidPublicKeyString(raw);
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

export type WebPushSubscriptionPayload = NonNullable<Patient['webPushSubscription']>;

/**
 * After notification permission is granted: register SW + `pushManager.subscribe` (VAPID).
 */
export async function subscribeWebPushAfterPermissionGranted(): Promise<WebPushSubscriptionPayload | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push: subscribeWebPush — unsupported (no window / serviceWorker / PushManager)');
    return null;
  }

  const vapidPublic = getVapidPublicKey();
  if (!vapidPublic) {
    console.warn(
      '[PhysioShield push] Set VITE_WEB_PUSH_VAPID_PUBLIC_KEY (or VITE_VAPID_PUBLIC_KEY) — cannot call pushManager.subscribe'
    );
    return null;
  }

  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    console.log('Push: Service Worker registration status:', registration);
    const reg = await navigator.serviceWorker.ready;
    if (!reg.pushManager) {
      console.warn('[PhysioShield push] pushManager missing on registration');
      return null;
    }

    const applicationServerKey = urlBase64ToUint8Array(vapidPublic);
    console.log(
      'Push: applicationServerKey decoded byte length:',
      applicationServerKey.length,
      `(expected ${VAPID_APPLICATION_SERVER_KEY_LENGTH} for uncompressed P-256 VAPID public key)`
    );
    if (applicationServerKey.length !== VAPID_APPLICATION_SERVER_KEY_LENGTH) {
      throw new Error(
        `VAPID public key must decode to exactly ${VAPID_APPLICATION_SERVER_KEY_LENGTH} bytes (uncompressed P-256: 0x04 || X || Y); decoded length is ${applicationServerKey.length}. ` +
          'Confirm VITE_WEB_PUSH_VAPID_PUBLIC_KEY (or VITE_VAPID_PUBLIC_KEY) is the URL-safe base64 **public** key from web-push generateVAPIDKeys (not the private key) and is not truncated.'
      );
    }

    let sub = await reg.pushManager.getSubscription();
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

    const json = sub.toJSON() as WebPushSubscriptionPayload | undefined;
    if (!json?.endpoint) {
      console.warn('Push: subscription JSON missing endpoint', json);
      return null;
    }
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
    console.log(`Push: subscribe attempt ${i + 1}/${attempts}`);
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
  console.log('Push: Starting registration...');
  const native = getNativeExpoPushTokenSync();
  console.log('TOKEN_FOR_NADAV:', native);
  if (native) {
    console.log('Push: Using native Expo token; skipping web subscribe.');
    return { ok: true, token: native, permission: 'granted' };
  }

  if (typeof window === 'undefined' || typeof Notification === 'undefined') {
    console.log('Push: Abort — notifications unsupported (no window / Notification API).');
    return { ok: false, reason: 'notifications_unsupported' };
  }

  console.log('Push: Permission status:', Notification.permission);

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

  console.log('Push: Permission status (after prompt handling):', permission);

  if (permission === 'denied') {
    console.log('Push: Abort — permission denied.');
    return { ok: false, reason: 'permission_denied' };
  }

  const vapidPublic = getVapidPublicKey();

  let webPushSubscription: WebPushSubscriptionPayload | undefined;
  let token: string;

  if (permission === 'granted') {
    if (vapidPublic) {
      console.log('Push: VAPID present — subscribing via PushManager (with retries).');
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
      console.log('Push: No VAPID — attempting subscribe or placeholder.');
      const subJson = await subscribeWebPushAfterPermissionGranted();
      if (subJson?.endpoint) {
        webPushSubscription = subJson;
        token = subJson.endpoint;
      } else {
        token = buildWebPlaceholderToken(patientId);
      }
    }
  } else {
    console.log('Push: Permission still default — placeholder token only.');
    token = buildWebPlaceholderToken(patientId);
  }

  console.log('Push: Registration finished OK.', {
    hasWebPushSubscription: Boolean(webPushSubscription?.endpoint),
    tokenPrefix: token.slice(0, 48),
  });

  return {
    ok: true,
    token,
    permission: permission === 'granted' ? 'granted' : 'default',
    webPushSubscription,
  };
}

/** Dev / debug: sequential alerts + Notification (isolates wiring vs browser policy). */
export async function showPhysioshieldTestNotification(): Promise<void> {
  if (typeof window === 'undefined') return;

  const loc = window.location;
  const host = loc.hostname;

  globalThis.alert('Button Clicked!');
  console.log('[Physio-Shield Test Push] hostname:', host);

  if (!('Notification' in globalThis)) {
    console.warn('[Physio-Shield Test Push] Notification API unavailable — likely browser restriction');
    globalThis.alert('Notification API not available in this context.');
    console.log('[Physio-Shield Test Push] hostname:', host);
    return;
  }

  const permission = await Notification.requestPermission();
  globalThis.alert('Permission: ' + permission);

  if (permission === 'granted') {
    await subscribeWebPushAfterPermissionGranted();
    try {
      // eslint-disable-next-line no-new
      new Notification('Test', { body: 'It works!' });
      console.log('[Physio-Shield Test Push] new Notification("Test") sent');
    } catch (e) {
      console.error('[Physio-Shield Test Push] new Notification() failed — browser/OS restriction?', e);
      console.log('[Physio-Shield Test Push] hostname:', host);
    }
  } else {
    console.warn('[Physio-Shield Test Push] permission not granted');
    console.log('[Physio-Shield Test Push] hostname:', host);
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
  const tz =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
      : 'UTC';

  const patch: Record<string, unknown> = {
    push_token: params.token,
    reminder_timezone: tz,
  };

  if (params.webPushSubscription) {
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

    const existing = row.payload;
    const base =
      existing && typeof existing === 'object' && !Array.isArray(existing)
        ? { ...(existing as Record<string, unknown>) }
        : {};
    const incoming = params.webPushSubscription as Record<string, unknown>;
    const prevSub = base.webPushSubscription;
    base.webPushSubscription =
      prevSub && typeof prevSub === 'object' && !Array.isArray(prevSub)
        ? ({ ...prevSub, ...incoming } as unknown as Patient['webPushSubscription'])
        : params.webPushSubscription;
    patch.payload = base;
  }

  const payload = patch.payload ?? patch;
  console.log('Final Sync: Push Token included in payload', payload);

  const { data: updated, error } = await supabase
    .from('patients')
    .update(patch)
    .eq('id', params.patientId)
    .select('id')
    .maybeSingle();

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
  console.log('Push Token Saved!');
  return { ok: true };
}

const lastActivityWriteByPatient = new Map<string, number>();

/**
 * Throttled heartbeat for reminder "momentum" logic (server compares to now).
 */
export async function touchPatientLastActivityThrottled(
  patientId: string,
  minIntervalMs = 120_000
): Promise<void> {
  if (!supabase) return;
  const now = Date.now();
  const prev = lastActivityWriteByPatient.get(patientId) ?? 0;
  if (now - prev < minIntervalMs) return;
  lastActivityWriteByPatient.set(patientId, now);
  await supabase
    .from('patients')
    .update({ last_activity_timestamp: new Date().toISOString() })
    .eq('id', patientId);
}
