import { describe, expect, it } from 'vitest';
import {
  resolveExerciseVideoUrl,
  isOutdatedExerciseVideoUrl,
} from './exercisePlanCanonical';
import { DEFAULT_EXERCISE_DEMO_VIDEO_URL } from '../data/exerciseVideoDefaults';

const HOSTED =
  'https://sbbmyxztjmeerfmuhrka.supabase.co/storage/v1/object/public/exercise-videos/pendulum.mp4';

describe('resolveExerciseVideoUrl', () => {
  it('keeps intentional empty string (therapist clear) without injecting DEFAULT', () => {
    const catalog = new Map([['lib-lb-01', { videoUrl: HOSTED }]]);
    expect(
      resolveExerciseVideoUrl(
        { id: 'patient-1-lib-lb-01-123', videoUrl: '' },
        catalog
      )
    ).toBe('');
  });

  it('upgrades non-empty legacy demo URLs from injected catalog when matched', () => {
    const catalog = new Map([['lib-lb-01', { videoUrl: HOSTED }]]);
    const resolved = resolveExerciseVideoUrl(
      {
        id: 'patient-1-lib-lb-01-123',
        videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL,
      },
      catalog
    );
    expect(resolved).toBe(HOSTED);
  });

  it('fills from catalog when videoUrl is missing/undefined', () => {
    const catalog = new Map([['lib-lb-01', { videoUrl: HOSTED }]]);
    expect(
      resolveExerciseVideoUrl(
        {
          id: 'patient-1-lib-lb-01-999',
          videoUrl: undefined as unknown as string,
        },
        catalog
      )
    ).toBe(HOSTED);
  });

  it('preserves a custom hosted URL override', () => {
    const catalog = new Map([['lib-lb-01', { videoUrl: HOSTED }]]);
    const custom =
      'https://xyz.supabase.co/storage/v1/object/public/exercise-videos/custom.mp4';
    expect(
      resolveExerciseVideoUrl(
        { id: 'patient-1-lib-lb-01-123', videoUrl: custom },
        catalog
      )
    ).toBe(custom);
  });
});

describe('isOutdatedExerciseVideoUrl', () => {
  it('flags empty and legacy demo hosts', () => {
    expect(isOutdatedExerciseVideoUrl('')).toBe(true);
    expect(isOutdatedExerciseVideoUrl(DEFAULT_EXERCISE_DEMO_VIDEO_URL)).toBe(true);
  });
});
