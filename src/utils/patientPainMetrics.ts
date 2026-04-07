import type { Patient } from '../types';
import { addClinicalDays } from './clinicalCalendar';

/** מיפוי מאמץ מדווח (1–5) לסקאלה 0–10 להשוואה ויזואלית ל־VAS */
export function effortRatingToVas10(rating: number): number {
  const r = Math.min(5, Math.max(1, Math.round(rating)));
  return ((r - 1) / 4) * 10;
}

/**
 * מדדי כאב דינמיים מתוך היסטוריית דיווחים (אחרי תרגולים).
 * - ממוצע 7 ימים קליניים: ממוצע כל רשומות הכאב בטווח.
 * - כאב היום: רק אם קיים דיווח בתאריך הקליני הנוכחי.
 */
export function getPainMetricsFromReports(
  patient: Patient,
  clinicalToday: string
): {
  avgPain7d: number | null;
  todayPain: number | null;
  lastKnownPain: number | null;
} {
  const ph = patient.analytics.painHistory;
  const start7 = addClinicalDays(clinicalToday, -6);
  const inWindow = ph.filter((r) => r.date >= start7 && r.date <= clinicalToday);
  const avgPain7d =
    inWindow.length === 0 ? null : inWindow.reduce((s, r) => s + r.painLevel, 0) / inWindow.length;

  const todayRecords = ph.filter((r) => r.date === clinicalToday);
  const todayPain =
    todayRecords.length === 0 ? null : todayRecords[todayRecords.length - 1].painLevel;

  const sorted = [...ph].sort((a, b) => a.date.localeCompare(b.date));
  const lastKnownPain = sorted.length === 0 ? null : sorted[sorted.length - 1].painLevel;

  return { avgPain7d, todayPain, lastKnownPain };
}
