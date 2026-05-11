import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  DailySession,
  ExercisePlanHistoryEntry,
  PatientExercise,
  PatientExerciseFinishReport,
} from '../types';
import { addClinicalDays, getClinicalDate } from '../utils/clinicalCalendar';
import { clinicalPushFail, type ClinicalPushResult } from './clinicalService';
import { isSupabaseAuthEnabled } from '../lib/patientPortalAuth';
import {
  ensureSupabaseSessionReady,
  logSupabaseCallError,
} from '../lib/supabaseSessionGuard';

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

async function selectPatientTherapistId(
  client: SupabaseClient,
  patientId: string
): Promise<string | null> {
  try {
    const { data, error } = await client
      .from('patients')
      .select('therapist_id')
      .eq('id', patientId)
      .maybeSingle();
    if (error) {
      logSupabaseCallError('selectPatientTherapistId', error, { patientId });
      return null;
    }
    const tid = (data as { therapist_id?: string })?.therapist_id?.trim();
    return tid && tid.length > 0 ? tid : null;
  } catch (e) {
    logSupabaseCallError('selectPatientTherapistId/catch', e, { patientId });
    return null;
  }
}

function mergeFinishReportsPayload(
  a?: PatientExerciseFinishReport[],
  b?: PatientExerciseFinishReport[]
): PatientExerciseFinishReport[] | undefined {
  const map = new Map<string, PatientExerciseFinishReport>();
  for (const r of [...(a ?? []), ...(b ?? [])]) {
    map.set(r.id, r);
  }
  const out = [...map.values()];
  return out.length > 0 ? out : undefined;
}

function mergeDailySessionPayloadWithExisting(
  prev: DailySession | undefined,
  incoming: DailySession
): DailySession {
  if (!prev) {
    return {
      ...incoming,
      patientId: incoming.patientId,
      date: incoming.date,
      finishReports: incoming.finishReports?.length ? incoming.finishReports : undefined,
    };
  }
  const ids = new Set<string>([...(prev.completedIds ?? []), ...(incoming.completedIds ?? [])]);
  const finishMerged = mergeFinishReportsPayload(prev.finishReports, incoming.finishReports);
  const dateKey =
    incoming.date && incoming.date.length > 0
      ? incoming.date
      : prev.date && prev.date.length > 0
        ? prev.date
        : incoming.date;
  return {
    patientId: incoming.patientId,
    date: dateKey,
    completedIds: [...ids],
    sessionXp: Math.max(prev.sessionXp ?? 0, incoming.sessionXp ?? 0),
    goldDisqualified: prev.goldDisqualified === true && incoming.goldDisqualified === true,
    ...(finishMerged ? { finishReports: finishMerged } : {}),
  };
}

/**
 * Read–merge–write for one clinical day — reduces lost updates vs blind overwrite when
 * the patient and therapist both touch `session_history`.
 */
export async function upsertDailySessionRowMerged(
  client: SupabaseClient,
  session: DailySession,
  options?: { therapistId?: string | null }
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    if (isSupabaseAuthEnabled()) {
      const guard = await ensureSupabaseSessionReady(client, {
        context: 'שמירת session_history',
      });
      if (!guard.ok) {
        return { ok: false, message: guard.message };
      }
    }

    let therapistId = options?.therapistId?.trim() ?? '';
    if (!therapistId) {
      const fromRow = await selectPatientTherapistId(client, session.patientId);
      therapistId = fromRow ?? '';
    }

    const { data: existing, error: readErr } = await client
      .from('session_history')
      .select('payload')
      .eq('patient_id', session.patientId)
      .eq('session_date', session.date)
      .maybeSingle();

    if (readErr) {
      logSupabaseCallError('upsertDailySessionRowMerged/select', readErr, {
        patientId: session.patientId,
        session_date: session.date,
      });
      return { ok: false, message: readErr.message };
    }

    const prevPayload =
      existing?.payload && typeof existing.payload === 'object'
        ? (existing.payload as DailySession)
        : undefined;
    const merged = mergeDailySessionPayloadWithExisting(prevPayload, {
      ...session,
      patientId: session.patientId,
    });

    const nowIso = new Date().toISOString();
    const row: Record<string, unknown> = {
      patient_id: session.patientId,
      session_date: session.date,
      payload: merged,
      updated_at: nowIso,
    };
    if (therapistId) row.therapist_id = therapistId;

    const { error } = await client
      .from('session_history')
      .upsert(row, { onConflict: 'patient_id,session_date' });

    if (error) {
      logSupabaseCallError('upsertDailySessionRowMerged/upsert', error, {
        patientId: session.patientId,
        session_date: session.date,
      });
      return { ok: false, message: error.message };
    }
    return { ok: true };
  } catch (e) {
    console.error('[SYNC_ERROR] upsertDailySessionRowMerged/unexpected', e, {
      patientId: session.patientId,
      session_date: session.date,
    });
    logSupabaseCallError('upsertDailySessionRowMerged/unexpected', e, {
      patientId: session.patientId,
    });
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

export async function persistPatientFinishReportToCloud(
  client: SupabaseClient,
  report: PatientExerciseFinishReport,
  options?: { therapistId?: string | null }
): Promise<{ ok: true } | { ok: false; message: string }> {
  try {
    const clinicalDay = getClinicalDate(new Date(report.timestamp));
    return await upsertDailySessionRowMerged(
      client,
      {
        patientId: report.patientId,
        date: clinicalDay,
        completedIds: [report.exerciseId],
        sessionXp: 0,
        finishReports: [report],
      },
      { therapistId: options?.therapistId?.trim() || undefined }
    );
  } catch (e) {
    console.error('[SYNC_ERROR] persistPatientFinishReportToCloud', e, {
      patientId: report.patientId,
      exerciseId: report.exerciseId,
    });
    return { ok: false, message: e instanceof Error ? e.message : String(e) };
  }
}

/** סשנים יומיים בטווח תאריכים קליניים (כולל הקצוות). */
export async function fetchSessionHistoryBetween(
  client: SupabaseClient,
  patientId: string,
  startDateYmd: string,
  endDateYmd: string
): Promise<DailySession[] | null> {
  const { data, error } = await client
    .from('session_history')
    .select('session_date, payload')
    .eq('patient_id', patientId)
    .gte('session_date', startDateYmd)
    .lte('session_date', endDateYmd)
    .order('session_date', { ascending: true });

  if (error) {
    logSupabaseCallError('fetchSessionHistoryBetween', error, {
      patientId,
      startDateYmd,
      endDateYmd,
    });
    return null;
  }

  const out: DailySession[] = [];
  for (const row of data ?? []) {
    const sessionDate = (row as { session_date: string }).session_date;
    const payload = (row as { payload: unknown }).payload as DailySession | null;
    if (payload && typeof payload === 'object') {
      const d =
        typeof payload.date === 'string' && payload.date.length > 0 ? payload.date : sessionDate;
      out.push({ ...(payload as DailySession), patientId, date: d });
    } else {
      out.push({ patientId, date: sessionDate, completedIds: [], sessionXp: 0 });
    }
  }
  return out;
}

/** ממיר שורות session_history למפת השלמות לשדה patients.payload._sessionCompletionByDate */
export function buildSessionCompletionByDateFromDailySessions(
  rows: DailySession[]
): Record<string, { completedIds: string[]; sessionXp: number }> | undefined {
  if (!rows.length) return undefined;
  const out: Record<string, { completedIds: string[]; sessionXp: number }> = {};
  for (const s of rows) {
    if (!s.date) continue;
    out[s.date] = {
      completedIds: [...(s.completedIds ?? [])],
      sessionXp: s.sessionXp ?? 0,
    };
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * מזין את מצב ה־DailySession המקומי ממפת השלמות (למשל אחרי מיזוג payload כשאין עדיין שורת session_history).
 */
export function hydrateDailySessionsFromSessionCompletionMap(
  prev: DailySession[],
  patientId: string,
  map?: Record<string, { completedIds: string[]; sessionXp: number }>
): DailySession[] {
  if (!map || Object.keys(map).length === 0) return prev;
  let acc = prev;
  for (const [date, v] of Object.entries(map)) {
    const row: DailySession = {
      patientId,
      date,
      completedIds: [...(v.completedIds ?? [])],
      sessionXp: v.sessionXp ?? 0,
    };
    acc = mergeDailySessionsWithServerForPatient(acc, patientId, [row]);
  }
  return acc;
}

/** מיזוג סשנים מקומיים עם שורות שהגיעו מהשרת (דשבורד מטפל אחרי טעינה). */
export function mergeDailySessionsWithServerForPatient(
  prev: DailySession[],
  patientId: string,
  serverRows: DailySession[]
): DailySession[] {
  const others = prev.filter((s) => s.patientId !== patientId);
  const localForPatient = prev.filter((s) => s.patientId === patientId);
  const byDate = new Map<string, DailySession>();
  for (const s of serverRows) {
    byDate.set(s.date, {
      ...s,
      patientId,
      finishReports: s.finishReports?.length ? [...s.finishReports] : undefined,
    });
  }
  for (const s of localForPatient) {
    const ex = byDate.get(s.date);
    if (!ex) {
      byDate.set(s.date, s);
      continue;
    }
    const merged = mergeDailySessionPayloadWithExisting(ex, s);
    byDate.set(s.date, merged);
  }
  return [...others, ...byDate.values()];
}

export function aggregateFinishReportsFromSessionRows(
  rows: DailySession[]
): PatientExerciseFinishReport[] {
  const out: PatientExerciseFinishReport[] = [];
  for (const s of rows) {
    if (Array.isArray(s.finishReports)) out.push(...s.finishReports);
  }
  const byId = new Map<string, PatientExerciseFinishReport>();
  for (const r of out) {
    byId.set(r.id, r);
  }
  return [...byId.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
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
  try {
    if (isSupabaseAuthEnabled()) {
      const guard = await ensureSupabaseSessionReady(client, {
        context: 'שמירת session_history (אצווה)',
      });
      if (!guard.ok) {
        return { ok: false, message: `session_history: ${guard.message}` };
      }
    }

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

  if (error) {
    logSupabaseCallError('upsertSessionHistory/upsert', error, {
      rowCount: sessionRows.length,
    });
    return clinicalPushFail(`session_history: ${error.message}`, error);
  }
  return { ok: true };
  } catch (e) {
    logSupabaseCallError('upsertSessionHistory/unexpected', e);
    return clinicalPushFail(
      `session_history: ${e instanceof Error ? e.message : String(e)}`,
      e
    );
  }
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

  if (error) {
    logSupabaseCallError('fetch7dComplianceFromSupabase', error, { patientId, clinicalToday });
    return null;
  }
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
