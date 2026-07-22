/**
 * PatientContext hydrate domain — KB + session_history analytics enrichment.
 * Keeps merge argument order contracts out of the god provider file.
 */
import type { Dispatch, SetStateAction } from 'react';
import type { KnowledgeFact, Patient } from '../types';
import type { DailySession } from '../types';
import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseAuthEnabled } from '../lib/patientPortalAuth';
import { devWarn, redactId } from '../lib/safeLog';
import {
  fetchTherapistAppKbWithLegacyGlobalFallback,
  mergeKnowledgeFactsHydrateFromTherapistCloud,
  mergePainHistoryUnique,
  mergeSessionHistoryByDate,
  resolveStableAuthUserIdForKb,
} from '../services/clinicalService';
import { buildPainAndSessionHistoryFromDailySessions } from '../services/exerciseService';
import { recomputePatientAnalyticsAggregates } from './patientDomainHelpers';

/** טעינת בסיס הידע מ-app_knowledge_base + aggregation של payloads מה-fetch הנוכחי (לא מהטמון בלבד). */
export async function hydrateTherapistKnowledgeFactsFromSupabase(
  client: SupabaseClient,
  patientsSnapshotFromServerFetch: Patient[],
  setKnowledgeFacts: Dispatch<SetStateAction<KnowledgeFact[]>>,
  prevFacts: KnowledgeFact[],
  opts?: {
    suppressCloudKbFetchUntilMs?: number;
    forceFreshKbFetch?: boolean;
    /** נקרא רק אחרי סיבוב רשת מוצלח ל־app_knowledge_base (כולל מיגרציה מ־global). */
    markHydratedFromCloud?: () => void;
  }
): Promise<KnowledgeFact[]> {
  const suppressMs = opts?.suppressCloudKbFetchUntilMs ?? 0;
  const fetchBlocked = !opts?.forceFreshKbFetch && Date.now() < suppressMs;

  let kbItems: KnowledgeFact[] | undefined;

  if (!fetchBlocked) {
    let therapistKey: string | undefined;
    if (isSupabaseAuthEnabled()) {
      const uid = await resolveStableAuthUserIdForKb(client, { maxWaitMs: 12_000 });
      const trimmed = uid?.trim();
      if (!trimmed) {
        devWarn('[TIP_SYNC] KB fetch skipped — therapist auth uid not stable after wait');
        const mergedOnlyPayloads = mergeKnowledgeFactsHydrateFromTherapistCloud(
          patientsSnapshotFromServerFetch,
          undefined,
          prevFacts
        );
        setKnowledgeFacts(mergedOnlyPayloads);
        return mergedOnlyPayloads;
      }
      therapistKey = trimmed;
      devWarn('[TIP_SYNC] Initializing fetch for Therapist ID', {
        therapistId: redactId(therapistKey),
      });
    }

    const { items, deletedSeedIds } = await fetchTherapistAppKbWithLegacyGlobalFallback(
      client,
      therapistKey
    );
    kbItems = items;

    const mergedAfterFetch = mergeKnowledgeFactsHydrateFromTherapistCloud(
      patientsSnapshotFromServerFetch,
      kbItems,
      prevFacts,
      deletedSeedIds
    );
    setKnowledgeFacts(mergedAfterFetch);
    opts?.markHydratedFromCloud?.();
    return mergedAfterFetch;
  }

  const merged = mergeKnowledgeFactsHydrateFromTherapistCloud(
    patientsSnapshotFromServerFetch,
    kbItems,
    prevFacts
  );
  setKnowledgeFacts(merged);
  return merged;
}

/** Merges pain + exercise analytics derived from `session_history` rows into patient state for dashboard charts. */
export function applySessionHistoryAnalyticsHydration(
  patient: Patient,
  rows: DailySession[],
  plannedExerciseCountFallback: number
): Patient {
  if (rows.length === 0) return patient;
  const derived = buildPainAndSessionHistoryFromDailySessions(
    rows,
    patient.primaryBodyArea,
    plannedExerciseCountFallback
  );
  const painHistory = mergePainHistoryUnique(patient.analytics.painHistory, derived.painHistory);
  const sessionHistory = mergeSessionHistoryByDate(
    patient.analytics.sessionHistory,
    derived.sessionHistory
  );
  const agg = recomputePatientAnalyticsAggregates(painHistory, sessionHistory);
  return {
    ...patient,
    analytics: {
      ...patient.analytics,
      painHistory,
      sessionHistory,
      ...agg,
    },
  };
}
