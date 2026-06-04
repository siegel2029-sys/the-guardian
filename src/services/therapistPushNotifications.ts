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
 * Upserts the therapist's push registration onto their own `profiles` row (RLS: id = auth.uid()).
 * Updates device keys, `last_activity_timestamp`, and clears any prior stale flag set by the Edge
 * Functions. Falls back gracefully when the push-health columns have not been migrated yet.
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

  const patch: Record<string, unknown> = {
    push_token: params.token,
    last_activity_timestamp: new Date().toISOString(),
    push_invalidated_at: null,
    push_last_error: null,
  };

  if (params.webPushSubscription) {
    const canonical = normalizeCanonicalWebPushSubscription(params.webPushSubscription);
    patch.push_payload = JSON.parse(JSON.stringify({ webPushSubscription: canonical }));
  }

  const runUpdate = async (values: Record<string, unknown>) =>
    supabase!
      .from('profiles')
      .update(values)
      .eq('id', params.therapistId)
      .select('id')
      .maybeSingle();

  let { data: updated, error } = await runUpdate(patch);

  // Graceful fallback when the therapist push columns haven't been migrated on this environment yet.
  if (error && /push_token|push_payload|push_invalidated_at|push_last_error|last_activity_timestamp|column.*does not exist/i.test(error.message)) {
    console.warn(
      '[PhysioShield therapist push] profiles push columns missing — apply migration 20260605120200_profiles_push_subscription.sql.',
    );
    return { ok: false, message: `profiles_push_columns_missing: ${error.message}` };
  }

  if (error) {
    return { ok: false, message: error.message };
  }
  if (!updated?.id) {
    return {
      ok: false,
      message:
        'profile_update_returned_no_rows (check RLS and profiles.id matches the signed-in therapist auth.uid())',
    };
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
    console.warn('[PhysioShield therapist push] register skipped:', reg.reason);
    return { ok: false, message: reg.reason };
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
