import { z } from 'zod';

/** Default when unset / legacy plans — daily expectation. */
export const DEFAULT_TARGET_WORKOUTS_PER_WEEK = 7;

export const TARGET_WORKOUTS_PER_WEEK_MIN = 1;
export const TARGET_WORKOUTS_PER_WEEK_MAX = 7;

export const targetWorkoutsPerWeekSchema = z
  .number()
  .int()
  .min(TARGET_WORKOUTS_PER_WEEK_MIN)
  .max(TARGET_WORKOUTS_PER_WEEK_MAX)
  .default(DEFAULT_TARGET_WORKOUTS_PER_WEEK);

/** Plan-level meta validated on create/edit (extend as more plan columns land). */
export const exercisePlanMetaSchema = z.object({
  targetWorkoutsPerWeek: targetWorkoutsPerWeekSchema,
});

export type ExercisePlanMeta = z.infer<typeof exercisePlanMetaSchema>;

/** Clamp unknown input to a valid 1–7 weekly target (default 7). */
export function clampTargetWorkoutsPerWeek(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.min(
      TARGET_WORKOUTS_PER_WEEK_MAX,
      Math.max(TARGET_WORKOUTS_PER_WEEK_MIN, Math.round(value))
    );
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    if (Number.isFinite(n)) {
      return Math.min(
        TARGET_WORKOUTS_PER_WEEK_MAX,
        Math.max(TARGET_WORKOUTS_PER_WEEK_MIN, Math.round(n))
      );
    }
  }
  return DEFAULT_TARGET_WORKOUTS_PER_WEEK;
}

export function parseTargetWorkoutsPerWeek(value: unknown): number {
  const parsed = targetWorkoutsPerWeekSchema.safeParse(
    typeof value === 'number' ? value : Number(value)
  );
  return parsed.success ? parsed.data : DEFAULT_TARGET_WORKOUTS_PER_WEEK;
}
