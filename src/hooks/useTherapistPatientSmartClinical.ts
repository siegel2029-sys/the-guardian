import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { Patient } from '../types';
import { usePatientExercisePlans } from '../context/patientDomainHooks';
import { aggregateClinicalInsights } from '../services/clinicalInsightsAggregation';
import { computeClinicalProgressInsight } from '../ai/clinicalCommandInsight';
import {
  approvableRowKey,
  buildUnifiedClinicalNarrative,
  type UnifiedClinicalNarrative,
} from '../ai/clinicalInsightsNarrative';
import { analyzeSmartClinicalCenterWithGemini } from '../ai/geminiSmartClinicalCenter';
import { getGeminiApiKey } from '../ai/geminiClient';
import { getPatientDisplayName } from '../utils/patientDisplayName';
import { loadLatestIntakeFields } from '../utils/clinicalIntakeVersions';
import { formatContinuationProtocol } from '../utils/continuationProtocolDisplay';
import { buildClinicalExerciseCatalog } from '../utils/clinicalExerciseCatalog';
import type { ClinicalExerciseCatalog } from '../utils/clinicalExerciseCatalog';
import { useUnifiedClinicalActions } from './useUnifiedClinicalActions';
import type { UnifiedClinicalAction } from '../utils/clinicalUnifiedActions';
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
  exerciseCatalog: ClinicalExerciseCatalog | null;
  geminiLoading: boolean;
  geminiError: string | null;
  geminiAvailable: boolean;
  generateGeminiInsights: () => void;
  /** Gemini-sourced plan recommendations awaiting therapist Approve/Decline. */
  unifiedActions: UnifiedClinicalAction[];
  isLoading: boolean;
  isClinicalContextReady: boolean;
  approveUnifiedAction: (action: UnifiedClinicalAction) => void;
  dismissUnifiedAction: (action: UnifiedClinicalAction) => void;
  planModificationFeedback: string | null;
};

const EMPTY_CLINICAL_STATE: TherapistSmartClinicalState = {
  aggregated: null,
  progressInsight: null,
  narrative: null,
  narrativeSource: null,
  exerciseCatalog: null,
  geminiLoading: false,
  geminiError: null,
  geminiAvailable: false,
  generateGeminiInsights: () => {},
  unifiedActions: [],
  isLoading: false,
  isClinicalContextReady: true,
  approveUnifiedAction: () => {},
  dismissUnifiedAction: () => {},
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

/**
 * Smart Clinical Center — narrative + optional Gemini plan recommendations.
 * Recommendations apply only via explicit Approve (plan mutation handlers).
 */
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
    updateExerciseInPlan,
    addExerciseToPlan,
    removeExerciseFromPlan,
    replaceExercisePlanForPatient,
  } = usePatientExercisePlans();

  const patientId = patient?.id?.trim() || null;
  const safePatient = patientId && patient ? withSafePatientAnalytics(patient) : null;

  const painHistoryLen = safePatient?.analytics.painHistory.length ?? 0;
  const sessionHistoryLen = safePatient?.analytics.sessionHistory.length ?? 0;

  const [isLoading, setIsLoading] = useState(false);
  const [geminiNarrative, setGeminiNarrative] = useState<UnifiedClinicalNarrative | null>(null);
  const [geminiLoading, setGeminiLoading] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [dismissedRowKeys, setDismissedRowKeys] = useState<Set<string>>(new Set());
  const [planModificationFeedback, setPlanModificationFeedback] = useState<string | null>(null);

  const geminiFetchIdRef = useRef(0);

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
        treatmentProtocol: intakeFields?.treatmentProtocol,
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
    intakeFields?.treatmentProtocol,
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

  const aggregatedRef = useRef(aggregated);
  const progressInsightRef = useRef(progressInsight);
  const safePatientRef = useRef(safePatient);
  const exerciseCatalogRef = useRef(exerciseCatalog);
  const continuationProtocolRef = useRef(continuationProtocol);
  const prognosisRef = useRef(prognosis);

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
  }, [safePatient, aggregatedKey, progressInsightKey, exerciseCatalog, progressInsight, aggregated]);

  useEffect(() => {
    if (!patientId || !safePatient) setIsLoading(false);
    else setIsLoading(false);
  }, [patientId, safePatient, aggregatedKey, progressInsightKey]);

  useEffect(() => {
    geminiFetchIdRef.current += 1;
    setGeminiNarrative(null);
    setGeminiError(null);
    setGeminiLoading(false);
    setDismissedRowKeys(new Set());
    setPlanModificationFeedback(null);
  }, [patientId]);

  aggregatedRef.current = aggregated;
  progressInsightRef.current = progressInsight;
  safePatientRef.current = safePatient;
  exerciseCatalogRef.current = exerciseCatalog;
  continuationProtocolRef.current = continuationProtocol;
  prognosisRef.current = prognosis;

  const generateGeminiInsights = useCallback(() => {
    if (!patientId || isLoading) return;
    if (!getGeminiApiKey()) {
      setGeminiError('Gemini לא זמין — בדקו הגדרות Supabase / gemini-proxy.');
      return;
    }
    const agg = aggregatedRef.current;
    const insight = progressInsightRef.current;
    const patientSafe = safePatientRef.current;
    const catalog = exerciseCatalogRef.current;
    if (!agg || !insight || !patientSafe || !catalog) {
      setGeminiError('נתוני מעקב עדיין לא מוכנים — נסו שוב בעוד רגע.');
      return;
    }

    const fetchId = ++geminiFetchIdRef.current;
    setGeminiLoading(true);
    setGeminiError(null);

    void (async () => {
      try {
        const n = await analyzeSmartClinicalCenterWithGemini({
          aggregated: agg,
          patient: patientSafe,
          progressInsight: insight,
          catalog,
          continuationProtocol: continuationProtocolRef.current,
          prognosis: prognosisRef.current,
        });
        if (fetchId === geminiFetchIdRef.current) {
          setGeminiNarrative(n);
          setDismissedRowKeys(new Set());
        }
      } catch (e) {
        if (fetchId === geminiFetchIdRef.current) {
          setGeminiNarrative(null);
          setGeminiError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (fetchId === geminiFetchIdRef.current) {
          setGeminiLoading(false);
        }
      }
    })();
  }, [patientId, isLoading]);

  const narrative = geminiNarrative ?? localNarrative;
  const narrativeSource: TherapistSmartClinicalState['narrativeSource'] = geminiNarrative
    ? 'gemini'
    : localNarrative
      ? 'local'
      : null;

  // Only Gemini modifications become actionable cards (not legacy AI suggestion queue).
  const { unifiedActions } = useUnifiedClinicalActions({
    narrative: geminiNarrative,
    pendingSuggestions: [],
    dismissedAiRowKeys: dismissedRowKeys,
    dismissedPendingIds: new Set(),
    catalog: exerciseCatalog,
  });

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

  const approveUnifiedAction = useCallback(
    (action: UnifiedClinicalAction) => {
      if (!patientId || action.kind !== 'ai_modification') return;
      const row = action.row;
      const result =
        row.kind === 'exercise'
          ? applySuggestedExerciseChange(patientId, row.item, planHandlers)
          : applyLoadAdjustment(patientId, row.item, planHandlers);
      setDismissedRowKeys((prev) => new Set([...prev, approvableRowKey(row)]));
      setPlanModificationFeedback(
        result.ok ? 'ההמלצה אושרה ועודכנה בתוכנית.' : result.message
      );
      setTimeout(() => setPlanModificationFeedback(null), 4000);
    },
    [patientId, planHandlers]
  );

  const dismissUnifiedAction = useCallback((action: UnifiedClinicalAction) => {
    if (action.kind === 'ai_modification') {
      setDismissedRowKeys((prev) => new Set([...prev, action.id]));
    }
  }, []);

  if (!patientId || !safePatient) {
    return EMPTY_CLINICAL_STATE;
  }

  return {
    aggregated,
    progressInsight,
    narrative,
    narrativeSource,
    exerciseCatalog,
    geminiLoading,
    geminiError,
    geminiAvailable: Boolean(getGeminiApiKey()),
    generateGeminiInsights,
    unifiedActions,
    isLoading,
    isClinicalContextReady: !isLoading,
    approveUnifiedAction,
    dismissUnifiedAction,
    planModificationFeedback,
  };
}
