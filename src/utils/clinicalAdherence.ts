/**
 * Grace-aware adherence for the current active training phase (Stream 1).
 * Hard Rule: adherence % is computed here only — never by the LLM.
 */

import type { DailyHistoryEntry } from '../types';
import { addClinicalDays } from './clinicalCalendar';

export const GRACE_WINDOW_FORWARD_DAYS = 4;

export type GraceAwareAdherenceResult = {
  adherencePercent: number | null;
  adherenceCountableDays: number;
  adherenceCompletedSum: number;
  adherencePlannedSum: number;
  countableDayKeys: string[];
  /** Days excluded as neutral (e.g. ambiguous rest within grace window) */
  neutralDayKeys: string[];
};

function isSessionDay(ymd: string, sessionDateSet: Set<string>): boolean {
  return sessionDateSet.has(ymd);
}

/**
 * Grace-window day with no session: include in denominator only when daily history
 * shows planned work or partial completion; otherwise neutral (excluded).
 */
function shouldCountGraceDay(
  ymd: string,
  sessionDateSet: Set<string>,
  dailyHistoryForPatient: Record<string, DailyHistoryEntry> | undefined,
  plannedPerDay: number
): boolean {
  if (isSessionDay(ymd, sessionDateSet)) return true;

  const entry = dailyHistoryForPatient?.[ymd];
  if (!entry) return false;

  if (entry.exercisesCompleted > 0) return true;
  if (entry.exercisesPlanned > 0) return true;
  if (plannedPerDay > 0 && entry.exercisesPlanned === 0 && entry.exercisesCompleted === 0) {
    return false;
  }
  return false;
}

/**
 * Builds countable days for current-phase adherence.
 * Session days always count. Grace days (+1..+4) count only when not neutral rest.
 */
export function buildGraceCountableDays(params: {
  sessionDatesInPhase: string[];
  phaseStart: string;
  clinicalToday: string;
  plannedPerDay: number;
  dailyHistoryForPatient: Record<string, DailyHistoryEntry> | undefined;
}): { countable: Set<string>; neutral: Set<string> } {
  const { sessionDatesInPhase, phaseStart, clinicalToday, plannedPerDay, dailyHistoryForPatient } =
    params;

  const sessionDateSet = new Set(sessionDatesInPhase);
  const candidateDays = new Set<string>();
  const sorted = [...sessionDateSet].sort((a, b) => a.localeCompare(b));

  for (const sessionDay of sorted) {
    if (sessionDay < phaseStart || sessionDay > clinicalToday) continue;
    const windowEnd = addClinicalDays(sessionDay, GRACE_WINDOW_FORWARD_DAYS);
    const cappedEnd = windowEnd > clinicalToday ? clinicalToday : windowEnd;

    let cursor = sessionDay;
    while (cursor <= cappedEnd) {
      if (cursor >= phaseStart) candidateDays.add(cursor);
      cursor = addClinicalDays(cursor, 1);
    }
  }

  const countable = new Set<string>();
  const neutral = new Set<string>();

  for (const ymd of [...candidateDays].sort((a, b) => a.localeCompare(b))) {
    if (shouldCountGraceDay(ymd, sessionDateSet, dailyHistoryForPatient, plannedPerDay)) {
      countable.add(ymd);
    } else {
      neutral.add(ymd);
    }
  }

  return { countable, neutral };
}

/**
 * Current active phase only. Missed planned days within countable set penalize (0 completed).
 * Ambiguous rest days within grace window are neutral (excluded).
 */
export function computeGraceAwareAdherence(params: {
  activeStreakStart: string | null;
  clinicalToday: string;
  sessionDatesChronological: string[];
  plannedPerDay: number;
  dailyHistoryForPatient: Record<string, DailyHistoryEntry> | undefined;
}): GraceAwareAdherenceResult {
  const {
    activeStreakStart,
    clinicalToday,
    sessionDatesChronological,
    plannedPerDay,
    dailyHistoryForPatient,
  } = params;

  if (!activeStreakStart || plannedPerDay <= 0) {
    return {
      adherencePercent: null,
      adherenceCountableDays: 0,
      adherenceCompletedSum: 0,
      adherencePlannedSum: 0,
      countableDayKeys: [],
      neutralDayKeys: [],
    };
  }

  const sessionDatesInPhase = sessionDatesChronological.filter(
    (d) => d >= activeStreakStart && d <= clinicalToday
  );

  if (sessionDatesInPhase.length === 0) {
    return {
      adherencePercent: null,
      adherenceCountableDays: 0,
      adherenceCompletedSum: 0,
      adherencePlannedSum: 0,
      countableDayKeys: [],
      neutralDayKeys: [],
    };
  }

  const { countable, neutral } = buildGraceCountableDays({
    sessionDatesInPhase,
    phaseStart: activeStreakStart,
    clinicalToday,
    plannedPerDay,
    dailyHistoryForPatient,
  });

  const countableDayKeys = [...countable].sort((a, b) => a.localeCompare(b));
  const neutralDayKeys = [...neutral].sort((a, b) => a.localeCompare(b));

  let completedSum = 0;
  for (const ymd of countableDayKeys) {
    completedSum += dailyHistoryForPatient?.[ymd]?.exercisesCompleted ?? 0;
  }

  const plannedSum = plannedPerDay * countableDayKeys.length;
  const rate = plannedSum > 0 ? completedSum / plannedSum : null;

  return {
    adherencePercent: rate != null ? Math.round(rate * 100) : null,
    adherenceCountableDays: countableDayKeys.length,
    adherenceCompletedSum: completedSum,
    adherencePlannedSum: plannedSum,
    countableDayKeys,
    neutralDayKeys,
  };
}
