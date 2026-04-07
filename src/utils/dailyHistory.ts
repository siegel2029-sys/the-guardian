import type { ClinicalDayStatus, DailyHistoryEntry, DailySession, ExercisePlan } from '../types';

export function deriveDailyHistoryEntry(
  clinicalDate: string,
  completedIds: string[],
  sessionXp: number,
  planned: number
): DailyHistoryEntry {
  const exercisesCompleted = completedIds.length;
  let status: ClinicalDayStatus;
  if (planned <= 0) {
    status = 'empty';
  } else if (exercisesCompleted >= planned) {
    status = 'gold';
  } else if (exercisesCompleted > 0) {
    status = 'silver';
  } else {
    status = 'stasis';
  }
  return {
    clinicalDate,
    exercisesPlanned: planned,
    exercisesCompleted,
    completedExerciseIds: [...completedIds],
    xpEarned: sessionXp,
    status,
  };
}

/** סנכרון היסטוריה מסשנים (טעינה ראשונה / מיגרציה) */
export function mergeHistoryFromSessions(
  sessions: DailySession[],
  plans: ExercisePlan[],
  base: Record<string, Record<string, DailyHistoryEntry>>
): Record<string, Record<string, DailyHistoryEntry>> {
  const next: Record<string, Record<string, DailyHistoryEntry>> = {};
  for (const k of Object.keys(base)) {
    next[k] = { ...base[k] };
  }
  for (const s of sessions) {
    const planned = plans.find((p) => p.patientId === s.patientId)?.exercises.length ?? 0;
    if (!next[s.patientId]) next[s.patientId] = {};
    next[s.patientId][s.date] = deriveDailyHistoryEntry(
      s.date,
      s.completedIds,
      s.sessionXp,
      planned
    );
  }
  return next;
}
