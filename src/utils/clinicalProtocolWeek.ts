import type { Patient, TreatmentProtocolWeek } from '../types';
import { clinicalDaysBetween } from './patientProgressChartData';
import { normalizeProtocolWeeksForDisplay } from './protocolTrackingState';

export type ClinicalProtocolContext = {
  currentProtocolWeek: number | null;
  currentProtocolName: string | null;
  daysSinceProtocolStart: number | null;
  protocolStartDate: string | null;
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

/** Week 1 = days 0–6 since protocol/training start. */
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

export function computeClinicalProtocolContext(params: {
  protocolStartDate: string | null | undefined;
  clinicalToday: string;
  treatmentProtocol?: TreatmentProtocolWeek[] | string;
}): ClinicalProtocolContext {
  const weeks = normalizeProtocolWeeksForDisplay(params.treatmentProtocol);
  const protocolStart = normalizeYmd(params.protocolStartDate);
  const daysSinceProtocolStart =
    protocolStart != null ? clinicalDaysBetween(protocolStart, params.clinicalToday) : null;

  if (daysSinceProtocolStart == null || daysSinceProtocolStart < 0 || weeks.length === 0) {
    return {
      currentProtocolWeek: null,
      currentProtocolName: resolveCurrentProtocolName(params.treatmentProtocol, null),
      daysSinceProtocolStart:
        daysSinceProtocolStart != null && daysSinceProtocolStart >= 0
          ? daysSinceProtocolStart
          : null,
      protocolStartDate: protocolStart,
    };
  }

  const maxWeekSpan = maxProtocolWeekSpan(weeks);
  const currentProtocolWeek = computeCurrentProtocolWeek(
    protocolStart,
    params.clinicalToday,
    maxWeekSpan
  );
  const currentProtocolName = resolveCurrentProtocolName(
    params.treatmentProtocol,
    currentProtocolWeek
  );

  return {
    currentProtocolWeek,
    currentProtocolName,
    daysSinceProtocolStart,
    protocolStartDate: protocolStart,
  };
}
