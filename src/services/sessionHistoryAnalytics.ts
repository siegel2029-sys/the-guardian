import type { DailyHistoryEntry } from '../types';
import type { DayCompliancePoint } from './exerciseService';
import { addClinicalDays } from '../utils/clinicalCalendar';

export type { DayCompliancePoint } from './exerciseService';
export { fetch7dComplianceFromSupabase } from './exerciseService';

function formatDayLabel(ymd: string): string {
  const [y, m, d] = ymd.split('-').map((x) => parseInt(x, 10));
  if (!y || !m || !d) return ymd;
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString('he-IL', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** שבעה ימים קליניים אחרונים (כולל היום) — ממפת היסטוריה מקומית */
export function build7dComplianceFromLocalHistory(
  dayMap: Record<string, DailyHistoryEntry> | undefined,
  clinicalToday: string
): DayCompliancePoint[] {
  const out: DayCompliancePoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = addClinicalDays(clinicalToday, -i);
    const e = dayMap?.[d];
    const planned = e?.exercisesPlanned ?? 0;
    const completed = e?.exercisesCompleted ?? 0;
    const pct =
      planned > 0 ? Math.min(100, Math.round((completed / planned) * 100)) : completed > 0 ? 100 : 0;
    out.push({
      clinicalDate: d,
      label: formatDayLabel(d),
      completed,
      planned,
      pct,
    });
  }
  return out;
}
