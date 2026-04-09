import type { DailyHistoryEntry, ExerciseSession, Patient } from '../types';
import { addClinicalDays } from './clinicalCalendar';

/** יום עם לפחות תרגיל אחד שהושלם (לוח או היסטוריית סשנים) */
export function clinicalDayHasCompletedExercise(
  ymd: string,
  dayMap: Record<string, DailyHistoryEntry>,
  sessionsByDate: Map<string, ExerciseSession>
): boolean {
  const e = dayMap[ymd];
  if (e != null && e.exercisesCompleted > 0) return true;
  const s = sessionsByDate.get(ymd);
  return s != null && s.exercisesCompleted > 0;
}

/**
 * רצף ימים רצופים עם פעילות, מסתיים ב"היום" אם היום הושלמה פעילות,
 * אחרת מ"אתמול" קליני (אותה לוגיקה כמו אפליקציות כושר נפוצות).
 */
export function computeStreakForPatient(
  patient: Patient,
  dayMap: Record<string, DailyHistoryEntry>,
  clinicalToday: string
): number {
  const sessionsByDate = new Map(patient.analytics.sessionHistory.map((s) => [s.date, s]));
  const has = (ymd: string) => clinicalDayHasCompletedExercise(ymd, dayMap, sessionsByDate);

  let count = 0;
  let d = clinicalToday;
  if (!has(d)) {
    d = addClinicalDays(clinicalToday, -1);
  }
  while (has(d)) {
    count += 1;
    d = addClinicalDays(d, -1);
  }
  return count;
}
