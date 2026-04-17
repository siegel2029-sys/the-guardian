import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailySession, ExercisePlanHistoryEntry, PatientExercise } from '../types';
import { addClinicalDays } from '../utils/clinicalCalendar';
import type { ClinicalPushResult } from './clinicalService';

export type ExercisePushResult = ClinicalPushResult;

export { upsertExercisePlans } from './clinicalService';

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

/** All inactive exercise_plans rows for a patient (ordered by version_number descending). */
export async function fetchPlanHistory(
  client: SupabaseClient,
  patientId: string
): Promise<ExercisePlanHistoryEntry[] | null> {
  const { data, error } = await client
    .from('exercise_plans')
    .select('id, patient_id, exercises, version_number, parent_plan_id, change_summary, updated_at')
    .eq('patient_id', patientId)
    .eq('is_active', false)
    .order('version_number', { ascending: false });

  if (error) return null;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    patientId: row.patient_id as string,
    exercises: row.exercises as PatientExercise[],
    versionNumber: row.version_number as number,
    parentPlanId: (row.parent_plan_id as string | null) ?? null,
    changeSummary: (row.change_summary as string | null) ?? null,
    updatedAt: row.updated_at as string,
  }));
}

export async function upsertSessionHistory(
  client: SupabaseClient,
  dailySessions: DailySession[],
  now: string
): Promise<ExercisePushResult> {
  const sessionRows = dailySessions.map((s) => ({
    patient_id: s.patientId,
    session_date: s.date,
    payload: s,
    updated_at: now,
  }));

  if (sessionRows.length > 0) {
    const { error } = await client.from('session_history').upsert(sessionRows, {
      onConflict: 'patient_id,session_date',
    });
    if (error) return { ok: false, message: `session_history: ${error.message}` };
  }

  return { ok: true };
}

/**
 * Loads session_history rows from Supabase and builds 7-day compliance points from completedIds vs plan size.
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
