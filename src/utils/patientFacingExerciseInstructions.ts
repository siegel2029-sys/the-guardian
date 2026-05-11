import type { PatientExercise } from '../types';

/** Merges therapist-specific notes with default catalog instructions for patient UI. */
export function patientFacingExerciseInstructions(exercise: PatientExercise): string {
  const custom = exercise.customInstructions?.trim();
  const base = exercise.instructions?.trim() ?? '';
  if (custom && base) {
    return `${custom}\n\n${base}`;
  }
  return custom || base;
}
