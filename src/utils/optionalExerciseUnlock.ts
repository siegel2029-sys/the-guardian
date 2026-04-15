import type { BodyArea, PatientExercise } from '../types';
import type { StrengthExerciseLevelDef } from '../data/strengthExerciseDatabase';

export type OptionalPoolItem =
  | { kind: 'rehab'; exercise: PatientExercise; area: BodyArea; poolKey: string }
  | {
      kind: 'strength';
      area: BodyArea;
      exercise: StrengthExerciseLevelDef;
      strengthTier: 0 | 1 | 2;
      poolKey: string;
    };

export function getOptionalPoolExerciseId(item: OptionalPoolItem): string {
  return item.exercise.id;
}

export function buildOptionalPool(
  optionalRehabExercises: PatientExercise[],
  strengthRows: { area: BodyArea; exercise: StrengthExerciseLevelDef; strengthTier: 0 | 1 | 2 }[]
): OptionalPoolItem[] {
  const rehab: OptionalPoolItem[] = [...optionalRehabExercises]
    .sort((a, b) => {
      const ac = a.targetArea.localeCompare(b.targetArea, 'he');
      if (ac !== 0) return ac;
      return a.name.localeCompare(b.name, 'he');
    })
    .map((exercise) => ({
      kind: 'rehab' as const,
      exercise,
      area: exercise.targetArea,
      poolKey: `rehab:${exercise.id}`,
    }));

  const strength: OptionalPoolItem[] = [...strengthRows]
    .sort((a, b) => {
      const ac = a.area.localeCompare(b.area);
      if (ac !== 0) return ac;
      return a.exercise.id.localeCompare(b.exercise.id);
    })
    .map((row) => ({
      kind: 'strength' as const,
      area: row.area,
      exercise: row.exercise,
      strengthTier: row.strengthTier,
      poolKey: `strength:${row.area}:${row.exercise.id}`,
    }));

  return [...rehab, ...strength];
}

/** Max optional completions per body area per clinical day (sequential unlock). */
export const OPTIONAL_COMPLETIONS_PER_AREA_DAILY_CAP = 4;

/**
 * ספירת סיומי תרגילי בחירה לפי אזור — לסינון הפריט הבא בבריכה.
 */
export function computeOptionalCompletionsByAreaFromSession(
  completedIds: readonly string[],
  optionalRehabExercises: PatientExercise[],
  strengthRows: { area: BodyArea; exercise: { id: string } }[]
): Partial<Record<BodyArea, number>> {
  const done = new Set(completedIds);
  const out: Partial<Record<BodyArea, number>> = {};
  for (const ex of optionalRehabExercises) {
    if (done.has(ex.id)) {
      out[ex.targetArea] = (out[ex.targetArea] ?? 0) + 1;
    }
  }
  for (const row of strengthRows) {
    if (done.has(row.exercise.id)) {
      out[row.area] = (out[row.area] ?? 0) + 1;
    }
  }
  return out;
}

/**
 * How many completed IDs today belong to the optional pool (globally — for reward tier).
 */
export function countOptionalPoolCompletionsInSession(
  completedIds: readonly string[],
  fullPool: OptionalPoolItem[]
): number {
  if (fullPool.length === 0) return 0;
  const poolIds = new Set(fullPool.map(getOptionalPoolExerciseId));
  let n = 0;
  for (const id of completedIds) {
    if (poolIds.has(id)) n += 1;
  }
  return n;
}

/**
 * Next single card: pool order, skip completed, each area max 4 optional completions/day.
 */
export function getNextOptionalPoolItem(
  fullPool: OptionalPoolItem[],
  completionsByArea: Partial<Record<BodyArea, number>>,
  completedIds: readonly string[]
): OptionalPoolItem | null {
  const done = new Set(completedIds);
  const eligible = fullPool.filter(
    (item) =>
      (completionsByArea[item.area] ?? 0) < OPTIONAL_COMPLETIONS_PER_AREA_DAILY_CAP
  );
  for (const item of eligible) {
    const id = getOptionalPoolExerciseId(item);
    if (!done.has(id)) {
      return item;
    }
  }
  return null;
}

export function getVisibleOptionalPoolItems(
  fullPool: OptionalPoolItem[],
  completionsByArea: Partial<Record<BodyArea, number>>,
  completedIds: readonly string[]
): OptionalPoolItem[] {
  const next = getNextOptionalPoolItem(fullPool, completionsByArea, completedIds);
  return next ? [next] : [];
}
