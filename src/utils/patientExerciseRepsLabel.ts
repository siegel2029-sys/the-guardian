import { formatTime } from './formatExerciseTime';

export interface PatientRepsLabelInput {
  reps: number;
  holdSeconds?: number | null;
  /** כוח / self-care — `reps` הוא משך בשניות */
  repsAreSeconds?: boolean;
}

/**
 * תצוגת עמודת «חזרות» בפורטל מטופל.
 * «שנ'» / «ש״» רק לתרגילי זמן טהורים; כשיש חזרות — מספר החזרות בלבד (ללא holdSeconds).
 */
export function formatPatientRepsLabel(input: PatientRepsLabelInput): string {
  const reps = Math.max(0, input.reps ?? 0);
  const hold = input.holdSeconds ?? 0;

  if (input.repsAreSeconds && reps > 0) {
    return `${reps} ש״`;
  }

  if (hold > 0 && reps === 0) {
    return formatTime(hold);
  }

  return String(reps);
}
