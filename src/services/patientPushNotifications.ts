import { supabase } from '../lib/supabase';

const PUSH_PROMPT_KEY = 'physioshield_push_permission_prompted_v1';

function getNativeExpoPushTokenSync(): string | null {
  try {
    // Optional native bridge (e.g. React Native / Expo webview hosting this bundle)
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

export type PushRegisterResult =
  | { ok: true; token: string; permission: NotificationPermission | 'unsupported' }
  | { ok: false; reason: string };

/**
 * Requests browser notification permission on first launch, resolves an Expo push token
 * (when native sets global) or a stable web placeholder for persistence (remote push requires Expo).
 */
export async function registerPatientPushForSupabase(
  patientId: string
): Promise<PushRegisterResult> {
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

  const token = buildWebPlaceholderToken(patientId);
  return {
    ok: true,
    token,
    permission: permission === 'granted' ? 'granted' : 'default',
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
}): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) {
    return { ok: false, message: 'supabase_not_configured' };
  }
  const tz =
    typeof Intl !== 'undefined'
      ? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
      : 'UTC';

  const { error } = await supabase
    .from('patients')
    .update({
      push_token: params.token,
      reminder_timezone: tz,
    })
    .eq('id', params.patientId);

  if (error) {
    return { ok: false, message: error.message };
  }
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
