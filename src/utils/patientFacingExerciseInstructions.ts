/** Minimal shape for instruction text (rehab {@link PatientExercise}, self-care levels, library rows). */
export interface PatientFacingInstructionSource {
  instructions: string;
  customInstructions?: string;
}

/** Merges therapist-specific notes with default catalog instructions for patient UI. */
export function patientFacingExerciseInstructions(exercise: PatientFacingInstructionSource): string {
  const custom = exercise.customInstructions?.trim();
  const base = exercise.instructions?.trim() ?? '';
  if (custom && base) {
    return `${custom}\n\n${base}`;
  }
  return custom || base;
}
