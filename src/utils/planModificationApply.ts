/**
 * Apply v2 plan-modification suggestions — therapist approve/reject flow.
 */

import { DEFAULT_EXERCISE_DEMO_VIDEO_URL } from '../data/exerciseVideoDefaults';
import type { StrengthExerciseLevelDef } from '../data/strengthExerciseDatabase';
import type { Exercise, PatientExercise } from '../types';
import { bodyAreaLabels } from '../types';
import type {
  LoadAdjustment,
  PlanModificationSuggestion,
  SuggestedExerciseChange,
} from '../ai/clinicalInsightsNarrative';
import { findCatalogExerciseById } from './clinicalExerciseCatalog';

function strengthLevelToExercise(
  level: StrengthExerciseLevelDef,
  bodyArea: Exercise['targetArea']
): Exercise {
  return {
    id: level.id,
    name: level.name,
    muscleGroup: bodyAreaLabels[bodyArea],
    targetArea: bodyArea,
    sets: level.sets,
    reps: level.repsAreSeconds ? undefined : level.reps,
    holdSeconds: level.repsAreSeconds ? level.reps : undefined,
    difficulty: level.level,
    type: 'standard',
    instructions: level.instructions,
    xpReward: level.xpReward,
    videoUrl: level.videoUrl || DEFAULT_EXERCISE_DEMO_VIDEO_URL,
    clinicalRegressionHint: level.regressionHint,
    clinicalProgressionHint: level.progressionHint,
  };
}

function catalogToExercise(
  found: NonNullable<ReturnType<typeof findCatalogExerciseById>>
): Exercise {
  if (found.source === 'library') return found.exercise as Exercise;
  return strengthLevelToExercise(found.exercise as StrengthExerciseLevelDef, found.bodyArea);
}

function parseNumericParam(value: string | number | undefined): number | undefined {
  if (value == null) return undefined;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  const n = parseInt(String(value).replace(/[^\d]/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

export type ApplyPlanModificationHandlers = {
  updateExerciseInPlan: (
    patientId: string,
    exerciseId: string,
    updates: Partial<
      Pick<PatientExercise, 'patientReps' | 'patientSets' | 'patientWeightKg' | 'holdSeconds'>
    >
  ) => void;
  addExerciseToPlan: (patientId: string, exercise: Exercise) => void;
  removeExerciseFromPlan: (patientId: string, exerciseId: string) => void;
  replaceExercisePlanForPatient: (patientId: string, exercises: PatientExercise[]) => void;
  getPlanExercises: (patientId: string) => PatientExercise[];
};

export type ApplyPlanModificationResult =
  | { ok: true }
  | { ok: false; error: string };

export function applySuggestedExerciseChange(
  patientId: string,
  change: SuggestedExerciseChange,
  handlers: ApplyPlanModificationHandlers
): ApplyPlanModificationResult {
  const plan = handlers.getPlanExercises(patientId);

  if (change.action === 'REMOVE') {
    const id = change.currentExerciseId?.trim();
    if (!id) return { ok: false, error: 'חסר מזהה תרגיל להסרה' };
    if (!plan.some((e) => e.id === id)) return { ok: false, error: 'תרגיל לא נמצא' };
    handlers.removeExerciseFromPlan(patientId, id);
    return { ok: true };
  }

  if (change.action === 'ADD') {
    const catalogId = change.newExerciseChainId?.trim();
    if (!catalogId) return { ok: false, error: 'חסר תרגיל מוצע' };
    const found = findCatalogExerciseById(catalogId);
    if (!found) return { ok: false, error: 'תרגיל לא נמצא בקטלוג' };
    handlers.addExerciseToPlan(patientId, catalogToExercise(found));
    return { ok: true };
  }

  if (change.action === 'REPLACE') {
    const currentId = change.currentExerciseId?.trim();
    const catalogId = change.newExerciseChainId?.trim();
    if (!currentId || !catalogId) return { ok: false, error: 'חסרים מזהי תרגיל' };
    const current = plan.find((e) => e.id === currentId);
    if (!current) return { ok: false, error: 'תרגיל נוכחי לא נמצא' };
    const found = findCatalogExerciseById(catalogId);
    if (!found) return { ok: false, error: 'תרגיל חלופי לא נמצא' };
    const base = catalogToExercise(found);
    const newEntry: PatientExercise = {
      ...base,
      id: `${patientId}-${base.id}-${Date.now()}`,
      patientSets: base.sets,
      patientReps: base.reps ?? 0,
      addedAt: new Date().toISOString(),
      isOptional: current.isOptional,
      customInstructions: current.customInstructions,
    };
    handlers.replaceExercisePlanForPatient(
      patientId,
      plan.map((e) => (e.id === currentId ? newEntry : e))
    );
    return { ok: true };
  }

  return { ok: false, error: 'פעולה לא נתמכת' };
}

export function applyLoadAdjustment(
  patientId: string,
  adj: LoadAdjustment,
  handlers: ApplyPlanModificationHandlers
): ApplyPlanModificationResult {
  const plan = handlers.getPlanExercises(patientId);
  const ex = plan.find((e) => e.id === adj.exerciseId);
  if (!ex) return { ok: false, error: 'תרגיל לא נמצא' };

  const updates: Partial<Pick<PatientExercise, 'patientReps' | 'patientSets'>> = {};
  if (adj.suggestedReps != null) updates.patientReps = adj.suggestedReps;
  if (adj.suggestedSets != null) updates.patientSets = adj.suggestedSets;
  if (Object.keys(updates).length === 0) return { ok: false, error: 'לא צוינו ערכים' };

  handlers.updateExerciseInPlan(patientId, adj.exerciseId, updates);
  return { ok: true };
}

/** Legacy v1 bridge */
export function applyPlanModificationSuggestion(
  patientId: string,
  suggestion: PlanModificationSuggestion,
  handlers: ApplyPlanModificationHandlers
): ApplyPlanModificationResult {
  if (suggestion.actionType === 'MODIFY_PARAMS') {
    const id = suggestion.currentExerciseId?.trim();
    if (!id) return { ok: false, error: 'חסר מזהה' };
    return applyLoadAdjustment(
      patientId,
      {
        exerciseId: id,
        suggestedReps: parseNumericParam(suggestion.suggestedReps),
        suggestedSets: parseNumericParam(suggestion.suggestedSets),
        label: suggestion.clinicalReason ?? 'עדכון עומס',
      },
      handlers
    );
  }
  if (suggestion.actionType === 'ADD') {
    return applySuggestedExerciseChange(
      patientId,
      {
        action: 'ADD',
        newExerciseChainId: suggestion.newExerciseChainId,
        label: suggestion.clinicalReason ?? 'הוספה',
      },
      handlers
    );
  }
  if (suggestion.actionType === 'REPLACE') {
    return applySuggestedExerciseChange(
      patientId,
      {
        action: 'REPLACE',
        currentExerciseId: suggestion.currentExerciseId,
        newExerciseChainId: suggestion.newExerciseChainId,
        label: suggestion.clinicalReason ?? 'החלפה',
      },
      handlers
    );
  }
  return { ok: false, error: 'לא נתמך' };
}

export function formatPlanModificationLabel(
  suggestion: PlanModificationSuggestion,
  planExercises: PatientExercise[]
): string {
  if (suggestion.clinicalReason) return suggestion.clinicalReason;
  const current = suggestion.currentExerciseId
    ? planExercises.find((e) => e.id === suggestion.currentExerciseId)
    : undefined;
  return current?.name ?? 'שינוי תוכנית';
}

export function planModificationKey(suggestion: PlanModificationSuggestion, index: number): string {
  return [
    suggestion.actionType,
    suggestion.currentExerciseId ?? '',
    suggestion.newExerciseChainId ?? '',
    index,
  ].join('|');
}
