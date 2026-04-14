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
