import type { ExercisePlan } from '../types';

/** Prefer the active plan when multiple slices share the same patientId (versioned Supabase rows). */
export function pickCanonicalExercisePlan(
  plans: ExercisePlan[],
  patientId: string
): ExercisePlan | undefined {
  const forPatient = plans.filter((ep) => ep.patientId === patientId);
  if (forPatient.length === 0) return undefined;
  if (forPatient.length === 1) return forPatient[0];

  const activeTrue = forPatient.filter((p) => p.isActive === true);
  const pool =
    activeTrue.length > 0
      ? activeTrue
      : forPatient.filter((p) => p.isActive !== false);
  const pickFrom = pool.length > 0 ? pool : forPatient;
  return pickFrom.reduce((best, ep) =>
    (ep.versionNumber ?? 0) > (best.versionNumber ?? 0) ? ep : best
  );
}

/**
 * Combine a freshly fetched plan with any local slice for the same patient so rapid saves /
 * races do not drop in-memory exercises when the server row lags or returns empty.
 */
export function mergeFetchedExercisePlanWithLocal(
  local: ExercisePlan | undefined,
  fetched: ExercisePlan | null,
  patientId: string
): ExercisePlan {
  const empty: ExercisePlan = { patientId, exercises: [] };
  const loc = local?.patientId === patientId ? local : undefined;
  const remote = fetched && fetched.patientId === patientId ? fetched : null;

  if (!remote) {
    return loc ?? empty;
  }

  const remoteEx = remote.exercises ?? [];
  const localEx = loc?.exercises ?? [];
  const exercises =
    remoteEx.length > 0 ? remoteEx : localEx.length > 0 ? localEx : [];

  return {
    patientId,
    exercises,
    planRowId: remote.planRowId ?? loc?.planRowId,
    versionNumber: remote.versionNumber ?? loc?.versionNumber,
    isActive: remote.isActive ?? loc?.isActive,
  };
}
