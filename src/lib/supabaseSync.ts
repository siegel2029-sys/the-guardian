import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersistedPatientStateV1 } from '../context/patientPersistence';
import { isSupabaseAuthEnabled } from '../lib/patientPortalAuth';
import {
  resolveTherapistIdForSupabaseRls,
  type ClinicalPushResult,
  upsertPatientRecords,
  upsertTherapistProfilesForPatients,
  upsertGlobalAppKnowledgeBaseWithTipSyncLog,
} from '../services/clinicalService';
import { upsertExercisePlans, upsertSessionHistory } from '../services/exerciseService';

async function therapistIdByPatientIdForClinicalSync(
  client: SupabaseClient,
  patients: PersistedPatientStateV1['patients']
): Promise<Record<string, string>> {
  if (!isSupabaseAuthEnabled()) {
    return Object.fromEntries(patients.map((p) => [p.id, p.therapistId]));
  }
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user?.id) {
    return Object.fromEntries(patients.map((p) => [p.id, p.therapistId]));
  }
  const out: Record<string, string> = {};
  for (const p of patients) {
    const resolved = resolveTherapistIdForSupabaseRls(p.therapistId, user);
    out[p.id] = resolved ?? user.id;
  }
  return out;
}

export type SupabasePushResult = ClinicalPushResult;

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
      return await upsertPatientRecords(client, state.patients, now, { onlyPatientId: ownPatientId });
    }

    let result: SupabasePushResult = await upsertTherapistProfilesForPatients(
      client,
      state.patients,
      now
    );
    if (!result.ok) return result;

    const kb = state.knowledgeFacts ?? [];
    const patientsForUpsert =
      kb.length > 0
        ? state.patients.map((p) => ({ ...p, knowledgeFacts: kb }))
        : state.patients;

    result = await upsertPatientRecords(client, patientsForUpsert, now);
    if (!result.ok) return result;
    const syncedPatients = result.syncedPatients;

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
    if (!result.ok) {
      console.error('[pushPersistedStateToSupabase] upsertExercisePlans נכשל', result.message);
      return result;
    }

    const therapistIdByPatientId = await therapistIdByPatientIdForClinicalSync(
      client,
      state.patients
    );
    result = await upsertSessionHistory(client, state.dailySessions, now, {
      therapistIdByPatientId,
    });
    if (!result.ok) return result;

    const kbOutcome = await upsertGlobalAppKnowledgeBaseWithTipSyncLog(
      client,
      state.knowledgeFacts ?? [],
      now
    );
    if (!kbOutcome.ok) {
      return {
        ok: false,
        message: kbOutcome.message,
        httpStatus: kbOutcome.httpStatus,
        knowledgeBaseUpsert: kbOutcome,
      };
    }

    const payloadOk =
      syncedPatients && syncedPatients.length > 0
        ? ({ ok: true as const, syncedPatients, knowledgeBaseUpsert: kbOutcome })
        : ({ ok: true as const, knowledgeBaseUpsert: kbOutcome });
    return payloadOk;
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}
