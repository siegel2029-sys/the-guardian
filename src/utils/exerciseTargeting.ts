import type { BodyArea, Exercise } from '../types';
import { bodyAreaLabels } from '../types';

/** All body areas associated with an exercise (multi-select custom or legacy single). */
export function getExerciseTargetAreas(ex: Pick<Exercise, 'targetArea' | 'targetAreas'>): BodyArea[] {
  if (Array.isArray(ex.targetAreas) && ex.targetAreas.length > 0) return ex.targetAreas;
  return ex.targetArea ? [ex.targetArea] : [];
}

/** All muscle group labels for an exercise. */
export function getExerciseMuscleGroups(ex: Pick<Exercise, 'muscleGroup' | 'muscleGroups'>): string[] {
  if (Array.isArray(ex.muscleGroups) && ex.muscleGroups.length > 0) return ex.muscleGroups;
  const raw = ex.muscleGroup?.trim();
  if (!raw) return [];
  return raw.split(/\s*[·,،]\s*/).map((s) => s.trim()).filter(Boolean);
}

export function exerciseMatchesTargetArea(
  ex: Pick<Exercise, 'targetArea' | 'targetAreas'>,
  area: BodyArea
): boolean {
  return getExerciseTargetAreas(ex).includes(area);
}

export function formatExerciseMuscleGroups(ex: Pick<Exercise, 'muscleGroup' | 'muscleGroups'>): string {
  const groups = getExerciseMuscleGroups(ex);
  return groups.length > 0 ? groups.join(' · ') : (ex.muscleGroup ?? '');
}

export function formatExerciseBodyAreaLabels(ex: Pick<Exercise, 'targetArea' | 'targetAreas'>): string {
  return getExerciseTargetAreas(ex)
    .map((a) => bodyAreaLabels[a])
    .join(' · ');
}
