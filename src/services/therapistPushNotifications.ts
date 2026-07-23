import { supabase } from '../lib/supabase';
import { getSupabaseAuthSession } from '../lib/supabaseSessionGuard';
import {
  normalizeCanonicalWebPushSubscription,
  registerPatientPushForSupabase,
  type WebPushSubscriptionPayload,
} from './patientPushNotifications';

/**
 * Therapist push registration (Pipeline 1, therapist side).
 *
 * Mirrors the patient flow but persists to `public.profiles` instead of `public.patients`, so a
 * patient → therapist chat message (handled by the `notify-new-message` Edge Function) can deliver a
 * live notification to the therapist's device.
 *
 * The underlying Web Push subscribe (`registerPatientPushForSupabase`) is identity-agnostic: it
 * resolves the **server-validated** VAPID public key (`web-push-public-key` Edge Function) before
 * calling `pushManager.subscribe`, so the therapist subscribes with the exact bytes the server signs
 * with — preventing the HTTP 403 "VAPID credentials do not correspond" rejection.
 */

async function requireTherapistAuthSession(scope: string): Promise<boolean> {
  if (!supabase) return false;
  const session = await getSupabaseAuthSession(supabase);
  if (!session) {
    console.warn(`[PhysioShield therapist push] Skipping persistence (${scope}): no active auth session.`);
    return false;
  }
  return true;
}

/**
 * Upserts the therapist's push registration as a per-device row in `therapist_push_subscriptions`
 * (RLS: user_id = auth.uid()), keyed on the unique subscription endpoint. Unlike the legacy
 * single-column write on `profiles`, registering from a second device (PC + Mobile) adds a row
 * instead of overwriting the previous device — `notify-new-message` fans out to ALL rows.
 * Falls back gracefully when the table has not been migrated yet.
 */
export async function persistTherapistPushProfile(params: {
  therapistId: string;
  token: string;
  webPushSubscription?: WebPushSubscriptionPayload;
}): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) {
    return { ok: false, message: 'supabase_not_configured' };
  }
  if (!(await requireTherapistAuthSession('persistTherapistPushProfile'))) {
    return { ok: false, message: 'auth_session_missing' };
  }

  const endpoint = params.token.trim();
  // Only HTTPS Web Push endpoints belong in therapist_push_subscriptions (Expo tokens excluded).
  if (!endpoint.toLowerCase().startsWith('https://')) {
    return { ok: false, message: 'token_is_not_web_push_endpoint' };
  }

  // Without p256dh/auth keys the endpoint is undeliverable — nothing useful to persist.
  if (!params.webPushSubscription) {
    return { ok: false, message: 'missing_web_push_subscription_keys' };
  }
  const canonical = normalizeCanonicalWebPushSubscription(params.webPushSubscription);
  const subscriptionData = JSON.parse(
    JSON.stringify({ webPushSubscription: canonical })
  ) as Record<string, unknown>;

  const { error } = await supabase
    .from('therapist_push_subscriptions')
    .upsert(
      {
        user_id: params.therapistId,
        endpoint,
        subscription_data: subscriptionData,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' }
    );

  // Graceful fallback when the multi-device table hasn't been migrated on this environment yet.
  if (error && /therapist_push_subscriptions|relation.*does not exist|schema cache/i.test(error.message)) {
    console.warn(
      '[PhysioShield therapist push] therapist_push_subscriptions table missing — apply migration 20260610120000_therapist_push_subscriptions.sql.',
    );
    return { ok: false, message: `therapist_push_subscriptions_missing: ${error.message}` };
  }

  if (error) {
    return { ok: false, message: error.message };
  }

  // Non-fatal: keep profiles.last_activity_timestamp fresh for push-health triage.
  const { error: activityError } = await supabase
    .from('profiles')
    .update({ last_activity_timestamp: new Date().toISOString() })
    .eq('id', params.therapistId);
  if (activityError) {
    console.warn(
      '[PhysioShield therapist push] last_activity_timestamp update failed (non-fatal):',
      activityError.message,
    );
  }

  return { ok: true };
}

/**
 * Registers (or refreshes) the therapist's Web Push / Expo subscription and persists it to
 * `public.profiles`. Safe to call on every therapist app open — it re-uses the existing subscription
 * unless the VAPID key rotated, in which case it transparently re-subscribes.
 */
export async function registerAndPersistTherapistPush(
  therapistId: string,
): Promise<{ ok: boolean; message?: string }> {
  const id = therapistId.trim();
  if (!id) return { ok: false, message: 'missing_therapist_id' };

  const reg = await registerPatientPushForSupabase(id);
  if (!reg.ok) {
    console.warn('[PhysioShield therapist push] register skipped:', reg.message);
    return { ok: false, message: reg.message };
  }

  const saved = await persistTherapistPushProfile({
    therapistId: id,
    token: reg.token,
    webPushSubscription: reg.webPushSubscription,
  });
  if (!saved.ok) {
    console.warn('[PhysioShield therapist push] persist failed:', saved.message);
  }
  return saved;
}
