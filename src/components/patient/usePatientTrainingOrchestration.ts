import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import type {
  AiSuggestion,
  PatientExercise,
  BodyArea,
  Patient,
  ExercisePlan,
  DailyHistoryEntry,
  PatientExerciseFinishReport,
} from '../../types';
import { bodyAreaLabels } from '../../types';
import type { StrengthExerciseLevelDef } from '../../data/strengthExerciseDatabase';
import type { ExerciseTrainingFeedbackPayload } from './ExerciseTrainingFeedbackModal';
import {
  PAIN_SURGE_PATIENT_COPY,
  DIFFICULTY_MAX_PATIENT_COPY,
} from '../../safety/clinicalEmergencyScreening';
import { fetchAiPlanAdjustmentSuggestion } from '../../ai/clinicalRecommendationEngine';
import type { AiLongitudinalGateResult } from '../../ai/aiProgramLongitudinalGate';
import { getOptionalPoolExerciseId } from '../../utils/optionalExerciseUnlock';
import { portalTrainingAiPlanModalAckKey, type PortalTab } from './patientPortalRouting';
import type { UseOptionalRehabPoolResult } from './useOptionalRehabPool';

export type ExerciseVideoModalState =
  | null
  | { kind: 'rehab'; exercise: PatientExercise; xpAward: number; coinsAward: number }
  | {
      kind: 'selfCare';
      bodyArea: BodyArea;
      exercise: StrengthExerciseLevelDef;
      xpAward: number;
      coinsAward: number;
    };

export type PendingTrainingSession = NonNullable<ExerciseVideoModalState> & {
  patientId: string;
  planRowId?: string;
  isManualPlan?: boolean;
};

type SubmitExerciseReportFn = (
  patientId: string,
  exerciseId: string,
  painLevel: number,
  effortRating: number,
  xpReward: number,
  options?: {
    skipPainHistory?: boolean;
    completionSource?: 'rehab' | 'self-care';
    sessionBodyArea?: BodyArea;
    optionalPoolNoReward?: boolean;
    planRowId?: string;
    isManualPlan?: boolean;
  }
) => boolean | Promise<boolean>;

export interface UsePatientTrainingOrchestrationParams {
  selectedPatient: Patient | null | undefined;
  getExercisePlan: (patientId: string) => ExercisePlan | undefined;
  exercises: PatientExercise[];
  selectedZones: BodyArea[];
  clinicalRehabExercises: PatientExercise[];
  clinicalToday: string;
  patientDayMap: Record<string, DailyHistoryEntry | undefined>;
  portalTab: PortalTab;
  patientMustChangePassword: boolean;
  exercisesLocked: boolean;
  portalOnboardingSilence: boolean;
  aiProgramLongitudinalGate: AiLongitudinalGateResult | null;
  optionalPool: Pick<
    UseOptionalRehabPoolResult,
    | 'fullOptionalPool'
    | 'optionalPoolCompletionCount'
    | 'getNextOptionalAfterAddingId'
    | 'sessionNextOptionalPoolItem'
    | 'signalOptionalReveal'
  >;
  submitExerciseReport: SubmitExerciseReportFn;
  appendPatientExerciseFinishReport: (
    patientId: string,
    entry: Omit<PatientExerciseFinishReport, 'id' | 'patientId' | 'timestamp'>
  ) => void | Promise<void>;
  logSelfCareSession: (
    patientId: string,
    exerciseId: string,
    exerciseName: string,
    effortRating: number
  ) => void;
  getSelfCareStrengthTier: (patientId: string, area: BodyArea) => 0 | 1 | 2;
  submitPatientAiPlanAdjustmentRequest: (suggestion: AiSuggestion) => void;
}

export function usePatientTrainingOrchestration({
  selectedPatient,
  getExercisePlan,
  exercises,
  selectedZones,
  clinicalRehabExercises,
  clinicalToday,
  patientDayMap,
  portalTab,
  patientMustChangePassword,
  exercisesLocked,
  portalOnboardingSilence,
  aiProgramLongitudinalGate,
  optionalPool,
  submitExerciseReport,
  appendPatientExerciseFinishReport,
  logSelfCareSession,
  getSelfCareStrengthTier,
  submitPatientAiPlanAdjustmentRequest,
}: UsePatientTrainingOrchestrationParams) {
  const {
    fullOptionalPool,
    optionalPoolCompletionCount,
    getNextOptionalAfterAddingId,
    sessionNextOptionalPoolItem,
    signalOptionalReveal,
  } = optionalPool;

  const [exerciseVideoModal, setExerciseVideoModal] = useState<ExerciseVideoModalState>(null);
  const pendingTrainingSessionRef = useRef<PendingTrainingSession | null>(null);
  const [pendingTrainingSession, setPendingTrainingSession] =
    useState<PendingTrainingSession | null>(null);
  const [trainingFeedbackOpen, setTrainingFeedbackOpen] = useState(false);
  const [trainingSubmitError, setTrainingSubmitError] = useState<string | null>(null);
  const [trainingAiPlanModalOpen, setTrainingAiPlanModalOpen] = useState(false);
  const [trainingAiPlanModalLoading, setTrainingAiPlanModalLoading] = useState(false);
  const [trainingAiPlanModalSuggestion, setTrainingAiPlanModalSuggestion] =
    useState<AiSuggestion | null>(null);
  const [trainingAiPlanModalInfo, setTrainingAiPlanModalInfo] = useState<string | null>(null);
  const [aiSteadyBannerDismissed, setAiSteadyBannerDismissed] = useState(false);
  const [loadSafetyNudge, setLoadSafetyNudge] = useState<string | null>(null);
  const [optionalGlowBoost, setOptionalGlowBoost] = useState(0);
  const trainingAiFetchKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setOptionalGlowBoost(0);
  }, [selectedPatient?.id, clinicalToday]);

  useEffect(() => {
    setAiSteadyBannerDismissed(false);
  }, [selectedPatient?.id, clinicalToday]);

  useEffect(() => {
    setLoadSafetyNudge(null);
  }, [selectedPatient?.id]);

  const capturePendingTrainingSession = useCallback(
    (modal: NonNullable<ExerciseVideoModalState>): PendingTrainingSession | null => {
      if (!selectedPatient) return null;
      const activePlan = getExercisePlan(selectedPatient.id);
      const hasCachedPlan =
        (selectedPatient._exercisePlanCache?.length ?? 0) > 0 ||
        (activePlan?.exercises.length ?? 0) > 0;
      const session: PendingTrainingSession = {
        ...modal,
        patientId: selectedPatient.id,
        planRowId: activePlan?.planRowId,
        isManualPlan: !activePlan?.planRowId && hasCachedPlan,
      };
      pendingTrainingSessionRef.current = session;
      setPendingTrainingSession(session);
      if (import.meta.env.DEV) {
        console.log('[TrainingSession] captured pending context:', {
          patientId: session.patientId,
          exerciseId: session.exercise.id,
          planRowId: session.planRowId ?? null,
          isManualPlan: session.isManualPlan ?? false,
          kind: session.kind,
        });
      }
      return session;
    },
    [selectedPatient, getExercisePlan]
  );

  const openExerciseTrainingModal = useCallback(
    (modal: NonNullable<ExerciseVideoModalState>) => {
      capturePendingTrainingSession(modal);
      setTrainingFeedbackOpen(false);
      setTrainingSubmitError(null);
      setExerciseVideoModal(modal);
    },
    [capturePendingTrainingSession]
  );

  const clearTrainingSession = useCallback(() => {
    pendingTrainingSessionRef.current = null;
    setPendingTrainingSession(null);
    setTrainingFeedbackOpen(false);
    setTrainingSubmitError(null);
    setExerciseVideoModal(null);
  }, []);

  useEffect(() => {
    if (exercisesLocked) clearTrainingSession();
  }, [exercisesLocked, clearTrainingSession]);

  useEffect(() => {
    if (!exerciseVideoModal) return;
    const mid = exerciseVideoModal.exercise.id;
    const nextId = sessionNextOptionalPoolItem
      ? getOptionalPoolExerciseId(sessionNextOptionalPoolItem)
      : null;
    if (nextId === mid) return;
    const wasInOptionalPool = fullOptionalPool.some((p) => getOptionalPoolExerciseId(p) === mid);
    if (wasInOptionalPool) {
      clearTrainingSession();
    }
  }, [
    sessionNextOptionalPoolItem?.poolKey,
    fullOptionalPool,
    exerciseVideoModal,
    clearTrainingSession,
  ]);

  const trainingTabContextKey = useMemo(() => {
    const zoneKey = [...selectedZones].sort().join(',');
    const exKey = [...exercises.map((e) => e.id)].sort().join(',');
    return `${zoneKey}|${exKey}`;
  }, [selectedZones, exercises]);

  const acknowledgeTrainingAiPlanModal = useCallback(() => {
    if (selectedPatient) {
      try {
        sessionStorage.setItem(portalTrainingAiPlanModalAckKey(selectedPatient.id, clinicalToday), '1');
      } catch {
        /* ייתכן מצב פרטי / חסימת אחסון */
      }
    }
    setTrainingAiPlanModalOpen(false);
    setTrainingAiPlanModalSuggestion(null);
    setTrainingAiPlanModalInfo(null);
  }, [selectedPatient, clinicalToday]);

  const handleTrainingAiPlanApprove = useCallback(() => {
    if (trainingAiPlanModalSuggestion) {
      submitPatientAiPlanAdjustmentRequest(trainingAiPlanModalSuggestion);
    }
    acknowledgeTrainingAiPlanModal();
  }, [
    trainingAiPlanModalSuggestion,
    submitPatientAiPlanAdjustmentRequest,
    acknowledgeTrainingAiPlanModal,
  ]);

  useEffect(() => {
    const patientId = selectedPatient?.id;
    if (
      !patientId ||
      portalTab !== 'activity' ||
      patientMustChangePassword ||
      exercisesLocked ||
      portalOnboardingSilence
    ) {
      trainingAiFetchKeyRef.current = null;
      setTrainingAiPlanModalOpen(false);
      setTrainingAiPlanModalLoading(false);
      setTrainingAiPlanModalSuggestion(null);
      setTrainingAiPlanModalInfo(null);
      return;
    }

    const gate = aiProgramLongitudinalGate;
    if (!gate || clinicalRehabExercises.length === 0 || !gate.shouldSuggest) {
      trainingAiFetchKeyRef.current = null;
      setTrainingAiPlanModalOpen(false);
      setTrainingAiPlanModalLoading(false);
      setTrainingAiPlanModalSuggestion(null);
      setTrainingAiPlanModalInfo(null);
      return;
    }

    try {
      if (sessionStorage.getItem(portalTrainingAiPlanModalAckKey(patientId, clinicalToday)) === '1') {
        setTrainingAiPlanModalOpen(false);
        return;
      }
    } catch {
      /* ignore */
    }

    const fetchKey = `${patientId}|${clinicalToday}|${trainingTabContextKey}|${gate.shouldSuggest}`;
    if (trainingAiFetchKeyRef.current === fetchKey) {
      return;
    }
    trainingAiFetchKeyRef.current = fetchKey;

    let cancelled = false;
    setTrainingAiPlanModalOpen(true);
    setTrainingAiPlanModalLoading(true);
    setTrainingAiPlanModalSuggestion(null);
    setTrainingAiPlanModalInfo(null);

    const patient = selectedPatient;
    const clinical = clinicalRehabExercises;

    void (async () => {
      const sug = await fetchAiPlanAdjustmentSuggestion({
        patient,
        clinicalExercises: clinical,
        longitudinalGate: gate,
        clinicalToday,
        dayMap: patientDayMap,
      });
      if (cancelled) return;
      setTrainingAiPlanModalLoading(false);
      if (sug) {
        setTrainingAiPlanModalSuggestion(sug);
        setTrainingAiPlanModalInfo(null);
      } else {
        setTrainingAiPlanModalSuggestion(null);
        setTrainingAiPlanModalInfo(
          'אין כרגע תרגילי שיקום בתוכנית שאפשר להציע עבורם שינוי אוטומטי.'
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    portalTab,
    selectedPatient?.id,
    patientMustChangePassword,
    clinicalToday,
    trainingTabContextKey,
    exercisesLocked,
    clinicalRehabExercises.length,
    aiProgramLongitudinalGate?.shouldSuggest,
    portalOnboardingSilence,
  ]);

  // MUTED: Guardi session-complete / mandatory-extra / companion eligibility triggers removed pending redesign.

  const pushExerciseCompleteMilestone = (_painLevel?: number) => {
    // MUTED: Guardi pop-up on single exercise completion disabled pending redesign.
  };

  const handleTrainingComplete = async (
    payload: ExerciseTrainingFeedbackPayload
  ): Promise<boolean> => {
    const m = pendingTrainingSession ?? pendingTrainingSessionRef.current;
    if (import.meta.env.DEV) {
      console.log('[TrainingComplete] submitting with pending session:', {
        hasPendingState: Boolean(pendingTrainingSession),
        hasPendingRef: Boolean(pendingTrainingSessionRef.current),
        patientId: m?.patientId ?? null,
        exerciseId: m?.exercise.id ?? null,
        planRowId: m?.planRowId ?? null,
        isManualPlan: m?.isManualPlan ?? false,
        kind: m?.kind ?? null,
        payload,
      });
    }
    if (!selectedPatient || !m || m.patientId !== selectedPatient.id) {
      setTrainingSubmitError('לא נמצאו פרטי התרגיל. סגרו ופתחו את האימון מחדש.');
      return false;
    }

    const exerciseInOptionalPool = fullOptionalPool.some(
      (p) => getOptionalPoolExerciseId(p) === m.exercise.id
    );
    const optionalPoolNoReward = exerciseInOptionalPool && optionalPoolCompletionCount >= 1;

    if (m.kind === 'selfCare') {
      const strengthTier = getSelfCareStrengthTier(selectedPatient.id, m.bodyArea);
      const strengthTierLabel =
        strengthTier === 0 ? 'קל' : strengthTier === 1 ? 'בינוני' : 'קשה';
      const planXpForSelfCare = Math.max(1, Math.floor(m.exercise.xpReward * 0.5));
      const nextAfterOptional =
        exerciseInOptionalPool ? getNextOptionalAfterAddingId(m.exercise.id) : null;
      const saved = await submitExerciseReport(
        selectedPatient.id,
        m.exercise.id,
        payload.painLevel,
        payload.effort,
        planXpForSelfCare,
        {
          skipPainHistory: true,
          completionSource: 'self-care',
          sessionBodyArea: m.bodyArea,
          optionalPoolNoReward,
        }
      );
      if (!saved) return false;
      await appendPatientExerciseFinishReport(selectedPatient.id, {
        exerciseId: m.exercise.id,
        exerciseName: m.exercise.name,
        zone: bodyAreaLabels[m.bodyArea],
        difficultyScore: payload.effort,
        effortScale: 10,
        painLevel: payload.painLevel,
        source: 'self-care',
        selfCareDifficultyTier: strengthTier,
        selfCareDifficultyLabel: strengthTierLabel,
      });
      if (nextAfterOptional) {
        signalOptionalReveal(true);
      }
      logSelfCareSession(
        selectedPatient.id,
        m.exercise.id,
        m.exercise.name,
        payload.effort
      );
      if (payload.effort >= 10) setLoadSafetyNudge(DIFFICULTY_MAX_PATIENT_COPY);
      else setLoadSafetyNudge(null);
      pushExerciseCompleteMilestone(payload.painLevel);
      return true;
    }

    const pain = payload.painLevel;
    const nextAfterOptional =
      m.exercise.isOptional && exerciseInOptionalPool
        ? getNextOptionalAfterAddingId(m.exercise.id)
        : null;
    const saved = await submitExerciseReport(
      selectedPatient.id,
      m.exercise.id,
      pain,
      payload.effort,
      m.exercise.xpReward,
      {
        completionSource: 'rehab',
        sessionBodyArea: m.exercise.targetArea,
        optionalPoolNoReward:
          m.exercise.isOptional && exerciseInOptionalPool && optionalPoolCompletionCount >= 1,
        planRowId: m.planRowId,
        isManualPlan: m.isManualPlan,
      }
    );
    if (!saved) return false;

    await appendPatientExerciseFinishReport(selectedPatient.id, {
      exerciseId: m.exercise.id,
      exerciseName: m.exercise.name,
      zone: bodyAreaLabels[m.exercise.targetArea],
      difficultyScore: payload.effort,
      effortScale: 10,
      painLevel: payload.painLevel,
      source: 'therapist',
    });
    if (nextAfterOptional) {
      signalOptionalReveal(true);
    }
    if (m.exercise.isOptional) {
      setOptionalGlowBoost((n) => Math.min(5, n + 1));
    }
    pushExerciseCompleteMilestone(pain);
    if (pain >= 7) setLoadSafetyNudge(PAIN_SURGE_PATIENT_COPY);
    else if (payload.effort >= 10) setLoadSafetyNudge(DIFFICULTY_MAX_PATIENT_COPY);
    else setLoadSafetyNudge(null);
    return true;
  };

  const handleFinishPractice = useCallback(() => {
    if (!exerciseVideoModal || !selectedPatient) return;
    capturePendingTrainingSession(exerciseVideoModal);
    setTrainingSubmitError(null);
    setTrainingFeedbackOpen(true);
  }, [exerciseVideoModal, selectedPatient, capturePendingTrainingSession]);

  return {
    exerciseVideoModal,
    pendingTrainingSession,
    trainingFeedbackOpen,
    setTrainingFeedbackOpen,
    trainingSubmitError,
    setTrainingSubmitError,
    trainingAiPlanModalOpen,
    trainingAiPlanModalLoading,
    trainingAiPlanModalSuggestion,
    trainingAiPlanModalInfo,
    acknowledgeTrainingAiPlanModal,
    handleTrainingAiPlanApprove,
    openExerciseTrainingModal,
    clearTrainingSession,
    handleTrainingComplete,
    handleFinishPractice,
    loadSafetyNudge,
    setLoadSafetyNudge,
    optionalGlowBoost,
    aiSteadyBannerDismissed,
    setAiSteadyBannerDismissed,
  };
}
