/**
 * PatientContext exercise-plan domain helpers (baseline clone + therapist push delta).
 */
import type { ExercisePlan } from '../types';
import { exercisePlanExercisesComparableSignature } from '../services/clinicalService';

export function cloneExercisePlansForBaseline(plans: ExercisePlan[]): ExercisePlan[] {
  try {
    return JSON.parse(JSON.stringify(plans)) as ExercisePlan[];
  } catch {
    return plans.map((p) => ({
      ...p,
      exercises: p.exercises.map((ex) => ({ ...ex })),
    }));
  }
}

/** תוכניות שהשתנו לעומת צילום בסיס מהטעינה בדשבורד המטפל — דוחפת רק אותן ל-Supabase */
export function exercisePlansDeltaForTherapistPush(
  current: ExercisePlan[],
  baseline: ExercisePlan[] | null
): ExercisePlan[] {
  if (!baseline || baseline.length === 0) {
    return current;
  }
  const baseByPatient = new Map(baseline.map((p) => [p.patientId, p]));
  return current.filter((plan) => {
    const b = baseByPatient.get(plan.patientId);
    if (!b) return true;
    return (
      exercisePlanExercisesComparableSignature(plan.exercises) !==
      exercisePlanExercisesComparableSignature(b.exercises)
    );
  });
}
