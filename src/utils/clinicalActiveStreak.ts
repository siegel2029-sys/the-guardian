/**
 * Active streak resolution for clinical insights — 4-day gap rule.
 */

import { addClinicalDays } from './clinicalCalendar';
import { clinicalDaysBetween } from './patientProgressChartData';

export const ACTIVE_STREAK_MAX_GAP_DAYS = 4;

export type PriorStreakSummary = {
  startDate: string;
  endDate: string;
  sessionDayCount: number;
};

export type TrainingPhaseSegment = {
  startDate: string;
  endDate: string;
  sessionDayCount: number;
  gapAfterDays: number | null;
  isCurrentPhase: boolean;
};

export type ClinicalActiveStreakContext = {
  trueStartDate: string | null;
  actualStartDate: string | null;
  activeStreakStart: string | null;
  activeStreakEnd: string;
  activeStreakDayCount: number;
  lastGapDays: number | null;
  priorStreak: PriorStreakSummary | null;
  sessionDatesChronological: string[];
  trainingPhaseHistory: TrainingPhaseSegment[];
};

function uniqueSortedSessionDates(dates: string[]): string[] {
  return [...new Set(dates.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

export function buildTrainingPhaseHistory(
  sessionDatesChronological: string[],
  activeStreakStart: string | null
): TrainingPhaseSegment[] {
  if (sessionDatesChronological.length === 0) return [];

  const segments: TrainingPhaseSegment[] = [];
  let segmentStart = sessionDatesChronological[0];
  let segmentDates: string[] = [sessionDatesChronological[0]];

  for (let i = 1; i < sessionDatesChronological.length; i++) {
    const prev = sessionDatesChronological[i - 1];
    const next = sessionDatesChronological[i];
    const gap = clinicalDaysBetween(prev, next);

    if (gap > ACTIVE_STREAK_MAX_GAP_DAYS) {
      segments.push({
        startDate: segmentStart,
        endDate: prev,
        sessionDayCount: segmentDates.length,
        gapAfterDays: gap,
        isCurrentPhase: activeStreakStart != null && segmentStart === activeStreakStart,
      });
      segmentStart = next;
      segmentDates = [next];
    } else {
      segmentDates.push(next);
    }
  }

  const lastDate = sessionDatesChronological[sessionDatesChronological.length - 1];
  segments.push({
    startDate: segmentStart,
    endDate: lastDate,
    sessionDayCount: segmentDates.length,
    gapAfterDays: null,
    isCurrentPhase: activeStreakStart != null && segmentStart === activeStreakStart,
  });

  return segments;
}

export function resolveClinicalActiveStreak(
  sessionDates: string[],
  clinicalToday: string
): ClinicalActiveStreakContext {
  const sessionDatesChronological = uniqueSortedSessionDates(sessionDates);

  if (sessionDatesChronological.length === 0) {
    return {
      trueStartDate: null,
      actualStartDate: null,
      activeStreakStart: null,
      activeStreakEnd: clinicalToday,
      activeStreakDayCount: 0,
      lastGapDays: null,
      priorStreak: null,
      sessionDatesChronological,
      trainingPhaseHistory: [],
    };
  }

  const trueStartDate = sessionDatesChronological[0];
  let streakStart = sessionDatesChronological[0];
  let priorStreak: PriorStreakSummary | null = null;
  let lastGapDays: number | null = null;
  let priorSegmentStart = sessionDatesChronological[0];

  for (let i = 1; i < sessionDatesChronological.length; i++) {
    const prev = sessionDatesChronological[i - 1];
    const next = sessionDatesChronological[i];
    const gap = clinicalDaysBetween(prev, next);

    if (gap > ACTIVE_STREAK_MAX_GAP_DAYS) {
      priorStreak = {
        startDate: priorSegmentStart,
        endDate: prev,
        sessionDayCount: sessionDatesChronological.filter(
          (d) => d >= priorSegmentStart && d <= prev
        ).length,
      };
      lastGapDays = gap;
      streakStart = next;
      priorSegmentStart = next;
    }
  }

  const activeStreakStart = streakStart;
  const activeStreakDayCount =
    activeStreakStart != null
      ? clinicalDaysBetween(activeStreakStart, clinicalToday) + 1
      : 0;

  const trainingPhaseHistory = buildTrainingPhaseHistory(
    sessionDatesChronological,
    activeStreakStart
  );

  return {
    trueStartDate,
    actualStartDate: trueStartDate,
    activeStreakStart,
    activeStreakEnd: clinicalToday,
    activeStreakDayCount,
    lastGapDays,
    priorStreak,
    sessionDatesChronological,
    trainingPhaseHistory,
  };
}

export function sessionDatesInRange(
  sessionDates: string[],
  start: string,
  end: string
): string[] {
  return sessionDates.filter((d) => d >= start && d <= end);
}

export function* eachClinicalDayInRange(start: string, end: string): Generator<string> {
  if (start > end) return;
  let cursor = start;
  while (cursor <= end) {
    yield cursor;
    cursor = addClinicalDays(cursor, 1);
  }
}
