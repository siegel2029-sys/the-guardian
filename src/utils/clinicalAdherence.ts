/**
 * Adherence engines for Physio-Shield.
 * Hard Rule: adherence % is computed here only — never by the LLM.
 *
 * 1) Grace-aware (exercise completion within active phase + grace window)
 * 2) Gap-aware weekly (session-day frequency vs targetWorkoutsPerWeek + gap penalty)
 */

import type { DailyHistoryEntry } from '../types';
import { addClinicalDays } from './clinicalCalendar';
import {
  clampTargetWorkoutsPerWeek,
  DEFAULT_TARGET_WORKOUTS_PER_WEEK,
} from './targetWorkoutsPerWeek';

export const GRACE_WINDOW_FORWARD_DAYS = 4;

/** Rolling lookback for flexible weekly-target adherence (4 × 7-day buckets). */
export const GAP_AWARE_LOOKBACK_DAYS = 28;

/** Consecutive calendar days without a logged session that trigger the flat penalty. */
export const CRITICAL_GAP_THRESHOLD_DAYS = 4;

/** Flat percent deducted from weekly-capped adherence when a critical gap is detected. */
export const GAP_PENALTY_PERCENT = 15;

/**
 * Minimum adherence % when at least one session was logged in the lookback.
 * Prevents a harsh absolute 0% after gap penalty while still heavily discounting long absence.
 */
export const ADHERENCE_NONEMPTY_FLOOR_PERCENT = 3;

export type GraceAwareAdherenceResult = {
  adherencePercent: number | null;
  adherenceCountableDays: number;
  adherenceCompletedSum: number;
  adherencePlannedSum: number;
  countableDayKeys: string[];
  /** Days excluded as neutral (e.g. ambiguous rest within grace window) */
  neutralDayKeys: string[];
};

export type WeeklyAdherenceBucket = {
  weekStart: string;
  weekEnd: string;
  sessionDays: number;
  /** min(1, sessionDays / target) — excess cannot exceed 100% or roll over */
  cappedRate: number;
};

export type GapAwareWeeklyAdherenceResult = {
  /** Final score after weekly caps + optional gap penalty (0–100), or null if no data window */
  adherencePercent: number | null;
  /** Average of per-week capped rates before gap penalty */
  adherenceBeforePenalty: number | null;
  targetWorkoutsPerWeek: number;
  lookbackDays: number;
  longestGapDays: number;
  hasCriticalGaps: boolean;
  gapPenaltyApplied: number;
  weeklyBuckets: WeeklyAdherenceBucket[];
  sessionDaysInLookback: number;
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

function uniqueSortedSessionDates(dates: string[]): string[] {
  return [...new Set(dates.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * Longest run of consecutive calendar days with no logged session inside [windowStart, windowEnd].
 */
export function computeLongestSessionGapDays(params: {
  windowStart: string;
  windowEnd: string;
  sessionDateSet: Set<string>;
}): number {
  const { windowStart, windowEnd, sessionDateSet } = params;
  if (windowStart > windowEnd) return 0;

  let longest = 0;
  let current = 0;
  let cursor = windowStart;
  while (cursor <= windowEnd) {
    if (sessionDateSet.has(cursor)) {
      current = 0;
    } else {
      current += 1;
      if (current > longest) longest = current;
    }
    cursor = addClinicalDays(cursor, 1);
  }
  return longest;
}

/**
 * Gap-aware weekly adherence against `targetWorkoutsPerWeek`.
 *
 * - Rolling lookback (default 28 days) split into 7-day buckets ending at clinicalToday.
 * - Weekly cap: min(100%, sessionsInWeek / target) — excess never rolls into other weeks.
 * - Gap penalty: if any stretch of > CRITICAL_GAP_THRESHOLD_DAYS has no sessions, subtract GAP_PENALTY_PERCENT.
 */
export function computeGapAwareWeeklyAdherence(params: {
  clinicalToday: string;
  sessionDatesChronological: string[];
  targetWorkoutsPerWeek?: number;
  lookbackDays?: number;
}): GapAwareWeeklyAdherenceResult {
  const target = clampTargetWorkoutsPerWeek(
    params.targetWorkoutsPerWeek ?? DEFAULT_TARGET_WORKOUTS_PER_WEEK
  );
  const lookbackDays = Math.max(
    7,
    Math.min(84, Math.round(params.lookbackDays ?? GAP_AWARE_LOOKBACK_DAYS))
  );
  const clinicalToday = params.clinicalToday;
  const windowStart = addClinicalDays(clinicalToday, -(lookbackDays - 1));
  const allSessions = uniqueSortedSessionDates(params.sessionDatesChronological);
  const sessionsInWindow = allSessions.filter((d) => d >= windowStart && d <= clinicalToday);
  const sessionDateSet = new Set(sessionsInWindow);

  const weekCount = Math.floor(lookbackDays / 7);
  const weeklyBuckets: WeeklyAdherenceBucket[] = [];

  for (let w = 0; w < weekCount; w++) {
    const weekEnd = addClinicalDays(clinicalToday, -(w * 7));
    const weekStart = addClinicalDays(weekEnd, -6);
    let sessionDays = 0;
    let cursor = weekStart;
    while (cursor <= weekEnd) {
      if (sessionDateSet.has(cursor)) sessionDays += 1;
      cursor = addClinicalDays(cursor, 1);
    }
    const cappedRate = Math.min(1, sessionDays / target);
    weeklyBuckets.push({ weekStart, weekEnd, sessionDays, cappedRate });
  }

  // Chronological order for consumers / prompts
  weeklyBuckets.reverse();

  const adherenceBeforePenalty =
    weeklyBuckets.length > 0
      ? (weeklyBuckets.reduce((sum, b) => sum + b.cappedRate, 0) / weeklyBuckets.length) * 100
      : null;

  const longestGapDays = computeLongestSessionGapDays({
    windowStart,
    windowEnd: clinicalToday,
    sessionDateSet,
  });
  const hasCriticalGaps = longestGapDays > CRITICAL_GAP_THRESHOLD_DAYS;
  const gapPenaltyApplied = hasCriticalGaps ? GAP_PENALTY_PERCENT : 0;

  let adherencePercent: number | null = null;
  if (adherenceBeforePenalty != null) {
    const afterPenalty = Math.round(adherenceBeforePenalty - gapPenaltyApplied);
    // Non-empty floor: any logged work in the lookback, OR historical sessions with a
    // critical gap (so long absence never presents as a harsh absolute 0% after activity).
    const applyNonEmptyFloor =
      sessionsInWindow.length > 0 || (allSessions.length > 0 && hasCriticalGaps);
    if (applyNonEmptyFloor) {
      adherencePercent = Math.max(ADHERENCE_NONEMPTY_FLOOR_PERCENT, afterPenalty);
    } else {
      adherencePercent = Math.max(0, afterPenalty);
    }
  }

  return {
    adherencePercent,
    adherenceBeforePenalty:
      adherenceBeforePenalty == null ? null : Math.round(adherenceBeforePenalty),
    targetWorkoutsPerWeek: target,
    lookbackDays,
    longestGapDays,
    hasCriticalGaps,
    gapPenaltyApplied,
    weeklyBuckets,
    sessionDaysInLookback: sessionsInWindow.length,
  };
}
