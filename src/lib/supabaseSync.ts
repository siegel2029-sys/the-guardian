import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersistedPatientStateV1 } from '../context/patientPersistence';
import {
  upsertPatientRecords,
  upsertTherapistProfilesForPatients,
} from '../services/clinicalService';
import { upsertExercisePlans, upsertSessionHistory } from '../services/exerciseService';
import { upsertGlobalAppKnowledgeBase } from '../services/gamificationService';

export type SupabasePushResult = { ok: true } | { ok: false; message: string };

/** Who is performing the push — patients must not write `profiles` or other therapist-scoped tables. */
export type PushPersistedStateOptions = {
  sessionRole?: 'therapist' | 'patient';
  /** Required when {@link PushPersistedStateOptions.sessionRole} is `'patient'`. */
  patientSessionId?: string | null;
  /**
   * Optional note stored on the new exercise_plans version row when content differs (therapist save).
   * Keys are patient IDs; omitted or empty string → null in DB for that patient.
   */
  exercisePlanChangeSummaryByPatientId?: Record<string, string>;
};

/**
 * Pushes core clinical entities to Supabase (upsert).
 * Mirrors {@link PersistedPatientStateV1} slices: patients, exercise plans, daily sessions,
 * plus therapist {@link profiles} rows derived from patient.therapistId.
 *
 * **Patient sessions** (`sessionRole === 'patient'`): only the `patients` row for
 * {@link PushPersistedStateOptions.patientSessionId} is upserted — no `profiles`, exercise plans,
 * session_history, or app_knowledge_base (RLS).
 *
 * Reads remain localStorage-first in the app; this is the first step toward full sync.
 */
export async function pushPersistedStateToSupabase(
  client: SupabaseClient,
  state: PersistedPatientStateV1,
  options?: PushPersistedStateOptions
): Promise<SupabasePushResult> {
  try {
    const now = new Date().toISOString();
    const isPatient = options?.sessionRole === 'patient';
    const ownPatientId = options?.patientSessionId?.trim() ?? '';

    if (isPatient) {
      if (!ownPatientId) {
        return { ok: false, message: 'patient sync: missing patientSessionId' };
      }
      return upsertPatientRecords(client, state.patients, now, { onlyPatientId: ownPatientId });
    }

    let result: SupabasePushResult = await upsertTherapistProfilesForPatients(
      client,
      state.patients,
      now
    );
    if (!result.ok) return result;

    result = await upsertPatientRecords(client, state.patients, now);
    if (!result.ok) return result;

    const changeMap = options?.exercisePlanChangeSummaryByPatientId;
    const changeSummaryByPatientId: Record<string, string> | undefined =
      changeMap && Object.keys(changeMap).length > 0
        ? Object.fromEntries(
            Object.entries(changeMap).filter(([, v]) => typeof v === 'string' && v.trim() !== '')
          )
        : undefined;

    result = await upsertExercisePlans(client, state.exercisePlans, now, {
      changeSummaryByPatientId:
        changeSummaryByPatientId && Object.keys(changeSummaryByPatientId).length > 0
          ? changeSummaryByPatientId
          : undefined,
    });
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
