import { supabase } from '../lib/supabase';
import type { Patient } from '../types';

const PUSH_PROMPT_KEY = 'physioshield_push_permission_prompted_v1';

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

function getVapidPublicKey(): string {
  const rawKey = import.meta.env.VITE_WEB_PUSH_VAPID_PUBLIC_KEY;
  return typeof rawKey === 'string' ? rawKey.trim() : '';
}

/** VAPID public key (URL-safe base64) → Uint8Array for `applicationServerKey`. */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type WebPushSubscriptionPayload = NonNullable<Patient['webPushSubscription']>;

/**
 * After notification permission is granted: register SW + `pushManager.subscribe` (VAPID).
 */
export async function subscribeWebPushAfterPermissionGranted(): Promise<WebPushSubscriptionPayload | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
    return null;
  }

  const vapidPublic = getVapidPublicKey();
  if (!vapidPublic) {
    console.warn(
      '[PhysioShield push] VITE_WEB_PUSH_VAPID_PUBLIC_KEY missing — cannot call pushManager.subscribe'
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

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const keyBytes = urlBase64ToUint8Array(vapidPublic);
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes as BufferSource,
      });
    }

    const json = sub.toJSON() as WebPushSubscriptionPayload | undefined;
    if (!json?.endpoint) return null;
    return json;
  } catch (e) {
    console.warn('[PhysioShield push] pushManager.subscribe failed', e);
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

  const vapidPublic = getVapidPublicKey();

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
