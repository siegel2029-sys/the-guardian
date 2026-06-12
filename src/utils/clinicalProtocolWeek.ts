import type { TreatmentProtocolWeek } from '../types';
import { clinicalDaysBetween } from './patientProgressChartData';
import { normalizeProtocolWeeksForDisplay } from './protocolTrackingState';

export type ClinicalProtocolContext = {
  currentProtocolWeek: number | null;
  currentProtocolName: string | null;
  daysSinceProtocolStart: number | null;
};

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
  const match =
    weeks.find((w) => w.weekNumber === currentProtocolWeek) ?? weeks[currentProtocolWeek - 1];
  return match?.title?.trim() || `שבוע ${currentProtocolWeek}`;
}

export function computeClinicalProtocolContext(params: {
  protocolStartDate: string | null | undefined;
  clinicalToday: string;
  treatmentProtocol?: TreatmentProtocolWeek[] | string;
}): ClinicalProtocolContext {
  const weeks = normalizeProtocolWeeksForDisplay(params.treatmentProtocol);
  const daysSinceProtocolStart =
    params.protocolStartDate?.trim() != null
      ? clinicalDaysBetween(params.protocolStartDate, params.clinicalToday)
      : null;

  if (daysSinceProtocolStart == null || daysSinceProtocolStart < 0 || weeks.length === 0) {
    return {
      currentProtocolWeek: null,
      currentProtocolName: resolveCurrentProtocolName(params.treatmentProtocol, null),
      daysSinceProtocolStart:
        daysSinceProtocolStart != null && daysSinceProtocolStart >= 0
          ? daysSinceProtocolStart
          : null,
    };
  }

  const currentProtocolWeek = computeCurrentProtocolWeek(
    params.protocolStartDate,
    params.clinicalToday,
    weeks.length
  );
  const currentProtocolName = resolveCurrentProtocolName(
    params.treatmentProtocol,
    currentProtocolWeek
  );

  return {
    currentProtocolWeek,
    currentProtocolName,
    daysSinceProtocolStart,
  };
}
