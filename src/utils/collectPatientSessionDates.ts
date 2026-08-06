import type { DailyHistoryEntry, DailySession, Patient } from '../types';

/**
 * Collect unique clinical session dates for gap-aware adherence / protocol freeze.
 * Prefers analytics.sessionHistory, then daily history completions, then dailySessions.
 */
export function collectPatientSessionDates(params: {
  patient: Patient;
  dailyHistoryForPatient?: Record<string, DailyHistoryEntry> | undefined;
  dailySessions?: DailySession[];
}): string[] {
  const dates = new Set<string>();

  for (const s of params.patient.analytics?.sessionHistory ?? []) {
    const d = s.date?.slice(0, 10);
    if (d) dates.add(d);
  }

  if (params.dailyHistoryForPatient) {
    for (const [ymd, entry] of Object.entries(params.dailyHistoryForPatient)) {
      if ((entry?.exercisesCompleted ?? 0) > 0 || (entry?.completedExerciseIds?.length ?? 0) > 0) {
        dates.add(ymd.slice(0, 10));
      }
    }
  }

  if (params.dailySessions?.length) {
    const pid = params.patient.id;
    for (const s of params.dailySessions) {
      if (s.patientId !== pid) continue;
      if ((s.completedIds?.length ?? 0) > 0) {
        dates.add(s.date.slice(0, 10));
      }
    }
  }

  const lastWorkout = params.patient.lastWorkoutAt?.slice(0, 10);
  if (lastWorkout) dates.add(lastWorkout);

  return [...dates].sort((a, b) => a.localeCompare(b));
}
