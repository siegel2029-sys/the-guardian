/**
 * Clinical tracking consolidation + retired plan-recommendation generator.
 *
 * Phase 3: `generateClinicalRecommendation` always returns null.
 * Actionable plan changes are owned solely by Program Review proposals.
 * `consolidateClinicalTracking` remains for analytics / narrative gates.
 */

import type {
  AiSuggestion,
  AiSuggestionStatus,
  DailyHistoryEntry,
  Patient,
  PatientExercise,
} from '../types';
import {
  evaluateAiProgramLongitudinalGate,
  type AiLongitudinalGateResult,
  type AiProgramLongitudinalTrigger,
} from './aiProgramLongitudinalGate';
import {
  computeClinicalProgressInsight,
  type ClinicalProgressInsight,
} from './clinicalCommandInsight';
import {
  analyzePatientProgress,
  buildPatientProgressPayload,
  type PatientProgressAnalysis,
} from './patientProgressReasoning';
import type { TherapistReviewedSuggestion } from '../utils/clinicalAiQueueMerge';

export type ClinicalRecommendationIntent =
  | 'progression'
  | 'regression'
  | 'reengagement'
  | 'maintain'
  | 'none';

export type ConsolidatedClinicalTracking = {
  longitudinalGate: AiLongitudinalGateResult;
  progressInsight: ClinicalProgressInsight;
  progressAnalysis: PatientProgressAnalysis;
  recommendationIntent: ClinicalRecommendationIntent;
  trackingSummaryHebrew: string;
  triggers: AiProgramLongitudinalTrigger[];
};

export type ConsolidateClinicalTrackingInput = {
  patient: Patient;
  clinicalToday: string;
  dayMap: Record<string, DailyHistoryEntry | undefined> | undefined;
  rehabExerciseCount: number;
};

/** Merge deterministic tracking from gate, command insight, and progress reasoning. */
export function consolidateClinicalTracking(
  input: ConsolidateClinicalTrackingInput
): ConsolidatedClinicalTracking {
  const { patient, clinicalToday, dayMap, rehabExerciseCount } = input;

  const longitudinalGate = evaluateAiProgramLongitudinalGate({
    patient,
    clinicalToday,
    dayMap,
    rehabExerciseCount,
  });

  const progressInsight = computeClinicalProgressInsight(patient, clinicalToday);
  const progressAnalysis = analyzePatientProgress(
    buildPatientProgressPayload(patient, [])
  );

  let recommendationIntent: ClinicalRecommendationIntent = 'none';

  if (longitudinalGate.triggers.includes('positive_progression_level_up')) {
    recommendationIntent = 'progression';
  } else if (longitudinalGate.triggers.includes('return_from_absence_reengagement')) {
    recommendationIntent = 'reengagement';
  } else if (
    longitudinalGate.triggers.some((t) =>
      (
        [
          'low_compliance_3_consecutive_days',
          'pain_increasing_3_consecutive_days',
          'functional_decline_rom_proxy',
        ] as AiProgramLongitudinalTrigger[]
      ).includes(t)
    )
  ) {
    recommendationIntent = 'regression';
  } else if (
    progressInsight.category === 'load_increase' &&
    progressAnalysis.allowExerciseLoadIncrease
  ) {
    recommendationIntent = 'progression';
  } else if (
    progressInsight.category === 'load_decrease' ||
    progressInsight.category === 'escalate_care'
  ) {
    recommendationIntent = 'regression';
  } else if (progressInsight.category === 'maintain' && longitudinalGate.shouldSuggest) {
    recommendationIntent = 'regression';
  }

  const summaryParts = [
    longitudinalGate.summaryHebrew,
    progressInsight.titleHe !== 'מגמת יציבות' ? progressInsight.summaryHe : '',
    progressAnalysis.relationshipSummaryHebrew,
  ].filter(Boolean);

  return {
    longitudinalGate,
    progressInsight,
    progressAnalysis,
    recommendationIntent,
    trackingSummaryHebrew: summaryParts.join(' ').trim() || 'אין מגמה משמעותית — ממשיכים במעקב.',
    triggers: longitudinalGate.triggers,
  };
}

export type TherapistReviewHistoryEntry = Pick<
  TherapistReviewedSuggestion,
  'categoryKey' | 'status' | 'type' | 'field' | 'exerciseName' | 'reason'
>;

export type GenerateClinicalRecommendationParams = {
  patient: Patient;
  clinicalExercises: PatientExercise[];
  clinicalToday: string;
  dayMap?: Record<string, DailyHistoryEntry | undefined>;
  /** Longitudinal gate from caller (optional — recomputed when omitted). */
  longitudinalGate?: AiLongitudinalGateResult;
  /**
   * `pending` — patient portal (must agree before therapist queue).
   * `awaiting_therapist` — system/therapist-facing queue (skips patient consent).
   */
  defaultStatus?: AiSuggestionStatus;
  /** Recently therapist-approved/dismissed recommendations — injected into Gemini context. */
  therapistReviewHistory?: TherapistReviewHistoryEntry[];
};

/**
 * Plan-shaped AI recommendations retired (Phase 3 UX unification).
 * Program Review (`program_review_proposals`) is the sole actionable plan path.
 * Tracking helpers above remain for analytics / narrative gates.
 *
 * Always returns null — kept as a stable export so call sites compile without
 * reintroducing competing Approve/Decline plan mutations.
 */
export async function generateClinicalRecommendation(
  _params: GenerateClinicalRecommendationParams
): Promise<AiSuggestion | null> {
  return null;
}

/** Back-compat alias used by patient portal modal flow. */
export type AiPlanAdjustmentGeminiParams = {
  patient: Patient;
  clinicalExercises: PatientExercise[];
  longitudinalGate: AiLongitudinalGateResult;
  clinicalToday?: string;
  dayMap?: Record<string, DailyHistoryEntry | undefined>;
};

export async function fetchAiPlanAdjustmentSuggestion(
  params: AiPlanAdjustmentGeminiParams
): Promise<AiSuggestion | null> {
  return generateClinicalRecommendation({
    patient: params.patient,
    clinicalExercises: params.clinicalExercises,
    clinicalToday: params.clinicalToday ?? new Date().toISOString().slice(0, 10),
    dayMap: params.dayMap,
    longitudinalGate: params.longitudinalGate,
    defaultStatus: 'pending',
  });
}
