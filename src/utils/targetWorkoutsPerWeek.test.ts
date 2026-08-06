import { describe, expect, it } from 'vitest';
import {
  clampTargetWorkoutsPerWeek,
  DEFAULT_TARGET_WORKOUTS_PER_WEEK,
  exercisePlanMetaSchema,
  parseTargetWorkoutsPerWeek,
} from './targetWorkoutsPerWeek';

describe('targetWorkoutsPerWeek', () => {
  it('defaults invalid values to 7', () => {
    expect(clampTargetWorkoutsPerWeek(undefined)).toBe(DEFAULT_TARGET_WORKOUTS_PER_WEEK);
    expect(clampTargetWorkoutsPerWeek(null)).toBe(DEFAULT_TARGET_WORKOUTS_PER_WEEK);
    expect(clampTargetWorkoutsPerWeek('x')).toBe(DEFAULT_TARGET_WORKOUTS_PER_WEEK);
  });

  it('clamps to 1–7', () => {
    expect(clampTargetWorkoutsPerWeek(0)).toBe(1);
    expect(clampTargetWorkoutsPerWeek(8)).toBe(7);
    expect(clampTargetWorkoutsPerWeek(3.6)).toBe(4);
  });

  it('parses via Zod schema', () => {
    expect(parseTargetWorkoutsPerWeek(2)).toBe(2);
    expect(exercisePlanMetaSchema.parse({ targetWorkoutsPerWeek: 5 })).toEqual({
      targetWorkoutsPerWeek: 5,
    });
  });
});
