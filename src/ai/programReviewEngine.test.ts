import { describe, expect, it } from 'vitest';
import {
  evaluateProgramReview,
  isDueForProgramReview,
  pickProgressionSwap,
  pickRegressionSwap,
  HIGH_PAIN_THRESHOLD,
  NEW_PATIENT_GRACE_DAYS,
  PROGRAM_REVIEW_WINDOW_DAYS,
  REJECTION_COOLDOWN_DAYS,
} from './programReviewEngine';

const baseExercises = [
  {
    id: 'ex-a',
    name: 'גשר ישבן',
    sets: 3,
    reps: 10,
    difficulty: 2,
    targetArea: 'back_lower',
    muscleGroup: 'גלוטאוס',
  },
  {
    id: 'ex-b',
    name: 'מתיחת מכופפי ירך',
    sets: 2,
    reps: 8,
    difficulty: 1,
    targetArea: 'back_lower',
    muscleGroup: 'מכופפי ירך',
  },
];

const catalog = [
  {
    id: 'ex-easy',
    name: 'גשר חלקי',
    sets: 2,
    reps: 8,
    holdSeconds: null,
    difficulty: 1,
    targetArea: 'back_lower',
    muscleGroup: 'גלוטאוס',
    clinicalRegressionHint: 'רגרסיה עדינה',
  },
  {
    id: 'ex-hard',
    name: 'גשר חד־רגלי',
    sets: 3,
    reps: 8,
    holdSeconds: null,
    difficulty: 3,
    targetArea: 'back_lower',
    muscleGroup: 'גלוטאוס',
  },
];

describe('evaluateProgramReview', () => {
  it('swaps from catalog when pain > 8 and safer exercise exists', () => {
    const result = evaluateProgramReview({
      exercises: baseExercises,
      painSamples: [
        { exerciseId: 'ex-a', painLevel: HIGH_PAIN_THRESHOLD + 1, sessionDate: '2026-08-03' },
        { exerciseId: 'ex-a', painLevel: 5, sessionDate: '2026-08-04' },
        { exerciseId: 'ex-b', painLevel: 3, sessionDate: '2026-08-05' },
      ],
      daysWithWork: 3,
      adherenceRate: 0.9,
      catalog,
    });
    expect(result.decision).toBe('reduce');
    const change = result.proposedChanges.find((c) => c.exerciseId === 'ex-a');
    expect(change?.action).toBe('swap');
    expect(change?.swapToExerciseId).toBe('ex-easy');
    expect(result.metrics.catalogDrivenSwaps).toBeGreaterThan(0);
  });

  it('progresses via catalog swap when advanced exercise exists', () => {
    const result = evaluateProgramReview({
      exercises: baseExercises,
      painSamples: [
        { exerciseId: 'ex-a', painLevel: 2, sessionDate: '2026-08-03' },
        { exerciseId: 'ex-b', painLevel: 1, sessionDate: '2026-08-04' },
        { exerciseId: 'ex-a', painLevel: 2, sessionDate: '2026-08-05' },
      ],
      daysWithWork: PROGRAM_REVIEW_WINDOW_DAYS,
      adherenceRate: 0.85,
      catalog,
    });
    expect(result.decision).toBe('progress');
    expect(result.proposedChanges.some((c) => c.action === 'progress_swap')).toBe(true);
  });

  it('maintains when mixed / moderate signals', () => {
    const result = evaluateProgramReview({
      exercises: baseExercises,
      painSamples: [
        { exerciseId: 'ex-a', painLevel: 5, sessionDate: '2026-08-03' },
        { exerciseId: 'ex-b', painLevel: 4, sessionDate: '2026-08-04' },
      ],
      daysWithWork: 2,
      adherenceRate: 0.5,
      catalog,
    });
    expect(result.decision).toBe('maintain');
    expect(result.proposedChanges.every((c) => c.action === 'keep')).toBe(true);
  });
});

describe('catalog pickers', () => {
  it('picks lower difficulty same area/muscle for regression', () => {
    const swap = pickRegressionSwap(baseExercises[0], catalog, new Set(['ex-a']));
    expect(swap?.id).toBe('ex-easy');
  });

  it('picks higher difficulty same area/muscle for progression', () => {
    const swap = pickProgressionSwap(baseExercises[0], catalog, new Set(['ex-a']));
    expect(swap?.id).toBe('ex-hard');
  });
});

describe('isDueForProgramReview', () => {
  it('excludes new patients during the first 7 days', () => {
    expect(
      isDueForProgramReview({
        clinicalToday: '2026-08-05',
        programStartYmd: '2026-08-01',
        lastReviewWindowEnd: null,
        lastDeclinedYmd: null,
        hasPendingProposal: false,
        daysWithLogsInWindow: 3,
      })
    ).toBe(false);
    expect(
      isDueForProgramReview({
        clinicalToday: '2026-08-10',
        programStartYmd: '2026-08-01',
        lastReviewWindowEnd: null,
        lastDeclinedYmd: null,
        hasPendingProposal: false,
        daysWithLogsInWindow: 3,
      })
    ).toBe(true);
    expect(NEW_PATIENT_GRACE_DAYS).toBe(7);
  });

  it('enforces rejection cooldown of at least 3 days', () => {
    expect(
      isDueForProgramReview({
        clinicalToday: '2026-08-07',
        programStartYmd: '2026-07-01',
        lastReviewWindowEnd: '2026-08-05',
        lastDeclinedYmd: '2026-08-06',
        hasPendingProposal: false,
        daysWithLogsInWindow: 3,
      })
    ).toBe(false);
    expect(
      isDueForProgramReview({
        clinicalToday: '2026-08-09',
        programStartYmd: '2026-07-01',
        lastReviewWindowEnd: '2026-08-05',
        lastDeclinedYmd: '2026-08-06',
        hasPendingProposal: false,
        daysWithLogsInWindow: 3,
      })
    ).toBe(true);
    expect(REJECTION_COOLDOWN_DAYS).toBe(3);
  });

  it('skips while a pending proposal exists (pile-up prevention)', () => {
    expect(
      isDueForProgramReview({
        clinicalToday: '2026-08-20',
        programStartYmd: '2026-07-01',
        lastReviewWindowEnd: '2026-08-01',
        lastDeclinedYmd: null,
        hasPendingProposal: true,
        daysWithLogsInWindow: 3,
      })
    ).toBe(false);
  });

  it('continues the loop every 3 days after a resolved review (no pending)', () => {
    expect(
      isDueForProgramReview({
        clinicalToday: '2026-08-08',
        programStartYmd: '2026-07-01',
        lastReviewWindowEnd: '2026-08-05',
        lastDeclinedYmd: null,
        hasPendingProposal: false,
        daysWithLogsInWindow: 3,
      })
    ).toBe(true);
    expect(
      isDueForProgramReview({
        clinicalToday: '2026-08-07',
        programStartYmd: '2026-07-01',
        lastReviewWindowEnd: '2026-08-05',
        lastDeclinedYmd: null,
        hasPendingProposal: false,
        daysWithLogsInWindow: 3,
      })
    ).toBe(false);
    expect(PROGRAM_REVIEW_WINDOW_DAYS).toBe(3);
  });

  it('requires enough logs for first review after grace', () => {
    expect(
      isDueForProgramReview({
        clinicalToday: '2026-08-15',
        programStartYmd: '2026-08-01',
        lastReviewWindowEnd: null,
        lastDeclinedYmd: null,
        hasPendingProposal: false,
        daysWithLogsInWindow: 2,
      })
    ).toBe(false);
    expect(
      isDueForProgramReview({
        clinicalToday: '2026-08-15',
        programStartYmd: '2026-08-01',
        lastReviewWindowEnd: null,
        lastDeclinedYmd: null,
        hasPendingProposal: false,
        daysWithLogsInWindow: 3,
      })
    ).toBe(true);
  });
});
