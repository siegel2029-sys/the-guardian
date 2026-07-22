import type { PainRecord, Patient, PatientExerciseFinishReport } from '../types';
import {
  addClinicalDays,
  clinicalDateToLocalMidnight,
  getClinicalDate,
} from './clinicalCalendar';
import { reportMatchesActiveArea } from './strengthenedAreasToday';
import {
  clinicalDailyProgressScore,
  effortToScale10,
  type EffortScaleVersion,
} from './effortScale';

export const PROGRESS_CHART_WINDOW_DAYS = 30;

export type PatientProgressChartPoint = {
  dateKey: string;
  label: string;
  pain: number | null;
  effort: number | null;
  /** Clinically-weighted progress score (0–10, higher = better). Used for trendline. */
  progress: number | null;
  trend: number | null;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function avg(nums: number[]): number {
  return nums.reduce((s, v) => s + v, 0) / nums.length;
}

/**
 * Maps a stored effort rating onto the chart Y-axis (0–10).
 * Legacy 1–5 values (no effortScale / scale 5) are multiplied by 2.
 */
export function effortRatingToChart10(
  rating: number,
  effortScale?: EffortScaleVersion | null
): number {
  return round1(effortToScale10(rating, effortScale));
}

/** @deprecated Use {@link effortRatingToChart10} — kept for import compatibility. */
export function effortRating1to5ToChart10(rating: number): number {
  return effortRatingToChart10(rating, 5);
}

/** Normalize ISO timestamps to clinical YYYY-MM-DD (04:00 rollover, local browser time). */
export function clinicalDayKeyFromTimestamp(isoTimestamp: string): string {
  return getClinicalDate(new Date(isoTimestamp));
}

/** Pain records already use session clinical dates; keep YYYY-MM-DD prefix only. */
export function clinicalDayKeyFromPainRecord(record: PainRecord): string {
  return record.date.slice(0, 10);
}

export function clinicalDaysBetween(earlierYmd: string, laterYmd: string): number {
  const a = clinicalDateToLocalMidnight(earlierYmd).getTime();
  const b = clinicalDateToLocalMidnight(laterYmd).getTime();
  return Math.round((b - a) / (24 * 60 * 60 * 1000));
}

function formatChartLabel(dateKey: string): string {
  const d = clinicalDateToLocalMidnight(dateKey);
  return d.toLocaleDateString('he-IL', { day: 'numeric', month: 'short' });
}

function clampChart0to10(n: number): number {
  return round1(Math.max(0, Math.min(10, n)));
}

function fitLinearRegression(
  points: { x: number; y: number }[]
): { slope: number; intercept: number } | null {
  if (points.length === 0) return null;
  if (points.length === 1) return { slope: 0, intercept: points[0].y };

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumXX = 0;
  const n = points.length;
  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXY += p.x * p.y;
    sumXX += p.x * p.x;
  }
  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-9) {
    return { slope: 0, intercept: sumY / n };
  }
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

type DayBucket = {
  pains: number[];
  /** Effort already normalized to 1–10 display scale. */
  efforts10: number[];
};

/**
 * Builds the full continuous active-area progress series (never truncated for AI).
 * Finish-report timestamps are grouped by clinical day; painHistory uses session dates.
 * Falls back to sessionHistory.difficultyRating when finish-report effort is absent for a day.
 */
export function buildActiveAreaProgressSeries(
  patient: Patient,
  finishReports: PatientExerciseFinishReport[]
): PatientProgressChartPoint[] {
  const primary = patient.primaryBodyArea;
  const byDay = new Map<string, DayBucket>();

  const ensureBucket = (dateKey: string): DayBucket => {
    let bucket = byDay.get(dateKey);
    if (!bucket) {
      bucket = { pains: [], efforts10: [] };
      byDay.set(dateKey, bucket);
    }
    return bucket;
  };

  const activeReports = finishReports.filter(
    (r) => r.patientId === patient.id && reportMatchesActiveArea(r, primary)
  );

  for (const report of activeReports) {
    const dateKey = clinicalDayKeyFromTimestamp(report.timestamp);
    const bucket = ensureBucket(dateKey);
    if (report.painLevel != null) bucket.pains.push(report.painLevel);
    // Always include effort from finish reports (was previously dropped when zone mismatched)
    if (report.difficultyScore != null && Number.isFinite(Number(report.difficultyScore))) {
      bucket.efforts10.push(
        effortRatingToChart10(Number(report.difficultyScore), report.effortScale ?? null)
      );
    }
  }

  const primaryPain = (patient.analytics?.painHistory ?? []).filter(
    (r) => r.bodyArea === primary
  );
  for (const record of primaryPain) {
    const dateKey = clinicalDayKeyFromPainRecord(record);
    ensureBucket(dateKey).pains.push(record.painLevel);
  }

  // Fallback: sessionHistory effort when a clinical day has pain but no finish-report effort
  for (const session of patient.analytics?.sessionHistory ?? []) {
    const dateKey = session.date.slice(0, 10);
    const bucket = ensureBucket(dateKey);
    if (bucket.efforts10.length === 0 && session.difficultyRating != null) {
      bucket.efforts10.push(
        effortRatingToChart10(session.difficultyRating, session.effortScale ?? null)
      );
    }
  }

  const sortedKeys = [...byDay.keys()].sort((a, b) => a.localeCompare(b));
  const points: PatientProgressChartPoint[] = [];

  for (const dateKey of sortedKeys) {
    const { pains, efforts10 } = byDay.get(dateKey)!;
    const pain = pains.length > 0 ? round1(avg(pains)) : null;
    const effort = efforts10.length > 0 ? round1(avg(efforts10)) : null;
    const progress = clinicalDailyProgressScore(pain, effort);

    if (pain == null && effort == null) continue;

    points.push({
      dateKey,
      label: formatChartLabel(dateKey),
      pain,
      effort,
      progress,
      trend: null,
    });
  }

  return points;
}

/** Inserts null bridge rows when gap between logged sessions exceeds maxGapDays (display only). */
export function applySessionGapBreaks(
  points: PatientProgressChartPoint[],
  maxGapDays = 3
): PatientProgressChartPoint[] {
  if (points.length <= 1) return [...points];

  const result: PatientProgressChartPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    result.push(points[i]);
    if (i < points.length - 1) {
      const gap = clinicalDaysBetween(points[i].dateKey, points[i + 1].dateKey);
      if (gap > maxGapDays) {
        const bridgeKey = addClinicalDays(points[i].dateKey, 1);
        result.push({
          dateKey: bridgeKey,
          label: '',
          pain: null,
          effort: null,
          progress: null,
          trend: null,
        });
      }
    }
  }
  return result;
}

/** Returns points whose clinical date falls within [windowEnd - (windowDays-1), windowEnd]. */
export function sliceProgressWindow(
  fullSeries: PatientProgressChartPoint[],
  windowEnd: string,
  windowDays: number = PROGRESS_CHART_WINDOW_DAYS
): PatientProgressChartPoint[] {
  const windowStart = addClinicalDays(windowEnd, -(windowDays - 1));
  return fullSeries.filter((p) => p.dateKey >= windowStart && p.dateKey <= windowEnd);
}

/**
 * Fits a least-squares line to clinically-weighted daily progress scores,
 * then assigns `trend = mx + b` at every index (including gap-bridge rows).
 */
export function applyLinearRegressionTrend(
  points: PatientProgressChartPoint[]
): PatientProgressChartPoint[] {
  const regressionInputs: { x: number; y: number }[] = [];

  points.forEach((point, index) => {
    const score =
      point.progress ?? clinicalDailyProgressScore(point.pain, point.effort);
    if (score != null) {
      regressionInputs.push({ x: index, y: score });
    }
  });

  const fit = fitLinearRegression(regressionInputs);
  if (!fit) {
    return points.map((point) => ({ ...point, trend: null }));
  }

  return points.map((point, index) => ({
    ...point,
    trend: clampChart0to10(fit.slope * index + fit.intercept),
  }));
}

/** Slice window, apply gap breaks, then compute the linear regression trendline. */
export function buildProgressChartDisplaySeries(
  fullSeries: PatientProgressChartPoint[],
  windowEnd: string,
  windowDays: number = PROGRESS_CHART_WINDOW_DAYS
): PatientProgressChartPoint[] {
  const sliced = sliceProgressWindow(fullSeries, windowEnd, windowDays);
  const withGaps = applySessionGapBreaks(sliced);
  return applyLinearRegressionTrend(withGaps);
}

export function formatProgressWindowRangeHe(
  windowEnd: string,
  windowDays: number = PROGRESS_CHART_WINDOW_DAYS
): string {
  const windowStart = addClinicalDays(windowEnd, -(windowDays - 1));
  const startLabel = clinicalDateToLocalMidnight(windowStart).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  const endLabel = clinicalDateToLocalMidnight(windowEnd).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${startLabel} – ${endLabel}`;
}
