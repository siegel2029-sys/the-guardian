import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailyHistoryEntry, DailySession } from '../types';
import { addClinicalDays } from '../utils/clinicalCalendar';

export type DayCompliancePoint = {
  clinicalDate: string;
  label: string;
  completed: number;
  planned: number;
  pct: number;
};

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

/**
 * טוען שורות מ־session_history ב־Supabase ומחשב אחוז ציות לפי completedIds מול גודל תוכנית נוכחי.
 * אם אין שורה ליום — 0% (או ללא תוכנית: לפי דיווח בלבד).
 */
export async function fetch7dComplianceFromSupabase(
  client: SupabaseClient,
  patientId: string,
  clinicalToday: string,
  plannedExerciseCount: number
): Promise<DayCompliancePoint[] | null> {
  const start = addClinicalDays(clinicalToday, -6);
  const { data, error } = await client
    .from('session_history')
    .select('session_date, payload')
    .eq('patient_id', patientId)
    .gte('session_date', start)
    .lte('session_date', clinicalToday);

  if (error) return null;
  const rows = data ?? [];

  const byDate = new Map<string, DailySession>();
  for (const row of rows as { session_date: string; payload: unknown }[]) {
    const payload = row.payload as DailySession | null;
    if (payload && typeof payload === 'object' && payload.date) {
      byDate.set(row.session_date, payload);
    }
  }

  const out: DayCompliancePoint[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = addClinicalDays(clinicalToday, -i);
    const s = byDate.get(d);
    const completed = s?.completedIds?.length ?? 0;
    const plannedEff = Math.max(plannedExerciseCount, completed > 0 ? 1 : 0);
    const pct =
      plannedEff > 0 ? Math.min(100, Math.round((completed / plannedEff) * 100)) : 0;
    out.push({
      clinicalDate: d,
      label: formatDayLabel(d),
      completed,
      planned: plannedEff,
      pct,
    });
  }
  return out;
}
