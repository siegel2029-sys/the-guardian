import { describe, expect, it } from 'vitest';
import {
  mergeAcceptedProgramReviewChanges,
  programReviewChangeKey,
} from './applyProgramReviewChanges';

describe('programReviewChangeKey', () => {
  it('builds stable keys including optional swap target', () => {
    expect(
      programReviewChangeKey({
        exerciseId: 'ex-1',
        action: 'progress_reps',
      })
    ).toBe('ex-1:progress_reps:');
    expect(
      programReviewChangeKey({
        exerciseId: 'ex-1',
        action: 'swap',
        swapToExerciseId: 'ex-2',
      })
    ).toBe('ex-1:swap:ex-2');
  });
});

describe('mergeAcceptedProgramReviewChanges', () => {
  const current = [
    { id: 'ex-a', name: 'A', sets: 3, reps: 10, patientSets: 3, patientReps: 10 },
    { id: 'ex-b', name: 'B', sets: 2, reps: 8, patientSets: 2, patientReps: 8 },
  ];

  const changes = [
    {
      exerciseId: 'ex-a',
      exerciseName: 'A',
      action: 'progress_reps',
      fromSets: 3,
      toSets: 3,
      fromReps: 10,
      toReps: 12,
      noteHebrew: 'up',
    },
    {
      exerciseId: 'ex-b',
      exerciseName: 'B',
      action: 'swap',
      fromSets: 2,
      toSets: 2,
      fromReps: 8,
      toReps: 10,
      swapToExerciseId: 'ex-c',
      swapToExerciseName: 'C',
      noteHebrew: 'swap',
    },
  ];

  it('applies only accepted keys and leaves declined exercises unchanged', () => {
    const keyA = programReviewChangeKey(changes[0]);
    const result = mergeAcceptedProgramReviewChanges({
      currentExercises: current,
      proposedChanges: changes,
      acceptedChangeKeys: [keyA],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.exercises[0]).toMatchObject({ id: 'ex-a', reps: 12, patientReps: 12 });
    expect(result.exercises[1]).toMatchObject({ id: 'ex-b', reps: 8 });
  });

  it('rejects unknown keys', () => {
    const result = mergeAcceptedProgramReviewChanges({
      currentExercises: current,
      proposedChanges: changes,
      acceptedChangeKeys: ['nope'],
    });
    expect(result).toEqual({ ok: false, reason: 'unknown_change_key' });
  });
});
