import type { Patient, TreatmentProtocolWeek } from '../types';
import {
  computeGapAwareWeeklyAdherence,
  CRITICAL_GAP_THRESHOLD_DAYS,
} from './clinicalAdherence';
import { clinicalDaysBetween } from './patientProgressChartData';
import { normalizeProtocolWeeksForDisplay } from './protocolTrackingState';
import { clampTargetWorkoutsPerWeek } from './targetWorkoutsPerWeek';

/** Freeze protocol week advancement when gap-aware adherence is below this %. */
export const PROTOCOL_FREEZE_ADHERENCE_THRESHOLD = 40;

export type ProtocolFreezeReason = 'critical_gap' | 'low_adherence';

export type ClinicalProtocolContext = {
  /** Effective (gap/adherence-aware) protocol week shown in UI / AI. */
  currentProtocolWeek: number | null;
  /** Pure calendar week from startDate → today (ignores gaps). */
  chronologicalProtocolWeek: number | null;
  currentProtocolName: string | null;
  daysSinceProtocolStart: number | null;
  protocolStartDate: string | null;
  /** True when chronological progression is paused due to inactivity / low adherence. */
  protocolProgressionFrozen: boolean;
  protocolFreezeReason: ProtocolFreezeReason | null;
};

export type ProtocolWeekRange = {
  weekStart: number;
  weekEnd: number;
};

function normalizeYmd(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  return value.trim().slice(0, 10);
}

/** Extract week number range from titles like «שבועות 1-2» or «שבוע 3-6». */
export function parseProtocolWeekRangeFromTitle(title: string): ProtocolWeekRange | null {
  const t = title.trim();
  if (!t) return null;

  const labeledRange = t.match(/(?:שבוע(?:ות)?|weeks?)\s*(\d+)\s*[-–—]\s*(\d+)/i);
  if (labeledRange) {
    const a = Number(labeledRange[1]);
    const b = Number(labeledRange[2]);
    if (Number.isFinite(a) && Number.isFinite(b)) {
      return { weekStart: Math.min(a, b), weekEnd: Math.max(a, b) };
    }
  }

  const labeledSingle = t.match(/(?:שבוע(?:ות)?|week)\s*(\d+)/i);
  if (labeledSingle) {
    const n = Number(labeledSingle[1]);
    if (Number.isFinite(n) && n >= 1) return { weekStart: n, weekEnd: n };
  }

  const looseRange = t.match(/(\d+)\s*[-–—]\s*(\d+)/);
  if (looseRange) {
    const a = Number(looseRange[1]);
    const b = Number(looseRange[2]);
    if (a >= 1 && a <= 52 && b >= 1 && b <= 52) {
      return { weekStart: Math.min(a, b), weekEnd: Math.max(a, b) };
    }
  }

  return null;
}

export function protocolWeekCoversCurrentWeek(
  week: TreatmentProtocolWeek,
  currentProtocolWeek: number | null
): boolean {
  if (currentProtocolWeek == null) return false;

  const range = parseProtocolWeekRangeFromTitle(week.title || '');
  if (range) {
    return currentProtocolWeek >= range.weekStart && currentProtocolWeek <= range.weekEnd;
  }

  return week.weekNumber === currentProtocolWeek;
}

export function resolveDefaultExpandedProtocolWeek(
  protocolWeeks: TreatmentProtocolWeek[],
  currentProtocolWeek: number | null
): number | null {
  if (protocolWeeks.length === 0) return null;
  if (currentProtocolWeek != null) {
    const active = protocolWeeks.find((w) =>
      protocolWeekCoversCurrentWeek(w, currentProtocolWeek)
    );
    if (active) return active.weekNumber;
  }
  return protocolWeeks[0].weekNumber;
}

function maxProtocolWeekSpan(weeks: TreatmentProtocolWeek[]): number {
  let max = weeks.length;
  for (const week of weeks) {
    const range = parseProtocolWeekRangeFromTitle(week.title || '');
    if (range) max = Math.max(max, range.weekEnd);
    max = Math.max(max, week.weekNumber);
  }
  return max;
}

/**
 * Protocol anchor: surgeryDate → startDate → training start → join → intake capture.
 */
export function resolveProtocolStartDateForPatient(
  patient: Patient,
  trainingActualStartDate?: string | null
): string | null {
  const surgery = normalizeYmd(patient.surgeryDate);
  if (surgery) return surgery;

  const start = normalizeYmd(patient.startDate);
  if (start) return start;

  const training = normalizeYmd(trainingActualStartDate);
  if (training) return training;

  const join = normalizeYmd(patient.joinDate);
  if (join) return join;

  const intakeCapture = normalizeYmd(patient.initialIntakeArchive?.capturedAt);
  if (intakeCapture) return intakeCapture;

  return null;
}

/** Week 1 = days 0–6 since protocol/training start (pure chronological). */
export function computeCurrentProtocolWeek(
  protocolStartDate: string | null | undefined,
  clinicalToday: string,
  totalWeeks?: number
): number | null {
  if (!protocolStartDate?.trim()) return null;
  const daysSinceStart = clinicalDaysBetween(protocolStartDate, clinicalToday);
  if (daysSinceStart < 0) return null;
  const week = Math.floor(daysSinceStart / 7) + 1;
  if (totalWeeks != null && totalWeeks > 0) return Math.min(week, totalWeeks);
  return week;
}

export function resolveCurrentProtocolName(
  treatmentProtocol: TreatmentProtocolWeek[] | string | undefined,
  currentProtocolWeek: number | null
): string | null {
  const weeks = normalizeProtocolWeeksForDisplay(treatmentProtocol);
  if (weeks.length === 0) return null;
  if (currentProtocolWeek == null) {
    return weeks[0]?.title?.trim() || 'שבוע 1';
  }
  const match = weeks.find((w) => protocolWeekCoversCurrentWeek(w, currentProtocolWeek));
  if (match?.title?.trim()) return match.title.trim();
  return `שבוע ${currentProtocolWeek}`;
}

function uniqueSortedDates(dates: string[]): string[] {
  return [...new Set(dates.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

/**
 * Effective protocol week: freezes chronological advancement when the patient has a
 * critical inactivity gap or gap-aware adherence falls below the functional threshold.
 * When frozen, week is capped at the week of the last logged session (min week 1).
 */
export function computeEffectiveProtocolWeek(params: {
  protocolStartDate: string | null | undefined;
  clinicalToday: string;
  totalWeeks?: number;
  sessionDatesChronological?: string[];
  adherencePercent?: number | null;
  hasCriticalGaps?: boolean;
}): {
  effectiveWeek: number | null;
  chronologicalWeek: number | null;
  frozen: boolean;
  freezeReason: ProtocolFreezeReason | null;
} {
  const chronologicalWeek = computeCurrentProtocolWeek(
    params.protocolStartDate,
    params.clinicalToday,
    params.totalWeeks
  );
  if (chronologicalWeek == null) {
    return {
      effectiveWeek: null,
      chronologicalWeek: null,
      frozen: false,
      freezeReason: null,
    };
  }

  const start = normalizeYmd(params.protocolStartDate);
  const sessions = uniqueSortedDates(params.sessionDatesChronological ?? []).filter(
    (d) => start == null || (d >= start && d <= params.clinicalToday)
  );

  const lastSession = sessions.length > 0 ? sessions[sessions.length - 1] : null;
  const weekAtLastActivity =
    lastSession != null
      ? (computeCurrentProtocolWeek(params.protocolStartDate, lastSession, params.totalWeeks) ??
        1)
      : 1;

  const hasCriticalGaps = params.hasCriticalGaps === true;
  const lowAdherence =
    params.adherencePercent != null &&
    params.adherencePercent < PROTOCOL_FREEZE_ADHERENCE_THRESHOLD;

  const daysSinceLastSession =
    lastSession != null
      ? clinicalDaysBetween(lastSession, params.clinicalToday)
      : chronologicalWeek > 1
        ? Number.POSITIVE_INFINITY
        : 0;

  const shouldHoldProgress = hasCriticalGaps || lowAdherence;
  const shouldCap = shouldHoldProgress
    ? Math.min(chronologicalWeek, Math.max(1, weekAtLastActivity))
    : chronologicalWeek;

  // Freeze when calendar advanced past last activity, or patient is past week 1
  // with a critical inactivity stretch (> threshold days since last session).
  const frozen =
    shouldHoldProgress &&
    chronologicalWeek > 1 &&
    (shouldCap < chronologicalWeek ||
      daysSinceLastSession > CRITICAL_GAP_THRESHOLD_DAYS);

  let freezeReason: ProtocolFreezeReason | null = null;
  if (frozen) {
    freezeReason = hasCriticalGaps ? 'critical_gap' : 'low_adherence';
  }

  return {
    effectiveWeek: shouldCap,
    chronologicalWeek,
    frozen,
    freezeReason,
  };
}

export function computeClinicalProtocolContext(params: {
  protocolStartDate: string | null | undefined;
  clinicalToday: string;
  treatmentProtocol?: TreatmentProtocolWeek[] | string;
  /** Session dates used to freeze chronological advancement after gaps. */
  sessionDatesChronological?: string[];
  /** Precomputed gap-aware adherence % (optional — computed from sessions when omitted). */
  adherencePercent?: number | null;
  hasCriticalGaps?: boolean;
  longestGapDays?: number;
  targetWorkoutsPerWeek?: number;
}): ClinicalProtocolContext {
  const weeks = normalizeProtocolWeeksForDisplay(params.treatmentProtocol);
  const protocolStart = normalizeYmd(params.protocolStartDate);
  const daysSinceProtocolStart =
    protocolStart != null ? clinicalDaysBetween(protocolStart, params.clinicalToday) : null;

  const empty = (week: number | null): ClinicalProtocolContext => ({
    currentProtocolWeek: week,
    chronologicalProtocolWeek: week,
    currentProtocolName: resolveCurrentProtocolName(params.treatmentProtocol, week),
    daysSinceProtocolStart:
      daysSinceProtocolStart != null && daysSinceProtocolStart >= 0
        ? daysSinceProtocolStart
        : null,
    protocolStartDate: protocolStart,
    protocolProgressionFrozen: false,
    protocolFreezeReason: null,
  });

  if (daysSinceProtocolStart == null || daysSinceProtocolStart < 0 || weeks.length === 0) {
    return empty(null);
  }

  const maxWeekSpan = maxProtocolWeekSpan(weeks);
  const sessionDates = params.sessionDatesChronological ?? [];

  let adherencePercent = params.adherencePercent;
  let hasCriticalGaps = params.hasCriticalGaps;

  if (adherencePercent === undefined || hasCriticalGaps === undefined) {
    const gapAware = computeGapAwareWeeklyAdherence({
      clinicalToday: params.clinicalToday,
      sessionDatesChronological: sessionDates,
      targetWorkoutsPerWeek: clampTargetWorkoutsPerWeek(params.targetWorkoutsPerWeek),
    });
    if (adherencePercent === undefined) adherencePercent = gapAware.adherencePercent;
    if (hasCriticalGaps === undefined) {
      hasCriticalGaps =
        gapAware.hasCriticalGaps ||
        gapAware.longestGapDays > CRITICAL_GAP_THRESHOLD_DAYS;
    }
  }

  const effective = computeEffectiveProtocolWeek({
    protocolStartDate: protocolStart,
    clinicalToday: params.clinicalToday,
    totalWeeks: maxWeekSpan,
    sessionDatesChronological: sessionDates,
    adherencePercent: adherencePercent ?? null,
    hasCriticalGaps: hasCriticalGaps === true,
  });

  return {
    currentProtocolWeek: effective.effectiveWeek,
    chronologicalProtocolWeek: effective.chronologicalWeek,
    currentProtocolName: resolveCurrentProtocolName(
      params.treatmentProtocol,
      effective.effectiveWeek
    ),
    daysSinceProtocolStart,
    protocolStartDate: protocolStart,
    protocolProgressionFrozen: effective.frozen,
    protocolFreezeReason: effective.freezeReason,
  };
}

/** Hebrew badge copy when protocol week is frozen due to inactivity / low adherence. */
export const PROTOCOL_PROGRESSION_FROZEN_BADGE_HE =
  'ההתקדמות בפרוטוקול הוקפאה עקב חוסר פעילות';
