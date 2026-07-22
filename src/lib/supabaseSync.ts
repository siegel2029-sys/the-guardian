import type { SupabaseClient } from '@supabase/supabase-js';
import type { PersistedPatientStateV1 } from '../context/patientPersistence';
import { normalizeKnowledgeFactsList } from '../utils/knowledgeFactNormalize';
import { isSupabaseAuthEnabled } from '../lib/patientPortalAuth';
import {
  resolveTherapistIdForSupabaseRls,
  type ClinicalPushResult,
  fetchPatientPayloadsForTherapist,
  getPatientById,
  upsertPatientRecords,
  upsertTherapistProfilesForPatients,
  upsertGlobalAppKnowledgeBaseWithTipSyncLog,
} from '../services/clinicalService';
import { fetchAppKnowledgeBaseFromSupabase } from '../services/gamificationService';
import { upsertExercisePlans, upsertSessionHistory } from '../services/exerciseService';
import {
  embedClinicalInsightsIntoPatients,
  mergeClinicalInsightsSnapshots,
  pullClinicalInsightsFromPatientPayloads,
  type ClinicalInsightsSnapshot,
} from '../utils/clinicalInsightsPayload';
import { withCloudSyncRetry } from './cloudSyncResilience';
import { devLog, devWarn } from './safeLog';

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
  /**
   * Therapist: merge trusts local KB membership so deleted tips are not resurrected from stale `patients.payload`.
   */
  trustKnowledgeFactDeletions?: boolean;
  /** מזהי זרע להוספה ל־`app_knowledge_base.deleted_seed_ids` (מיזוג עם השרת ב-upsert). */
  appendKnowledgeDeletedSeedIds?: string[];
};

export type PullPersistedStateResult =
  | { ok: true; clinicalInsights: ClinicalInsightsSnapshot }
  | { ok: false; message: string };

/**
 * Pulls `aiSuggestions` and `safetyAlerts` from `patients.payload.clinicalInsightsQueue` in Supabase.
 */
export async function pullPersistedState(
  client: SupabaseClient,
  options?: { onlyPatientId?: string }
): Promise<PullPersistedStateResult> {
  const attempt = async (): Promise<PullPersistedStateResult> => {
    try {
      const onlyId = options?.onlyPatientId?.trim();
      if (onlyId) {
        const row = await getPatientById(client, onlyId);
        if (!row.ok) return { ok: false, message: row.message };
        return {
          ok: true,
          clinicalInsights: pullClinicalInsightsFromPatientPayloads([row.patient]),
        };
      }

      const base = await fetchPatientPayloadsForTherapist(client);
      if (!base.ok) return { ok: false, message: base.message };
      return {
        ok: true,
        clinicalInsights: pullClinicalInsightsFromPatientPayloads(base.patients),
      };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      devWarn('[pullPersistedState] failed — keeping local state', { message });
      return { ok: false, message };
    }
  };

  return withCloudSyncRetry(attempt, {
    maxAttempts: 2,
    delayMs: 350,
    onRetry: (n, message) => {
      devWarn(`[pullPersistedState] transient failure — retry ${n}`, { message });
    },
  });
}

/**
 * Merges remote clinical insights (from {@link pullPersistedState}) with local snapshot.
 */
export function mergePulledClinicalInsights(
  local: ClinicalInsightsSnapshot,
  remote: ClinicalInsightsSnapshot
): ClinicalInsightsSnapshot {
  return mergeClinicalInsightsSnapshots(local, remote);
}

/**
 * Pushes core clinical entities to Supabase (upsert).
 * Mirrors {@link PersistedPatientStateV1} slices: patients, exercise plans, daily sessions,
 * plus therapist {@link profiles} rows derived from patient.therapistId.
 *
 * Embeds `aiSuggestions` and `safetyAlerts` into each patient's `payload.clinicalInsightsQueue`
 * so recommendations are visible from any therapist device.
 *
 * **Patient sessions** (`sessionRole === 'patient'`): only the `patients` row for
 * {@link PushPersistedStateOptions.patientSessionId} is upserted — no `profiles`, exercise plans,
 * session_history, or app_knowledge_base (RLS).
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

    const patientsWithClinicalQueue = embedClinicalInsightsIntoPatients(
      state.patients,
      state.aiSuggestions ?? [],
      state.safetyAlerts ?? [],
      now
    );

    const retryUpsert = <T extends SupabasePushResult>(label: string, op: () => Promise<T>) =>
      withCloudSyncRetry(op, {
        maxAttempts: 2,
        delayMs: 350,
        onRetry: (n, message) => {
          devWarn(`[pushPersistedStateToSupabase] ${label} transient — retry ${n}`, { message });
        },
      });

    if (isPatient) {
      if (!ownPatientId) {
        return { ok: false, message: 'patient sync: missing patientSessionId' };
      }
      const ownPatients =
        patientsWithClinicalQueue.filter((p) => p.id === ownPatientId).length > 0
          ? patientsWithClinicalQueue.filter((p) => p.id === ownPatientId)
          : embedClinicalInsightsIntoPatients(
              state.patients.filter((p) => p.id === ownPatientId),
              (state.aiSuggestions ?? []).filter((s) => s.patientId === ownPatientId),
              (state.safetyAlerts ?? []).filter((a) => a.patientId === ownPatientId),
              now
            );
      return await retryUpsert('upsertPatientRecords(patient)', () =>
        upsertPatientRecords(client, ownPatients, now, {
          onlyPatientId: ownPatientId,
        })
      );
    }

    let result: SupabasePushResult = await retryUpsert('upsertTherapistProfilesForPatients', () =>
      upsertTherapistProfilesForPatients(client, patientsWithClinicalQueue, now)
    );
    if (!result.ok) return result;

    const kb = normalizeKnowledgeFactsList(state.knowledgeFacts ?? []);
    /** תמיד יוצרים עותק עם הרשימה הקנונית — גם כשהמאגר ריק, כדי לא לדחוף ghost `knowledgeFacts` מתוך אובייקטי מטופל ישנים. */
    const patientsForUpsert = patientsWithClinicalQueue.map((p) => ({
      ...p,
      knowledgeFacts: kb.length > 0 ? kb : undefined,
    }));

    result = await retryUpsert('upsertPatientRecords', () =>
      upsertPatientRecords(client, patientsForUpsert, now, {
        ...(options?.trustKnowledgeFactDeletions !== undefined
          ? { trustKnowledgeFactDeletions: options.trustKnowledgeFactDeletions }
          : {}),
      })
    );
    if (!result.ok) return result;
    const syncedPatients = result.syncedPatients;

    const kbLen = state.knowledgeFacts?.length ?? 0;
    devLog('[SAVE_CHECK] Cloud push payload', {
      patientsCount: state.patients.length,
      exercisePlansCount: state.exercisePlans.length,
      knowledgeFactsCount: kbLen,
      aiSuggestionsCount: state.aiSuggestions?.length ?? 0,
      safetyAlertsCount: state.safetyAlerts?.length ?? 0,
    });

    const changeMap = options?.exercisePlanChangeSummaryByPatientId;
    const changeSummaryByPatientId: Record<string, string> | undefined =
      changeMap && Object.keys(changeMap).length > 0
        ? Object.fromEntries(
            Object.entries(changeMap).filter(([, v]) => typeof v === 'string' && v.trim() !== '')
          )
        : undefined;

    result = await retryUpsert('upsertExercisePlans', () =>
      upsertExercisePlans(client, state.exercisePlans, now, {
        changeSummaryByPatientId:
          changeSummaryByPatientId && Object.keys(changeSummaryByPatientId).length > 0
            ? changeSummaryByPatientId
            : undefined,
      })
    );
    if (!result.ok) {
      devWarn('[pushPersistedStateToSupabase] upsertExercisePlans נכשל', { message: result.message });
      return result;
    }

    const therapistIdByPatientId = await therapistIdByPatientIdForClinicalSync(
      client,
      state.patients
    );
    result = await retryUpsert('upsertSessionHistory', () =>
      upsertSessionHistory(client, state.dailySessions, now, {
        therapistIdByPatientId,
      })
    );
    if (!result.ok) return result;

    const kbToSave = state.knowledgeFacts ?? [];
    const localKbCount = kbToSave.length;
    const finalKbSaveCount = kbToSave.length;
    let serverKbCount: number | string = 'n/a';
    if (isSupabaseAuthEnabled()) {
      try {
        const {
          data: { user },
        } = await client.auth.getUser();
        const uid = user?.id?.trim();
        if (uid) {
          const row = await fetchAppKnowledgeBaseFromSupabase(client, { therapistAuthUserId: uid });
          serverKbCount = row?.items?.length ?? 0;
        }
      } catch {
        serverKbCount = 'error';
      }
    }
    devLog('[SYNC_DEBUG] Final KB items to be saved', {
      finalKbSaveCount,
      localKbCount,
      serverKbCount,
    });

    const kbOutcome = await withCloudSyncRetry(
      () =>
        upsertGlobalAppKnowledgeBaseWithTipSyncLog(
          client,
          normalizeKnowledgeFactsList(kbToSave),
          now,
          {
            appendDeletedSeedIds: options?.appendKnowledgeDeletedSeedIds,
          }
        ),
      {
        maxAttempts: 2,
        delayMs: 350,
        onRetry: (n, message) => {
          devWarn(
            `[pushPersistedStateToSupabase] upsertGlobalAppKnowledgeBase transient — retry ${n}`,
            { message },
          );
        },
      },
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
