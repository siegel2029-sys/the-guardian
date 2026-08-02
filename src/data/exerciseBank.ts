/**
 * ספריית תרגילים למערכת — מקור: exercise_catalog (Supabase) דרך in-memory cache.
 * שם הקובץ תואם לציפיית ה-prompt הקליני (exerciseBank).
 *
 * AI / sync callers MUST use these getters (prefetched on therapist shell mount).
 * Do not await DB inside prompt assembly.
 */
import {
  getCachedActiveExercises,
  getCachedCatalogIdList,
  getCachedExerciseById,
  isExerciseCatalogCacheReady,
  prefetchExerciseCatalog,
} from '../services/exerciseCatalogService';
import type { Exercise } from '../types';

/** Active catalog exercises from memory (may be empty before prefetch). */
export function getExerciseBank(): Exercise[] {
  return getCachedActiveExercises();
}

/** @deprecated Prefer getExerciseBank() — kept for gradual call-site migration. */
export const exerciseBank: Exercise[] = [];

export function getExerciseBankIdListForPrompt(): {
  id: string;
  name: string;
  targetArea: string;
}[] {
  return getCachedCatalogIdList();
}

export function findExerciseInBank(id: string): Exercise | undefined {
  return getCachedExerciseById(id);
}

export function ensureExerciseBankPrefetched(): Promise<void> {
  if (isExerciseCatalogCacheReady()) return Promise.resolve();
  return prefetchExerciseCatalog({ includeInactive: true }).then(() => undefined);
}
