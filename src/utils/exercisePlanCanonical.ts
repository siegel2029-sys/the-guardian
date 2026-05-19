import type { ExercisePlan, Patient, PatientExercise } from '../types';
import { DEFAULT_EXERCISE_DEMO_VIDEO_URL } from '../data/exerciseVideoDefaults';

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
 * Normalize exercises from `patients.payload._exercisePlanCache` (portal / manual plan)
 * so therapist UI always has `patientSets`, `patientReps`, and required display fields.
 */
export function normalizeCachedPatientExercise(raw: PatientExercise): PatientExercise {
  const patientSets =
    typeof raw.patientSets === 'number' && raw.patientSets > 0
      ? raw.patientSets
      : typeof raw.sets === 'number' && raw.sets > 0
        ? raw.sets
        : 3;
  const patientReps =
    typeof raw.patientReps === 'number'
      ? raw.patientReps
      : typeof raw.reps === 'number'
        ? raw.reps
        : raw.holdSeconds
          ? 0
          : 10;

  return {
    ...raw,
    sets: typeof raw.sets === 'number' ? raw.sets : patientSets,
    reps: raw.reps ?? (patientReps > 0 ? patientReps : undefined),
    patientSets,
    patientReps,
    addedAt: raw.addedAt ?? new Date().toISOString(),
    instructions: raw.instructions ?? '',
    muscleGroup: raw.muscleGroup ?? '',
    difficulty: raw.difficulty ?? 3,
    type: raw.type ?? 'standard',
    xpReward: typeof raw.xpReward === 'number' ? raw.xpReward : 20,
    videoUrl: raw.videoUrl?.trim() ? raw.videoUrl : DEFAULT_EXERCISE_DEMO_VIDEO_URL,
  };
}

export function normalizeCachedPatientExercises(
  exercises: PatientExercise[] | undefined
): PatientExercise[] {
  if (!Array.isArray(exercises) || exercises.length === 0) return [];
  return exercises.map((ex) => normalizeCachedPatientExercise(ex));
}

/** Build an in-memory plan slice from payload cache (no `exercise_plans` row required). */
export function exercisePlanFromPatientCache(
  patientId: string,
  cache: PatientExercise[] | undefined,
  meta?: Pick<ExercisePlan, 'planRowId' | 'versionNumber' | 'isActive'>
): ExercisePlan | null {
  const normalized = normalizeCachedPatientExercises(cache);
  if (normalized.length === 0) return null;
  return {
    patientId,
    exercises: normalized,
    planRowId: meta?.planRowId,
    versionNumber: meta?.versionNumber,
    isActive: meta?.isActive,
  };
}

/**
 * When `exercise_plans` is empty but `patients.payload._exercisePlanCache` has exercises,
 * hydrate therapist `exercisePlans` from the cache (same source as the patient portal).
 */
export function mergeExercisePlansWithPatientPayloadCache(
  patients: Patient[],
  plans: ExercisePlan[]
): ExercisePlan[] {
  const planByPatient = new Map(plans.map((p) => [p.patientId, p]));
  const out: ExercisePlan[] = [];

  for (const patient of patients) {
    const existing = planByPatient.get(patient.id);
    const remoteEx = existing?.exercises ?? [];
    const cacheEx = normalizeCachedPatientExercises(patient._exercisePlanCache);

    if (remoteEx.length > 0) {
      out.push({
        ...existing!,
        exercises: remoteEx.map((ex) => normalizeCachedPatientExercise(ex)),
      });
      planByPatient.delete(patient.id);
      continue;
    }

    if (cacheEx.length > 0) {
      out.push(
        exercisePlanFromPatientCache(patient.id, cacheEx, {
          planRowId: existing?.planRowId,
          versionNumber: existing?.versionNumber,
          isActive: existing?.isActive,
        })!
      );
      planByPatient.delete(patient.id);
    }
  }

  for (const leftover of planByPatient.values()) {
    out.push(leftover);
  }

  return out;
}

/**
 * Combine a freshly fetched plan with any local slice for the same patient so rapid saves /
 * races do not drop in-memory exercises when the server row lags or returns empty.
 */
export function mergeFetchedExercisePlanWithLocal(
  local: ExercisePlan | undefined,
  fetched: ExercisePlan | null,
  patientId: string,
  patientCache?: PatientExercise[]
): ExercisePlan {
  const empty: ExercisePlan = { patientId, exercises: [] };
  const loc = local?.patientId === patientId ? local : undefined;
  const remote = fetched && fetched.patientId === patientId ? fetched : null;

  const remoteEx = remote?.exercises?.length
    ? remote.exercises.map((ex) => normalizeCachedPatientExercise(ex))
    : [];
  const localEx = loc?.exercises?.length
    ? loc.exercises.map((ex) => normalizeCachedPatientExercise(ex))
    : [];
  const cacheEx = normalizeCachedPatientExercises(patientCache);

  const exercises =
    remoteEx.length > 0
      ? remoteEx
      : localEx.length > 0
        ? localEx
        : cacheEx.length > 0
          ? cacheEx
          : [];

  return {
    patientId,
    exercises,
    planRowId: remote?.planRowId ?? loc?.planRowId,
    versionNumber: remote?.versionNumber ?? loc?.versionNumber,
    isActive: remote?.isActive ?? loc?.isActive,
  };
}
