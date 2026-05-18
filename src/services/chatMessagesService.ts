import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseAuthEnabled } from '../lib/patientPortalAuth';
import { resolveTherapistIdForSupabaseRls } from './clinicalService';

/**
 * Persists one chat row for Database Webhooks → notify-new-message Edge Function.
 * UI state stays local-first; this row exists so Supabase can emit INSERT events.
 */
export async function syncChatMessageToSupabase(
  client: SupabaseClient,
  params: {
    patientId: string;
    /** Value from {@link Patient.therapistId} — must match `patients.therapist_id` for portal sends */
    patientTherapistId: string;
    content: string;
    fromPatient: boolean;
  }
): Promise<void> {
  if (!isSupabaseAuthEnabled()) return;

  const pid = params.patientId.trim();
  const body = params.content.trim();
  if (!pid || !body) return;

  let therapistRowId = params.patientTherapistId.trim();
  if (!therapistRowId) return;

  if (!params.fromPatient) {
    const {
      data: { user },
    } = await client.auth.getUser();
    if (user?.id) {
      const mapped = resolveTherapistIdForSupabaseRls(params.patientTherapistId, user);
      therapistRowId = mapped ?? user.id;
    }
  }

  const { error } = await client.from('chat_messages').insert({
    patient_id: pid,
    therapist_id: therapistRowId,
    content: body,
    from_patient: params.fromPatient,
    ai_clinical_alert: false,
  });

  if (error) {
    console.warn('[chat_messages] insert failed:', error.message, { patientId: pid });
  }
}
