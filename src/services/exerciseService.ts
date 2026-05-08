import type { SupabaseClient } from '@supabase/supabase-js';
import type { DailySession, ExercisePlanHistoryEntry, PatientExercise } from '../types';
import { addClinicalDays } from '../utils/clinicalCalendar';
import { clinicalPushFail, type ClinicalPushResult } from './clinicalService';

export type ExercisePushResult = ClinicalPushResult;

export { upsertExercisePlans, updatePatientExercises } from './clinicalService';

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

/** גרסאות תוכנית מתרגילים לצורך הקשר AI / תצוגה */
export type ExercisePlanContextRow = {
  versionNumber: number;
  isActive: boolean;
  updatedAt: string;
  exerciseCount: number;
  changeSummary: string | null;
};

/** סשנים אחרונים מ־Supabase (לפי תאריך יורד). */
export async function fetchRecentSessionHistoryForPatient(
  client: SupabaseClient,
  patientId: string,
  limit = 14
): Promise<DailySession[] | null> {
  const { data, error } = await client
    .from('session_history')
    .select('session_date, payload')
    .eq('patient_id', patientId)
    .order('session_date', { ascending: false })
    .limit(limit);

  if (error) return null;

  const out: DailySession[] = [];
  for (const row of data ?? []) {
    const sessionDate = (row as { session_date: string }).session_date;
    const payload = (row as { payload: unknown }).payload as DailySession | null;
    if (payload && typeof payload === 'object' && typeof payload.date === 'string') {
      out.push(payload);
    } else {
      out.push({
        patientId,
        date: sessionDate,
        completedIds: [],
        sessionXp: 0,
      });
    }
  }
  return out;
}

export async function fetchExercisePlanVersionsForPatient(
  client: SupabaseClient,
  patientId: string,
  limit = 8
): Promise<ExercisePlanContextRow[] | null> {
  const { data, error } = await client
    .from('exercise_plans')
    .select('version_number, is_active, updated_at, exercises, change_summary')
    .eq('patient_id', patientId)
    .order('version_number', { ascending: false })
    .limit(limit);

  if (error) return null;

  return (data ?? []).map((row) => {
    const ex = row.exercises as unknown[] | null;
    return {
      versionNumber: row.version_number as number,
      isActive: row.is_active === true,
      updatedAt: row.updated_at as string,
      exerciseCount: Array.isArray(ex) ? ex.length : 0,
      changeSummary: (row.change_summary as string | null) ?? null,
    };
  });
}

export type UpsertSessionHistoryOptions = {
  /** Resolved `therapist_id` per patient (must match RLS / patients.therapist_id). */
  therapistIdByPatientId?: Record<string, string>;
};

export async function upsertSessionHistory(
  client: SupabaseClient,
  dailySessions: DailySession[],
  now: string,
  options?: UpsertSessionHistoryOptions
): Promise<ExercisePushResult> {
  const {
    data: { user: authUser },
  } = await client.auth.getUser();
  const authTherapistId = authUser?.id?.trim() ?? '';

  const therapistMap = options?.therapistIdByPatientId ?? {};
  // Map camelCase React state → snake_case DB column names.
  // session_history columns: patient_id, session_date, payload (JSONB), updated_at, therapist_id (optional).
  const missingTherapistFor: string[] = [];
  const sessionRows = dailySessions.map((s) => {
    const tid = (therapistMap[s.patientId]?.trim() || authTherapistId) || '';
    if (!tid) missingTherapistFor.push(s.patientId);
    const payloadOut: DailySession = {
      ...s,
      patientId: s.patientId,
    };
    return {
      patient_id: s.patientId,
      session_date: s.date,
      payload: payloadOut,
      updated_at: now,
      ...(tid ? { therapist_id: tid } : {}),
    };
  });

  if (sessionRows.length === 0) return { ok: true };

  const uniqMissing = [...new Set(missingTherapistFor)];
  if (uniqMissing.length > 0) {
    console.warn(
      '[upsertSessionHistory] אין therapist_id — נדרש מטפל מחובר ל-Supabase לשורות session_history',
      { patientIds: uniqMissing }
    );
  }

  const tablePreview = sessionRows.map((r) => {
    const pl = r.payload as DailySession;
    return {
      patient_id: r.patient_id,
      therapist_id:
        'therapist_id' in r ? (r as { therapist_id?: string }).therapist_id ?? '(omit)' : '(omit)',
      session_date: r.session_date,
      updated_at: r.updated_at,
      payload_patientId: pl?.patientId,
      completed_ids_n: Array.isArray(pl?.completedIds) ? pl.completedIds.length : 0,
    };
  });
  console.log('[upsertSessionHistory] ▶ session_history UPSERT (console.table)');
  console.table(tablePreview);

  const { data, error } = await client
    .from('session_history')
    .upsert(sessionRows, { onConflict: 'patient_id,session_date' })
    .select('patient_id, session_date, therapist_id');

  console.log('[upsertSessionHistory] response', { data, error: error ?? null });

  if (error) return clinicalPushFail(`session_history: ${error.message}`, error);
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
