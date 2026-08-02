import { useCallback, useEffect, useState } from 'react';
import type { Exercise } from '../types';
import { isSupabaseConfigured } from '../lib/supabase';
import {
  catalogRowToExercise,
  createCatalogExercise,
  fetchExerciseCatalog,
  getCachedActiveExercises,
  getCachedExerciseCatalog,
  prefetchExerciseCatalog,
  setCatalogExerciseActive,
  updateCatalogExercise,
  type ExerciseCatalogInput,
  type ExerciseCatalogPatch,
  type ExerciseCatalogRow,
} from '../services/exerciseCatalogService';

export type UseExerciseCatalogOptions = {
  /** Therapist manager needs inactive rows. Default false (active only). */
  includeInactive?: boolean;
  /** Auto-prefetch on mount. Default true. */
  autoPrefetch?: boolean;
};

export function useExerciseCatalog(options?: UseExerciseCatalogOptions) {
  const includeInactive = options?.includeInactive ?? false;
  const autoPrefetch = options?.autoPrefetch ?? true;

  const [rows, setRows] = useState<ExerciseCatalogRow[]>(() =>
    includeInactive
      ? getCachedExerciseCatalog()
      : getCachedExerciseCatalog().filter((r) => r.is_active)
  );
  const [loading, setLoading] = useState(
    () => !getCachedExerciseCatalog().length && isSupabaseConfigured
  );
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await fetchExerciseCatalog({ includeInactive });
      setRows(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שגיאה בטעינת קטלוג התרגילים');
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    if (!autoPrefetch) return;
    let cancelled = false;
    void (async () => {
      if (!isSupabaseConfigured) {
        if (!cancelled) setLoading(false);
        return;
      }
      try {
        const next = await prefetchExerciseCatalog();
        if (!cancelled) setRows(next);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'שגיאה בטעינת קטלוג התרגילים');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [autoPrefetch]);

  const visibleRows = includeInactive
    ? rows
    : rows.filter((r) => r.is_active);

  const exercises: Exercise[] = visibleRows.map(catalogRowToExercise);

  const activeExercises: Exercise[] = rows
    .filter((r) => r.is_active)
    .map(catalogRowToExercise);

  const create = useCallback(
    async (input: ExerciseCatalogInput) => {
      const created = await createCatalogExercise(input);
      setRows((prev) => {
        const without = prev.filter((r) => r.id !== created.id);
        return [...without, created].sort(
          (a, b) =>
            (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id)
        );
      });
      return created;
    },
    []
  );

  const update = useCallback(async (id: string, patch: ExerciseCatalogPatch) => {
    const updated = await updateCatalogExercise(id, patch);
    setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
    return updated;
  }, []);

  const setActive = useCallback(async (id: string, isActive: boolean) => {
    const updated = await setCatalogExerciseActive(id, isActive);
    setRows((prev) => prev.map((r) => (r.id === id ? updated : r)));
    return updated;
  }, []);

  return {
    rows,
    exercises,
    activeExercises,
    loading,
    error,
    refresh,
    create,
    update,
    setActive,
    /** Sync snapshot of active exercises (may be empty before prefetch). */
    getCachedActive: getCachedActiveExercises,
  };
}
