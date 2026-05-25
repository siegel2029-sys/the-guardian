/**
 * Unified AI Clinical Recommendation Engine (Phase 1).
 * Consolidates longitudinal gate, command insight, and progress reasoning;
 * delegates individualized load decisions to Gemini when available.
 *
 * Gated: all outputs are `pending` or `awaiting_therapist` — never mutates active plans.
 */

import type {
  AiSuggestion,
  AiSuggestionField,
  AiSuggestionStatus,
  AiSuggestionType,
  DailyHistoryEntry,
  Patient,
  PatientExercise,
} from '../types';
import { bodyAreaLabels } from '../types';
import {
  evaluateAiProgramLongitudinalGate,
  type AiLongitudinalGateResult,
  type AiProgramLongitudinalTrigger,
} from './aiProgramLongitudinalGate';
import {
  computeClinicalProgressInsight,
  type ClinicalProgressInsight,
  type ProgressInsightCategory,
} from './clinicalCommandInsight';
import {
  analyzePatientProgress,
  buildPatientProgressPayload,
  type PatientProgressAnalysis,
} from './patientProgressReasoning';
import { geminiGenerateText, getGeminiApiKey } from './geminiClient';
import { parseJsonObject } from './geminiClinicalIntake';
import {
  buildTherapistReviewHistoryPromptSection,
  clinicalRecommendationCategoryKey,
  type TherapistReviewedSuggestion,
} from '../utils/clinicalAiQueueMerge';

const LOG_PREFIX = '[ClinicalRecommendationEngine]';

const SUGGESTION_TYPES = new Set<AiSuggestionType>([
  'increase_reps',
  'increase_sets',
  'reduce_reps',
  'add_exercise',
]);

const SUGGESTION_FIELDS = new Set<AiSuggestionField>([
  'reps',
  'sets',
  'weight',
  'holdSeconds',
]);

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

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function pickTargetExercise(
  exercises: PatientExercise[],
  intent: ClinicalRecommendationIntent
): PatientExercise | null {
  if (exercises.length === 0) return null;
  const withReps = exercises.filter((e) => (e.patientReps ?? e.reps ?? 0) > 0);
  const withHold = exercises.filter((e) => (e.holdSeconds ?? 0) > 0);
  if (intent === 'progression' || intent === 'regression') {
    return withReps[0] ?? withHold[0] ?? exercises[0];
  }
  return withReps[0] ?? exercises[0];
}

function currentFieldValue(ex: PatientExercise, field: AiSuggestionField): number {
  if (field === 'reps') return ex.patientReps ?? ex.reps ?? 0;
  if (field === 'sets') return ex.patientSets ?? ex.sets ?? 0;
  if (field === 'holdSeconds') return ex.holdSeconds ?? 0;
  return ex.patientWeightKg ?? 0;
}

function resolveSuggestionType(
  field: AiSuggestionField,
  current: number,
  suggested: number
): AiSuggestionType {
  if (field === 'sets') {
    return suggested >= current ? 'increase_sets' : 'reduce_reps';
  }
  if (suggested >= current) return 'increase_reps';
  return 'reduce_reps';
}

function heuristicAdjustment(
  patientId: string,
  exercises: PatientExercise[],
  tracking: ConsolidatedClinicalTracking,
  defaultStatus: AiSuggestionStatus
): AiSuggestion | null {
  const ex = pickTargetExercise(exercises, tracking.recommendationIntent);
  if (!ex) return null;

  const { progressAnalysis, recommendationIntent, progressInsight } = tracking;
  const isHoldPrimary = (ex.holdSeconds ?? 0) > 0 && (ex.patientReps ?? ex.reps ?? 0) === 0;

  let field: AiSuggestionField = isHoldPrimary ? 'holdSeconds' : 'reps';
  let current = currentFieldValue(ex, field);
  if (current <= 0 && field === 'reps') {
    field = 'sets';
    current = currentFieldValue(ex, field);
  }
  if (current <= 0) return null;

  let suggested = current;
  let reason = '';

  if (recommendationIntent === 'reengagement') {
    suggested =
      field === 'holdSeconds'
        ? clampInt(Math.max(5, Math.floor(current * 0.7)), 5, current)
        : field === 'sets'
          ? clampInt(Math.max(1, current - 1), 1, current)
          : clampInt(Math.max(1, Math.floor(current * 0.65)), 1, current);
    reason =
      'לאחר הפסקה או חוסר היענות — כניסה חוזרת עדינה יותר. המלצה להקל זמנית ולבנות מחדש עקביות לפני העלאת עומס.';
  } else if (
    recommendationIntent === 'progression' &&
    progressAnalysis.allowExerciseLoadIncrease
  ) {
    if (field === 'holdSeconds') {
      suggested = clampInt(current + Math.max(3, Math.round(current * 0.1)), current + 1, 180);
    } else if (field === 'sets') {
      suggested = clampInt(current + 1, 1, 8);
    } else {
      suggested = clampInt(Math.max(current + 1, Math.round(current * 1.12)), 1, 80);
    }
    reason = [
      progressInsight.nextStepHe,
      progressAnalysis.relationshipSummaryHebrew,
      'המערכת מציעה התקדמות מדודה — יש לאשר עם המטפל לפני שינוי בתוכנית.',
    ]
      .filter(Boolean)
      .join(' ');
  } else if (recommendationIntent === 'regression') {
    if (field === 'holdSeconds') {
      suggested = clampInt(Math.max(5, Math.floor(current * 0.75)), 5, current);
    } else if (field === 'sets') {
      suggested = clampInt(Math.max(1, current - 1), 1, current);
    } else {
      suggested = clampInt(Math.max(1, Math.floor(current * 0.72)), 1, current);
    }
    reason =
      (progressAnalysis.refusalExplanationHebrew ??
        progressInsight.nextStepHe ??
        tracking.trackingSummaryHebrew) +
      ' המלצה להפחית עומס זמנית — אישור מטפל נדרש.';
  } else {
    return null;
  }

  if (suggested === current) return null;

  const type = resolveSuggestionType(field, current, suggested);

  return {
    id: `ai-engine-heuristic-${patientId}-${Date.now()}`,
    patientId,
    exerciseId: ex.id,
    exerciseName: ex.name,
    type,
    field,
    currentValue: current,
    suggestedValue: suggested,
    reason: reason.trim(),
    createdAt: new Date().toISOString(),
    status: defaultStatus,
    source: 'clinical_recommendation_engine',
  };
}

type GeminiRecommendationRaw = {
  exerciseId?: unknown;
  type?: unknown;
  field?: unknown;
  suggestedValue?: unknown;
  reasonHebrew?: unknown;
  clinicalRationaleHebrew?: unknown;
};

function normalizeGeminiRecommendation(
  raw: unknown,
  patientId: string,
  byId: Map<string, PatientExercise>,
  defaultStatus: AiSuggestionStatus
): AiSuggestion | null {
  const o = raw as GeminiRecommendationRaw;
  const exerciseId = typeof o.exerciseId === 'string' ? o.exerciseId.trim() : '';
  const ex = exerciseId ? byId.get(exerciseId) : undefined;
  if (!ex) return null;

  const typeRaw = typeof o.type === 'string' ? (o.type.trim() as AiSuggestionType) : null;
  if (!typeRaw || !SUGGESTION_TYPES.has(typeRaw)) return null;

  const fieldRaw =
    o.field === 'sets'
      ? ('sets' as const)
      : o.field === 'weight'
        ? ('weight' as const)
        : o.field === 'holdSeconds'
          ? ('holdSeconds' as const)
          : ('reps' as const);
  if (!SUGGESTION_FIELDS.has(fieldRaw)) return null;

  const currentValue = currentFieldValue(ex, fieldRaw);
  let suggestedValue =
    typeof o.suggestedValue === 'number' ? o.suggestedValue : Number(o.suggestedValue);
  if (!Number.isFinite(suggestedValue) || !Number.isFinite(currentValue)) return null;

  const max =
    fieldRaw === 'weight' ? 200 : fieldRaw === 'sets' ? 12 : fieldRaw === 'holdSeconds' ? 180 : 100;
  suggestedValue = clampInt(suggestedValue, 1, max);
  if (suggestedValue === currentValue) return null;

  let type: AiSuggestionType = typeRaw;
  if (typeRaw === 'add_exercise') {
    type = suggestedValue > currentValue ? 'increase_reps' : 'reduce_reps';
  }

  const rationale =
    (typeof o.clinicalRationaleHebrew === 'string' && o.clinicalRationaleHebrew.trim()) ||
    (typeof o.reasonHebrew === 'string' && o.reasonHebrew.trim()) ||
    'המלצת AI לשינוי עומס — יש לאשר עם המטפל לפני ביצוע.';

  return {
    id: `ai-engine-gemini-${patientId}-${Date.now()}`,
    patientId,
    exerciseId: ex.id,
    exerciseName: ex.name,
    type,
    field: fieldRaw,
    currentValue,
    suggestedValue,
    reason: rationale.trim(),
    createdAt: new Date().toISOString(),
    status: defaultStatus,
    source: 'clinical_recommendation_engine',
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
 * Produces a gated {@link AiSuggestion} from consolidated tracking + Gemini (or heuristic fallback).
 * Never writes to exercise plans.
 */
export async function generateClinicalRecommendation(
  params: GenerateClinicalRecommendationParams
): Promise<AiSuggestion | null> {
  const {
    patient,
    clinicalExercises,
    clinicalToday,
    dayMap,
    defaultStatus = 'pending',
    therapistReviewHistory = [],
  } = params;

  if (clinicalExercises.length === 0) return null;

  const tracking = consolidateClinicalTracking({
    patient,
    clinicalToday,
    dayMap,
    rehabExerciseCount: clinicalExercises.length,
  });

  const gate = params.longitudinalGate ?? tracking.longitudinalGate;

  if (!gate.shouldSuggest && tracking.recommendationIntent === 'none') {
    return null;
  }

  const byId = new Map(clinicalExercises.map((e) => [e.id, e]));
  const excludedCategoryKeys = new Set(therapistReviewHistory.map((r) => r.categoryKey));
  const reviewPromptSection = buildTherapistReviewHistoryPromptSection(
    therapistReviewHistory.map((r) => ({
      ...r,
      reviewedAt: '',
    }))
  );

  const heuristic = heuristicAdjustment(
    patient.id,
    clinicalExercises,
    tracking,
    defaultStatus
  );

  if (heuristic && excludedCategoryKeys.has(clinicalRecommendationCategoryKey(heuristic))) {
    return null;
  }

  if (!getGeminiApiKey()) {
    return heuristic;
  }

  const exercisePayload = clinicalExercises.slice(0, 24).map((e) => ({
    id: e.id,
    name: e.name,
    type: e.type,
    instructions: e.instructions?.slice(0, 280) ?? '',
    clinicalProgressionHint: e.clinicalProgressionHint ?? null,
    clinicalRegressionHint: e.clinicalRegressionHint ?? null,
    patientReps: e.patientReps ?? e.reps ?? 0,
    patientSets: e.patientSets ?? e.sets ?? 0,
    holdSeconds: e.holdSeconds ?? null,
    patientWeightKg: e.patientWeightKg ?? null,
    difficulty: e.difficulty,
    targetAreaLabel: bodyAreaLabels[e.targetArea],
  }));

  const reengagementExtra = gate.geminiExtraInstructionEnglish;

  const systemInstruction = `You are a rehabilitation clinical advisor embedded in PHYSIOSHIELD (home exercise app).
Audience: the recommendation is reviewed by a licensed physiotherapist — write clinicalRationaleHebrew for the therapist.

Return ONLY valid JSON (no markdown) with exactly these fields:
- exerciseId: string — MUST be one of the supplied exercise ids
- type: one of "increase_reps" | "reduce_reps" | "increase_sets" | "add_exercise"
- field: one of "reps" | "sets" | "weight" | "holdSeconds"
- suggestedValue: positive integer — the NEW target value (not a delta)
- reasonHebrew: string — short patient-friendly Hebrew (2–3 sentences)
- clinicalRationaleHebrew: string — professional Hebrew rationale for the therapist (3–5 sentences): why this modification, expected benefit, monitoring cues

Decision rules:
- Use consolidated tracking (longitudinalTrendGate, commandInsight, guardianAnalysis) — do NOT invent trends.
- For progression (high compliance + low pain + low effort): choose the BEST modification for THIS exercise:
  * dynamic reps for repetition-based exercises
  * holdSeconds for isometric / hold-based exercises (reps may be 0)
  * sets when volume should rise without changing per-set load
  * use "add_exercise" + field when a mechanical / technique modification is more appropriate than raw load (explain in clinicalRationaleHebrew)
- For regression, re-engagement, rising pain, or low compliance: prefer load reduction (reps, sets, hold time, or weight).
- Never diagnose diseases. Never suggest exercises outside the list.
- If load increase is forbidden (allowExerciseLoadIncrease === false), only regress or maintain — never increase.
- The plan MUST NOT change automatically; this is a proposal only.${
    reengagementExtra
      ? `

Mandatory extra instruction: ${reengagementExtra}`
      : ''
  }${
    reviewPromptSection
      ? `

Therapist review history (MUST respect — do not repeat dismissed adjustments):
${reviewPromptSection}`
      : ''
  }`;

  const userText = `Patient context (JSON):
${JSON.stringify(
  {
    primaryBodyArea: bodyAreaLabels[patient.primaryBodyArea],
    currentStreak: patient.currentStreak,
    recommendationIntent: tracking.recommendationIntent,
    consolidatedTracking: {
      summaryHebrew: tracking.trackingSummaryHebrew,
      triggers: gate.triggers,
      longitudinalSummary: gate.summaryHebrew,
      commandInsightCategory: tracking.progressInsight.category as ProgressInsightCategory,
      commandInsightNextStep: tracking.progressInsight.nextStepHe,
      avgPain7d: tracking.progressInsight.avgPain7d,
      compliance3d: tracking.progressInsight.compliance3d,
    },
    guardianAnalysis: {
      painTrend: tracking.progressAnalysis.painTrend,
      allowExerciseLoadIncrease: tracking.progressAnalysis.allowExerciseLoadIncrease,
      completionRateRecent: tracking.progressAnalysis.completionRateRecent,
      avgDifficultyRecent: tracking.progressAnalysis.avgDifficultyRecent,
      relationshipSummaryHebrew: tracking.progressAnalysis.relationshipSummaryHebrew,
      refusalExplanationHebrew: tracking.progressAnalysis.refusalExplanationHebrew ?? null,
    },
    clinicalExercises: exercisePayload,
  },
  null,
  2
)}

Return JSON only.`;

  try {
    const rawText = await geminiGenerateText({
      systemInstruction,
      userText,
      temperature: 0.35,
      responseMimeType: 'application/json',
      logPrefix: LOG_PREFIX,
      logDetail: { patientId: patient.id, intent: tracking.recommendationIntent },
    });
    const parsed = parseJsonObject(rawText);
    const normalized = normalizeGeminiRecommendation(
      parsed,
      patient.id,
      byId,
      defaultStatus
    );
    if (
      normalized &&
      excludedCategoryKeys.has(clinicalRecommendationCategoryKey(normalized))
    ) {
      return null;
    }
    if (normalized) return normalized;
  } catch (e) {
    console.warn(`${LOG_PREFIX} Gemini failed, using heuristic`, e);
  }

  return heuristic;
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
