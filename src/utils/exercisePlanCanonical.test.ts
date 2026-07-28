import { describe, expect, it } from 'vitest';
import {
  resolveExerciseVideoUrl,
  isOutdatedExerciseVideoUrl,
} from './exercisePlanCanonical';
import { DEFAULT_EXERCISE_DEMO_VIDEO_URL } from '../data/exerciseVideoDefaults';
import { EXERCISE_LIBRARY } from '../data/mockData';

describe('resolveExerciseVideoUrl', () => {
  it('keeps intentional empty string (therapist clear) without injecting DEFAULT', () => {
    expect(
      resolveExerciseVideoUrl({ id: 'patient-1-lib-lb-01-123', videoUrl: '' })
    ).toBe('');
  });

  it('upgrades non-empty legacy demo URLs from EXERCISE_LIBRARY when matched', () => {
    const lib = EXERCISE_LIBRARY.find((e) => e.id === 'lib-lb-01');
    expect(lib).toBeTruthy();
    const resolved = resolveExerciseVideoUrl({
      id: 'patient-1-lib-lb-01-123',
      videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL,
    });
    expect(resolved).toBe(lib!.videoUrl);
  });

  it('fills from library when videoUrl is missing/undefined', () => {
    const lib = EXERCISE_LIBRARY.find((e) => e.id === 'lib-lb-01');
    expect(
      resolveExerciseVideoUrl({
        id: 'patient-1-lib-lb-01-999',
        videoUrl: undefined as unknown as string,
      })
    ).toBe(lib!.videoUrl);
  });

  it('preserves a custom hosted URL override', () => {
    const custom =
      'https://xyz.supabase.co/storage/v1/object/public/exercise-videos/custom.mp4';
    expect(
      resolveExerciseVideoUrl({ id: 'patient-1-lib-lb-01-123', videoUrl: custom })
    ).toBe(custom);
  });
});

describe('isOutdatedExerciseVideoUrl', () => {
  it('flags empty and legacy demo hosts', () => {
    expect(isOutdatedExerciseVideoUrl('')).toBe(true);
    expect(isOutdatedExerciseVideoUrl(DEFAULT_EXERCISE_DEMO_VIDEO_URL)).toBe(true);
  });
});
