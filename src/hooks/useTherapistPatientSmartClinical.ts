import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { Patient } from '../types';
import { usePatient } from '../context/PatientContext';
import { aggregateClinicalInsights } from '../services/clinicalInsightsAggregation';
import { computeClinicalProgressInsight } from '../ai/clinicalCommandInsight';
import {
  approvableRowKey,
  buildUnifiedClinicalNarrative,
  flattenApprovableRows,
  type ApprovablePlanRow,
  type UnifiedClinicalNarrative,
} from '../ai/clinicalInsightsNarrative';
import { analyzeSmartClinicalCenterWithGemini } from '../ai/geminiSmartClinicalCenter';
import { getGeminiApiKey } from '../ai/geminiClient';
import { getPatientDisplayName } from '../utils/patientDisplayName';
import {
  collectRecentTherapistReviewedSuggestions,
  filterTherapistPendingAiSuggestions,
  therapistReviewedCategoryKeySet,
} from '../utils/clinicalAiQueueMerge';
import { loadLatestIntakeFields } from '../utils/clinicalIntakeVersions';
import { formatContinuationProtocol } from '../utils/continuationProtocolDisplay';
import { buildClinicalExerciseCatalog } from '../utils/clinicalExerciseCatalog';
import {
  applyLoadAdjustment,
  applySuggestedExerciseChange,
} from '../utils/planModificationApply';

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
  visibleApprovableRows: ApprovablePlanRow[];
  pendingRecommendations: PendingClinicalRecommendation[];
  isLoading: boolean;
  isClinicalContextReady: boolean;
  approveApprovableRow: (row: ApprovablePlanRow) => void;
  dismissApprovableRow: (row: ApprovablePlanRow) => void;
  planModificationFeedback: string | null;
};

const EMPTY_CLINICAL_STATE: TherapistSmartClinicalState = {
  aggregated: null,
  progressInsight: null,
  narrative: null,
  narrativeSource: null,
  geminiLoading: false,
  geminiError: null,
  visibleApprovableRows: [],
  pendingRecommendations: [],
  isLoading: false,
  isClinicalContextReady: true,
  approveApprovableRow: () => {},
  dismissApprovableRow: () => {},
  planModificationFeedback: null,
};

function patientMapLookup<T>(
  map: Record<string, T> | null | undefined,
  patientId: string | null | undefined
): T | undefined {
  if (!map || !patientId) return undefined;
  return map[patientId];
}

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
  const s = aggregated.activeStreak;
  return [
    aggregated.patientId,
    aggregated.clinicalToday,
    s.activeStreakStart,
    aggregated.adherencePercent,
    aggregated.adherenceCountableDays,
    aggregated.avgPainActiveStreakPrimary,
  ].join('|');
}

function progressInsightSnapshotKey(
  insight: ReturnType<typeof computeClinicalProgressInsight> | null
): string | null {
  if (!insight) return null;
  return [
    insight.category,
    insight.compliance3d,
    insight.activeStreakCompliance,
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
    readExercisePlanSnapshot,
    clinicalToday,
    dailyHistoryByPatient,
    getSelfCareZones,
    getSelfCareReportsForPatient,
    patientExerciseFinishReportsByPatientId,
    aiSuggestions,
    runClinicalAssessmentEngine,
    updateExerciseInPlan,
    addExerciseToPlan,
    removeExerciseFromPlan,
    replaceExercisePlanForPatient,
  } = usePatient();

  const patientId = patient?.id?.trim() || null;
  const safePatient = patientId && patient ? withSafePatientAnalytics(patient) : null;

  const painHistoryLen = safePatient?.analytics.painHistory.length ?? 0;
  const sessionHistoryLen = safePatient?.analytics.sessionHistory.length ?? 0;
  const therapistNotes = safePatient?.therapistNotes ?? '';

  const [isLoading, setIsLoading] = useState(false);
  const [geminiNarrative, setGeminiNarrative] = useState<UnifiedClinicalNarrative | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [dismissedRowKeys, setDismissedRowKeys] = useState<Set<string>>(new Set());
  const [planModificationFeedback, setPlanModificationFeedback] = useState<string | null>(null);

  const assessmentRunRef = useRef<string>('');
  const geminiRunRef = useRef<string>('');
  const geminiFetchIdRef = useRef(0);
  const runAssessmentRef = useRef(runClinicalAssessmentEngine);
  runAssessmentRef.current = runClinicalAssessmentEngine;

  const plan = useMemo(
    () => (patientId ? getExercisePlan(patientId) : undefined),
    [patientId, getExercisePlan]
  );

  const intakeFields = useMemo(
    () => (safePatient ? loadLatestIntakeFields(safePatient) : null),
    [safePatient]
  );

  const continuationProtocol = useMemo(
    () => formatContinuationProtocol(intakeFields?.treatmentProtocol),
    [intakeFields?.treatmentProtocol]
  );

  const prognosis = useMemo(
    () => intakeFields?.prognosisHypothesis?.trim() ?? '',
    [intakeFields?.prognosisHypothesis]
  );

  const exerciseCatalog = useMemo(() => {
    if (!safePatient) return null;
    return buildClinicalExerciseCatalog(safePatient, plan?.exercises ?? []);
  }, [safePatient, plan?.exercises]);

  const aggregated = useMemo(() => {
    if (!safePatient || !patientId) return null;
    const dailyHistoryForPatient = patientMapLookup(dailyHistoryByPatient ?? {}, patientId);
    try {
      return aggregateClinicalInsights({
        patient: safePatient,
        clinicalToday,
        plan,
        dailyHistoryForPatient,
        selfSelectedZones: getSelfCareZones(patientId) ?? [],
        selfCareReports: getSelfCareReportsForPatient(patientId) ?? [],
        finishReports: patientMapLookup(patientExerciseFinishReportsByPatientId ?? {}, patientId) ?? [],
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
      return computeClinicalProgressInsight(safePatient, clinicalToday, {
        activeStreakStart: aggregated?.activeStreak.activeStreakStart,
        activeStreakCompliance:
          aggregated?.adherencePercent != null ? aggregated.adherencePercent / 100 : null,
        avgPainActiveStreak: aggregated?.avgPainActiveStreakPrimary ?? null,
      });
    } catch (err) {
      console.error('[SmartClinical] Error computing progress insight:', err);
      return null;
    }
  }, [
    safePatient,
    patientId,
    clinicalToday,
    painHistoryLen,
    sessionHistoryLen,
    aggregated?.activeStreak.activeStreakStart,
    aggregated?.adherencePercent,
    aggregated?.avgPainActiveStreakPrimary,
  ]);

  const aggregatedKey = aggregatedSnapshotKey(aggregated);
  const progressInsightKey = progressInsightSnapshotKey(progressInsight);

  const localNarrative = useMemo(() => {
    if (!safePatient || !aggregated) return null;
    try {
      return buildUnifiedClinicalNarrative(
        aggregated,
        getPatientDisplayName(safePatient),
        progressInsight,
        exerciseCatalog ?? undefined
      );
    } catch (err) {
      console.error('[SmartClinical] Error building local narrative:', err);
      return null;
    }
  }, [safePatient, aggregatedKey, progressInsightKey, exerciseCatalog]);

  const pendingRecommendations = useMemo((): PendingClinicalRecommendation[] => {
    if (!patientId) return [];
    const excludedCategoryKeys = therapistReviewedCategoryKeySet(
      collectRecentTherapistReviewedSuggestions(aiSuggestions ?? [], patientId, clinicalToday)
    );
    return filterTherapistPendingAiSuggestions(aiSuggestions ?? [], patientId, {
      extraDismissedSignatures:
        patient?.clinicalInsightsQueue?.dismissedRecommendationSignatures ?? [],
      excludedCategoryKeys,
    })
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
  }, [patientId, patient?.clinicalInsightsQueue?.dismissedRecommendationSignatures, aiSuggestions, clinicalToday]);

  useEffect(() => {
    if (!patientId || !safePatient) setIsLoading(false);
    else setIsLoading(false);
  }, [patientId, safePatient, aggregatedKey, progressInsightKey]);

  useEffect(() => {
    assessmentRunRef.current = '';
    geminiRunRef.current = '';
    setGeminiNarrative(null);
    setGeminiError(null);
    setGeminiLoading(false);
    setDismissedRowKeys(new Set());
    setPlanModificationFeedback(null);
  }, [patientId]);

  useEffect(() => {
    if (!patientId || isLoading) return;
    const signature = [
      patientId,
      clinicalToday,
      aggregatedKey ?? '',
      progressInsightKey ?? '',
      therapistNotes.trim(),
    ].join('|');
    if (assessmentRunRef.current === signature) return;
    assessmentRunRef.current = signature;
    void runAssessmentRef.current(patientId, therapistNotes);
  }, [patientId, isLoading, clinicalToday, aggregatedKey, progressInsightKey, therapistNotes]);

  useEffect(() => {
    if (!patientId || isLoading || !aggregatedKey || !progressInsightKey || !exerciseCatalog) {
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
    if (!aggregated || !progressInsight || !safePatient) {
      setGeminiLoading(false);
      return;
    }

    let cancelled = false;
    const fetchId = ++geminiFetchIdRef.current;
    setGeminiLoading(true);
    setGeminiError(null);

    const fetchInsights = async () => {
      try {
        const n = await analyzeSmartClinicalCenterWithGemini({
          aggregated,
          patient: safePatient,
          progressInsight,
          catalog: exerciseCatalog,
          continuationProtocol,
          prognosis,
        });
        if (!cancelled && fetchId === geminiFetchIdRef.current) {
          setGeminiNarrative(n);
          setDismissedRowKeys(new Set());
        }
      } catch (e) {
        if (!cancelled && fetchId === geminiFetchIdRef.current) {
          setGeminiNarrative(null);
          setGeminiError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (fetchId === geminiFetchIdRef.current) {
          setGeminiLoading(false);
        }
      }
    };

    void fetchInsights();

    return () => {
      cancelled = true;
    };
  }, [
    patientId,
    isLoading,
    aggregatedKey,
    progressInsightKey,
    continuationProtocol,
    prognosis,
    exerciseCatalog,
    safePatient,
  ]);

  const narrative = geminiNarrative ?? localNarrative;
  const narrativeSource: TherapistSmartClinicalState['narrativeSource'] = geminiNarrative
    ? 'gemini'
    : localNarrative
      ? 'local'
      : null;

  const visibleApprovableRows = useMemo(() => {
    if (!narrative || narrative.modifications.length === 0) return [];
    return flattenApprovableRows(narrative).filter(
      (row) => !dismissedRowKeys.has(approvableRowKey(row))
    );
  }, [narrative, dismissedRowKeys, narrativeSource]);

  const planHandlers = useMemo(
    () => ({
      updateExerciseInPlan,
      addExerciseToPlan,
      removeExerciseFromPlan,
      replaceExercisePlanForPatient,
      getPlanExercises: (id: string) => readExercisePlanSnapshot(id),
    }),
    [
      updateExerciseInPlan,
      addExerciseToPlan,
      removeExerciseFromPlan,
      replaceExercisePlanForPatient,
      readExercisePlanSnapshot,
    ]
  );

  const approveApprovableRow = useCallback(
    (row: ApprovablePlanRow) => {
      if (!patientId) return;
      const result =
        row.kind === 'exercise'
          ? applySuggestedExerciseChange(patientId, row.item, planHandlers)
          : applyLoadAdjustment(patientId, row.item, planHandlers);
      setDismissedRowKeys((prev) => new Set([...prev, approvableRowKey(row)]));
      setPlanModificationFeedback(
        result.ok ? 'השינוי יושם בתוכנית המקומית.' : result.error
      );
      setTimeout(() => setPlanModificationFeedback(null), 4000);
    },
    [patientId, planHandlers]
  );

  const dismissApprovableRow = useCallback((row: ApprovablePlanRow) => {
    setDismissedRowKeys((prev) => new Set([...prev, approvableRowKey(row)]));
  }, []);

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
    visibleApprovableRows,
    pendingRecommendations,
    isLoading,
    isClinicalContextReady: !isLoading,
    approveApprovableRow,
    dismissApprovableRow,
    planModificationFeedback,
  };
}
