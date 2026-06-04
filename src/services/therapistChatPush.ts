import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseAnonKey, supabaseUrl } from '../lib/supabase';
import { getSupabaseAuthSession } from '../lib/supabaseSessionGuard';

export type PatientChatPushContext = {
  patientId: string;
  therapistId: string | null;
  pushToken: string;
  payload: unknown;
};

function getSendTherapistChatPushUrl(): string {
  const base = supabaseUrl.replace(/\/+$/, '');
  return `${base}/functions/v1/send-therapist-chat-push`;
}

/** Mirrors Edge `hasDeliverableReminderToken` for client-side telemetry. */
export function hasDeliverablePatientPushToken(token: string): boolean {
  const t = token.trim();
  if (!t) return false;
  if (t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken')) return true;
  return t.toLowerCase().startsWith('https://');
}

/**
 * Authoritative patient row for chat insert + push (not in-memory roster during hydration).
 */
export async function fetchPatientChatPushContext(
  client: SupabaseClient,
  patientId: string
): Promise<PatientChatPushContext | null> {
  const pid = patientId.trim();
  if (!pid) return null;

  const { data, error } = await client
    .from('patients')
    .select('id, therapist_id, push_token, payload')
    .eq('id', pid)
    .maybeSingle();

  if (error) {
    console.warn('[Push Dispatch] fetchPatientChatPushContext failed:', error.message);
    return null;
  }
  if (!data?.id) {
    console.warn('[Push Dispatch] fetchPatientChatPushContext: no patient row for', pid);
    return null;
  }

  return {
    patientId: String(data.id),
    therapistId:
      typeof data.therapist_id === 'string' && data.therapist_id.trim().length > 0
        ? data.therapist_id.trim()
        : null,
    pushToken: typeof data.push_token === 'string' ? data.push_token.trim() : '',
    payload: data.payload,
  };
}

/**
 * Isolated push dispatch after a successful chat insert — does not depend on Gemini or roster hydration.
 */
export async function dispatchTherapistChatPushNotification(
  client: SupabaseClient,
  opts: {
    patientId: string;
    pushToken?: string;
    messagePreview?: string;
  }
): Promise<void> {
  const patientId = opts.patientId.trim();
  if (!patientId) return;

  let token = opts.pushToken?.trim() ?? '';
  if (!token) {
    const ctx = await fetchPatientChatPushContext(client, patientId);
    token = ctx?.pushToken ?? '';
  }

  console.log(
    '[Push Dispatch] Firing push notification payload for patient:',
    patientId,
    'Token status:',
    hasDeliverablePatientPushToken(token)
  );

  if (!hasDeliverablePatientPushToken(token)) {
    console.warn('[Push Dispatch] Skipping — no deliverable Expo/Web Push token for', patientId);
    return;
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn('[Push Dispatch] Skipping — Supabase env not configured');
    return;
  }

  const session = await getSupabaseAuthSession(client);
  if (!session?.access_token) {
    console.warn('[Push Dispatch] Skipping — no therapist auth session');
    return;
  }

  const invokeUrl = getSendTherapistChatPushUrl();
  try {
    const res = await fetch(invokeUrl, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        patientId,
        body: opts.messagePreview?.trim() || undefined,
      }),
    });

    const raw = await res.text();
    let parsed: { ok?: boolean; sent?: boolean; error?: string; reason?: string } = {};
    try {
      parsed = raw ? (JSON.parse(raw) as typeof parsed) : {};
    } catch {
      /* ignore */
    }

    if (!res.ok) {
      console.error('[Push Dispatch] Edge function HTTP error', res.status, parsed.error ?? raw.slice(0, 200));
      return;
    }

    if (parsed.sent) {
      console.log('[Push Dispatch] Push sent OK for patient', patientId);
    } else if (parsed.ok && parsed.reason) {
      console.warn('[Push Dispatch] Push not sent:', parsed.reason, patientId);
    } else if (!parsed.ok) {
      console.error('[Push Dispatch] Push failed:', parsed.error ?? raw.slice(0, 200));
    }
  } catch (e) {
    console.error('[Push Dispatch] Network error calling send-therapist-chat-push', e);
  }
}

export type PatientPushSyncDispatchResult = {
  ok: boolean;
  sent: boolean;
  message: string;
};

/**
 * Therapist-initiated Web Push that opens the patient portal so automated hydration
 * refreshes the push subscription (isolated testing).
 */
export async function dispatchPatientPushSyncRequest(
  client: SupabaseClient,
  patientId: string
): Promise<PatientPushSyncDispatchResult> {
  const pid = patientId.trim();
  if (!pid) {
    return { ok: false, sent: false, message: 'חסר מזהה מטופל' };
  }

  const ctx = await fetchPatientChatPushContext(client, pid);
  const token = ctx?.pushToken ?? '';
  if (!hasDeliverablePatientPushToken(token)) {
    return {
      ok: false,
      sent: false,
      message: 'אין push_token תקין בשרת (Expo או Web Push HTTPS)',
    };
  }

  if (!supabaseUrl || !supabaseAnonKey) {
    return { ok: false, sent: false, message: 'Supabase לא מוגדר בסביבה' };
  }

  const session = await getSupabaseAuthSession(client);
  if (!session?.access_token) {
    return { ok: false, sent: false, message: 'נדרשת התחברות מטפל' };
  }

  const invokeUrl = getSendTherapistChatPushUrl();
  try {
    const res = await fetch(invokeUrl, {
      method: 'POST',
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ patientId: pid, intent: 'push_sync' }),
    });

    const raw = await res.text();
    let parsed: {
      ok?: boolean;
      sent?: boolean;
      error?: string;
      reason?: string;
      deliveryError?: string;
      intent?: string;
    } = {};
    try {
      parsed = raw ? (JSON.parse(raw) as typeof parsed) : {};
    } catch {
      /* ignore */
    }

    if (!res.ok) {
      const detail = parsed.error ?? raw.slice(0, 200);
      console.error('[Push Sync Request] HTTP error', res.status, detail);
      return { ok: false, sent: false, message: `שגיאת שרת (${res.status}): ${detail}` };
    }

    if (parsed.sent) {
      console.log('[Push Sync Request] Sent push_sync for', pid);
      return {
        ok: true,
        sent: true,
        message: 'בקשת הסנכרון נשלחה — המטופל יקבל התראה לפתיחת הפורטל.',
      };
    }

    if (parsed.ok && parsed.reason === 'no_deliverable_push_token') {
      return {
        ok: true,
        sent: false,
        message: 'לא נשלח — אין push_token תקין בשרת',
      };
    }

    if (!parsed.ok) {
      const detail = parsed.deliveryError ?? parsed.error ?? raw.slice(0, 200);
      return { ok: false, sent: false, message: `שליחה נכשלה: ${detail}` };
    }

    return {
      ok: true,
      sent: false,
      message: parsed.reason ?? 'הבקשה לא נשלחה (סיבה לא ידועה)',
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[Push Sync Request] Network error', e);
    return { ok: false, sent: false, message: `שגיאת רשת: ${msg}` };
  }
}
