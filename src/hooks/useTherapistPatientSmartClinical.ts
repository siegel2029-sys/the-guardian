import { useEffect, useMemo, useRef, useState } from 'react';
import type { Patient } from '../types';
import { usePatient } from '../context/PatientContext';
import { aggregateClinicalInsights } from '../services/clinicalInsightsAggregation';
import { computeClinicalProgressInsight } from '../ai/clinicalCommandInsight';
import { buildUnifiedClinicalNarrative, type UnifiedClinicalNarrative } from '../ai/clinicalInsightsNarrative';
import { analyzeSmartClinicalCenterWithGemini } from '../ai/geminiSmartClinicalCenter';
import { getGeminiApiKey } from '../ai/geminiClient';
import { getPatientDisplayName } from '../utils/patientDisplayName';

export type PendingClinicalRecommendation = {
  id: string;
  exerciseName: string;
  status: string;
  type: string;
  field: string;
  currentValue: number;
  suggestedValue: number;
  reason: string;
  source?: string;
};

export type TherapistSmartClinicalState = {
  aggregated: ReturnType<typeof aggregateClinicalInsights> | null;
  progressInsight: ReturnType<typeof computeClinicalProgressInsight> | null;
  narrative: UnifiedClinicalNarrative | null;
  narrativeSource: 'gemini' | 'local' | null;
  geminiLoading: boolean;
  geminiError: string | null;
  recommendedActions: string[];
  pendingRecommendations: PendingClinicalRecommendation[];
  isLoading: boolean;
  /** @deprecated use isLoading — kept for callers that already read this flag */
  isClinicalContextReady: boolean;
};

const EMPTY_CLINICAL_STATE: TherapistSmartClinicalState = {
  aggregated: null,
  progressInsight: null,
  narrative: null,
  narrativeSource: null,
  geminiLoading: false,
  geminiError: null,
  recommendedActions: [],
  pendingRecommendations: [],
  isLoading: false,
  isClinicalContextReady: true,
};

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
}

function patientMapLookup<T>(
  map: Record<string, T> | null | undefined,
  patientId: string | null | undefined
): T | undefined {
  if (!map || !patientId) return undefined;
  return map[patientId];
}

/** Supabase / legacy rows may omit analytics arrays — normalize before aggregation. */
export function withSafePatientAnalytics(patient: Patient): Patient {
  const analytics = patient.analytics;
  return {
    ...patient,
    analytics: {
      averageOverallPain: analytics?.averageOverallPain ?? 0,
      painByArea: analytics?.painByArea ?? {},
      averageDifficulty: analytics?.averageDifficulty ?? 0,
      totalSessions: analytics?.totalSessions ?? 0,
      painHistory: Array.isArray(analytics?.painHistory) ? analytics.painHistory : [],
      sessionHistory: Array.isArray(analytics?.sessionHistory) ? analytics.sessionHistory : [],
    },
  };
}

function aggregatedSnapshotKey(
  aggregated: ReturnType<typeof aggregateClinicalInsights> | null
): string | null {
  if (!aggregated) return null;
  const c = aggregated.compliance;
  return [
    aggregated.patientId,
    aggregated.clinicalToday,
    c.completedSum,
    c.plannedSum,
    c.rate,
    aggregated.avgPain7dPrimary,
    aggregated.daySeries7.length,
  ].join('|');
}

function progressInsightSnapshotKey(
  insight: ReturnType<typeof computeClinicalProgressInsight> | null
): string | null {
  if (!insight) return null;
  return [
    insight.category,
    insight.compliance3d,
    insight.currentPain,
    insight.avgPain7d,
    insight.titleHe,
  ].join('|');
}

export function useTherapistPatientSmartClinical(
  patient: Patient | null | undefined
): TherapistSmartClinicalState {
  const {
    getExercisePlan,
    clinicalToday,
    dailyHistoryByPatient,
    getSelfCareZones,
    getSelfCareReportsForPatient,
    patientExerciseFinishReportsByPatientId,
    aiSuggestions,
    runClinicalAssessmentEngine,
  } = usePatient();

  const patientId = patient?.id?.trim() || null;

  const safePatient =
    patientId && patient ? withSafePatientAnalytics(patient) : null;

  const painHistoryLen = safePatient?.analytics.painHistory.length ?? 0;
  const sessionHistoryLen = safePatient?.analytics.sessionHistory.length ?? 0;
  const therapistNotes = safePatient?.therapistNotes ?? '';

  const [isLoading, setIsLoading] = useState(false);
  const [geminiNarrative, setGeminiNarrative] = useState<UnifiedClinicalNarrative | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);

  const assessmentRunRef = useRef<string>('');
  const geminiRunRef = useRef<string>('');
  const runAssessmentRef = useRef(runClinicalAssessmentEngine);
  runAssessmentRef.current = runClinicalAssessmentEngine;

  const plan = useMemo(
    () => (patientId ? getExercisePlan(patientId) : undefined),
    [patientId, getExercisePlan]
  );

  const aggregated = useMemo(() => {
    if (!safePatient || !patientId) return null;

    const dailyHistoryMap = dailyHistoryByPatient ?? {};
    const finishReportsMap = patientExerciseFinishReportsByPatientId ?? {};

    const dailyHistoryForPatient = patientMapLookup(dailyHistoryMap, patientId);
    const selfSelectedZones = getSelfCareZones(patientId) ?? [];
    const selfCareReports = getSelfCareReportsForPatient(patientId) ?? [];
    const finishReports = patientMapLookup(finishReportsMap, patientId) ?? [];

    try {
      return aggregateClinicalInsights({
        patient: safePatient,
        clinicalToday,
        plan,
        dailyHistoryForPatient,
        selfSelectedZones,
        selfCareReports,
        finishReports,
      });
    } catch (err) {
      console.error('[SmartClinical] Error aggregating insights:', err);
      return null;
    }
  }, [
    safePatient,
    patientId,
    clinicalToday,
    plan,
    dailyHistoryByPatient,
    getSelfCareZones,
    getSelfCareReportsForPatient,
    patientExerciseFinishReportsByPatientId,
  ]);

  const progressInsight = useMemo(() => {
    if (!safePatient || !patientId) return null;
    try {
      return computeClinicalProgressInsight(safePatient, clinicalToday);
    } catch (err) {
      console.error('[SmartClinical] Error computing progress insight:', err);
      return null;
    }
  }, [safePatient, patientId, clinicalToday, painHistoryLen, sessionHistoryLen]);

  const aggregatedKey = aggregatedSnapshotKey(aggregated);
  const progressInsightKey = progressInsightSnapshotKey(progressInsight);
  const planExerciseCount = plan?.exercises.length ?? 0;

  const localNarrative = useMemo(() => {
    if (!safePatient || !aggregated) return null;
    try {
      return buildUnifiedClinicalNarrative(
        aggregated,
        getPatientDisplayName(safePatient),
        progressInsight
      );
    } catch (err) {
      console.error('[SmartClinical] Error building local narrative:', err);
      return null;
    }
  }, [safePatient, aggregatedKey, progressInsightKey]);

  const pendingRecommendations = useMemo((): PendingClinicalRecommendation[] => {
    if (!patientId) return [];
    return (aiSuggestions ?? [])
      .filter(
        (s) =>
          s?.patientId === patientId &&
          (s.status === 'pending' || s.status === 'awaiting_therapist')
      )
      .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
      .map((s) => ({
        id: s.id,
        exerciseName: s.exerciseName ?? 'תרגיל',
        status: s.status,
        type: s.type,
        field: s.field,
        currentValue: s.currentValue,
        suggestedValue: s.suggestedValue,
        reason: s.reason ?? '',
        source: s.source,
      }));
  }, [patientId, aiSuggestions]);

  /** Clear loading after synchronous evaluation (success, empty, or caught error). */
  useEffect(() => {
    if (!patientId) {
      setIsLoading(false);
      return;
    }

    if (!safePatient) {
      console.warn(`[SmartClinical] Patient data not found yet for ID: ${patientId}`);
      setIsLoading(false);
      return;
    }

    setIsLoading(false);
  }, [patientId, safePatient, aggregatedKey, progressInsightKey]);

  /** Reset Gemini slice when switching patients. */
  useEffect(() => {
    assessmentRunRef.current = '';
    geminiRunRef.current = '';
    setGeminiNarrative(null);
    setGeminiError(null);
    setGeminiLoading(false);
  }, [patientId]);

  /** Assessment engine — runs on every meaningful clinical snapshot change (no day blocking). */
  useEffect(() => {
    if (!patientId || isLoading) return;

    const signature = [
      patientId,
      clinicalToday,
      aggregatedKey ?? '',
      progressInsightKey ?? '',
      planExerciseCount,
      painHistoryLen,
      sessionHistoryLen,
      therapistNotes.trim(),
    ].join('|');

    if (assessmentRunRef.current === signature) return;
    assessmentRunRef.current = signature;

    void runAssessmentRef.current(patientId, therapistNotes);
  }, [
    patientId,
    isLoading,
    clinicalToday,
    aggregatedKey,
    progressInsightKey,
    planExerciseCount,
    painHistoryLen,
    sessionHistoryLen,
    therapistNotes,
  ]);

  /** Smart Clinical Center — Gemini narrative; stable snapshot keys prevent loops. */
  useEffect(() => {
    if (!patientId || isLoading) {
      setGeminiLoading(false);
      return;
    }

    if (!aggregatedKey || !progressInsightKey) {
      setGeminiLoading(false);
      return;
    }

    if (!getGeminiApiKey()) {
      setGeminiLoading(false);
      return;
    }

    const runKey = `${patientId}|${aggregatedKey}|${progressInsightKey}`;
    if (geminiRunRef.current === runKey) return;
    geminiRunRef.current = runKey;

    if (!aggregated || !progressInsight) {
      setGeminiLoading(false);
      return;
    }

    let cancelled = false;
    setGeminiLoading(true);
    setGeminiError(null);

    void analyzeSmartClinicalCenterWithGemini({ aggregated, progressInsight })
      .then((n) => {
        if (!cancelled) {
          setGeminiNarrative(n);
          setGeminiLoading(false);
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setGeminiNarrative(null);
          setGeminiError(e instanceof Error ? e.message : String(e));
          setGeminiLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [patientId, isLoading, aggregatedKey, progressInsightKey]);

  const narrative = geminiNarrative ?? localNarrative;
  const narrativeSource: TherapistSmartClinicalState['narrativeSource'] = geminiNarrative
    ? 'gemini'
    : localNarrative
      ? 'local'
      : null;

  const recommendedActions = useMemo(
    () => asStringArray(narrative?.recommendedActions),
    [narrative?.recommendedActions, narrativeSource]
  );

  if (!patientId || !safePatient) {
    return EMPTY_CLINICAL_STATE;
  }

  return {
    aggregated,
    progressInsight,
    narrative,
    narrativeSource,
    geminiLoading,
    geminiError,
    recommendedActions,
    pendingRecommendations,
    isLoading,
    isClinicalContextReady: !isLoading,
  };
}
