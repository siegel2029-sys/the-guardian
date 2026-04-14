import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersistedPatientStateV1 } from '../context/patientPersistence';
import {
  upsertPatientRecords,
  upsertTherapistProfilesForPatients,
} from '../services/clinicalService';
import { upsertExercisePlans, upsertSessionHistory } from '../services/exerciseService';
import { upsertGlobalAppKnowledgeBase } from '../services/gamificationService';

export type SupabasePushResult = { ok: true } | { ok: false; message: string };

/**
 * Pushes core clinical entities to Supabase (upsert).
 * Mirrors {@link PersistedPatientStateV1} slices: patients, exercise plans, daily sessions,
 * plus therapist {@link profiles} rows derived from patient.therapistId.
 *
 * Reads remain localStorage-first in the app; this is the first step toward full sync.
 */
export async function pushPersistedStateToSupabase(
  client: SupabaseClient,
  state: PersistedPatientStateV1
): Promise<SupabasePushResult> {
  try {
    const now = new Date().toISOString();

    let result: SupabasePushResult = await upsertTherapistProfilesForPatients(
      client,
      state.patients,
      now
    );
    if (!result.ok) return result;

    result = await upsertPatientRecords(client, state.patients, now);
    if (!result.ok) return result;

    result = await upsertExercisePlans(client, state.exercisePlans, now);
    if (!result.ok) return result;

    result = await upsertSessionHistory(client, state.dailySessions, now);
    if (!result.ok) return result;

    result = await upsertGlobalAppKnowledgeBase(client, state.knowledgeFacts ?? [], now);
    if (!result.ok) return result;

    return { ok: true };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
