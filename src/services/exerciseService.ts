import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailySession, ExercisePlan, ExercisePlanHistoryEntry, PatientExercise } from '../types';
import { addClinicalDays } from '../utils/clinicalCalendar';

export type ExercisePushResult = { ok: true } | { ok: false; message: string };

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

function exercisesJsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

type UpsertExercisePlansOptions = {
  /** Optional per-patient note stored on the new version row when content changes. */
  changeSummaryByPatientId?: Record<string, string>;
};

/**
 * Syncs exercise plans to Supabase with versioning: updates create a new row, increment
 * version_number, link parent_plan_id, and set the previous active row to is_active = false.
 * Unchanged exercises vs the current active row only refresh updated_at.
 */
export async function upsertExercisePlans(
  client: SupabaseClient,
  exercisePlans: ExercisePlan[],
  now: string,
  options?: UpsertExercisePlansOptions
): Promise<ExercisePushResult> {
  const changeSummaryByPatientId = options?.changeSummaryByPatientId ?? {};

  for (const plan of exercisePlans) {
    const { patientId, exercises } = plan;
    const changeSummary = changeSummaryByPatientId[patientId] ?? null;

    const { data: active, error: selErr } = await client
      .from('exercise_plans')
      .select('id, version_number, exercises')
      .eq('patient_id', patientId)
      .eq('is_active', true)
      .maybeSingle();

    if (selErr) {
      return { ok: false, message: `exercise_plans: ${selErr.message}` };
    }

    if (!active) {
      const { error: insErr } = await client.from('exercise_plans').insert({
        patient_id: patientId,
        exercises,
        updated_at: now,
        version_number: 1,
        is_active: true,
        parent_plan_id: null,
        change_summary: changeSummary,
      });
      if (insErr) return { ok: false, message: `exercise_plans: ${insErr.message}` };
      continue;
    }

    const row = active as { id: string; version_number: number; exercises: unknown };

    if (exercisesJsonEqual(row.exercises, exercises)) {
      const { error: touchErr } = await client
        .from('exercise_plans')
        .update({ updated_at: now })
        .eq('id', row.id);
      if (touchErr) return { ok: false, message: `exercise_plans: ${touchErr.message}` };
      continue;
    }

    const { error: deactErr } = await client
      .from('exercise_plans')
      .update({ is_active: false })
      .eq('id', row.id);
    if (deactErr) return { ok: false, message: `exercise_plans: ${deactErr.message}` };

    const nextVersion = (row.version_number ?? 1) + 1;
    const { error: insErr } = await client.from('exercise_plans').insert({
      patient_id: patientId,
      exercises,
      updated_at: now,
      version_number: nextVersion,
      is_active: true,
      parent_plan_id: row.id,
      change_summary: changeSummary,
    });
    if (insErr) return { ok: false, message: `exercise_plans: ${insErr.message}` };
  }

  return { ok: true };
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
