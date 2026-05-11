import type { PostgrestError, SupabaseClient, User } from '@supabase/supabase-js';
import type {
  BodyArea,
  DailyHistoryEntry,
  ExercisePlan,
  ExerciseSession,
  PainRecord,
  Patient,
  PatientExercise,
  Therapist,
} from '../types';
import { computeStreakForPatient } from '../utils/exerciseStreak';
import {
  isSupabaseAuthEnabled,
  normalizePortalUsername,
  portalUsernameToAuthEmail,
} from '../lib/patientPortalAuth';
import {
  lifetimeXpFromPatient,
  normalizePatientProgressFields,
  patientWithLifetimeXp,
} from '../body/patientLevelXp';
import {
  ensureSupabaseSessionReady,
  logSupabaseCallError,
} from '../lib/supabaseSessionGuard';

/**
 * בסיס ידע גלובלי («הידעת?») — לא נמשך כאן בשאילתות קליניות.
 *
 * המאגר ב־Supabase: טבלה `app_knowledge_base`, שורת `id='global'`, עמודת `items` (JSONB של אובייקטי עובדות).
 * אין פילטר SQL ל־`is_approved` על כל איבר בתוך ה־JSON; הפילטר לפורטל המטופל מיושם ב־`fetchAppKnowledgeBaseFromSupabase`
 * (ב־`gamificationService.ts`) עם `{ approvedOnly: true }` — לאחר הנירמול ב־`knowledgeFactNormalize.ts`.
 */

/**
 * RLS requires `patients.therapist_id = auth.uid()::text`. Legacy data may use
 * `therapist-001` / `therapist-002`; map those to the signed-in user's real id.
 */
export function resolveTherapistIdForSupabaseRls(patientTherapistId: string, user: User): string | null {
  if (patientTherapistId === user.id) return user.id;
  if (patientTherapistId === 'therapist-001' || patientTherapistId === 'therapist-002') {
    return user.id;
  }
  return null;
}

const THERAPISTS_BY_ID: Record<string, Therapist> = {};

/**
 * Default: only columns that exist on trimmed `patients` schemas (avoids PostgREST 400).
 * Set `VITE_PATIENTS_UPSERT_FULL_COLUMNS=true` if your DB includes mirrored demographics
 * (`contact_email`, `age`, `gender`, `birth_date`, …).
 */
const PATIENTS_UPSERT_FULL_DENORMALIZED =
  import.meta.env.VITE_PATIENTS_UPSERT_FULL_COLUMNS === 'true';

/** Strip keys whose value is `undefined` so PostgREST never receives literal undefined. */
function shallowStripUndefined(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row };
  for (const k of Object.keys(out)) {
    if (out[k] === undefined) delete out[k];
  }
  return out;
}

function mergeSessionHistoryByDate(a: ExerciseSession[], b: ExerciseSession[]): ExerciseSession[] {
  const map = new Map<string, ExerciseSession>();
  for (const s of [...a, ...b]) {
    const cur = map.get(s.date);
    if (!cur) {
      map.set(s.date, { ...s });
      continue;
    }
    map.set(s.date, {
      date: s.date,
      exercisesCompleted: Math.max(cur.exercisesCompleted, s.exercisesCompleted),
      totalExercises: Math.max(cur.totalExercises, s.totalExercises),
      difficultyRating: Math.max(cur.difficultyRating, s.difficultyRating),
      xpEarned: Math.max(cur.xpEarned, s.xpEarned),
    });
  }
  return [...map.values()].sort((x, y) => x.date.localeCompare(y.date));
}

function painRecordKey(r: PainRecord): string {
  return `${r.date}|${r.bodyArea}|${r.painLevel}`;
}

function mergePainHistoryUnique(a: PainRecord[], b: PainRecord[]): PainRecord[] {
  const map = new Map<string, PainRecord>();
  for (const r of [...a, ...b]) {
    map.set(painRecordKey(r), r);
  }
  return [...map.values()].sort((x, y) => x.date.localeCompare(y.date));
}

/** Minimal day map from merged session rows — for recomputing streak after fetch merge. */
function dayMapFromExerciseSessions(sessions: ExerciseSession[]): Record<string, DailyHistoryEntry> {
  const out: Record<string, DailyHistoryEntry> = {};
  for (const s of sessions) {
    out[s.date] = {
      clinicalDate: s.date,
      exercisesPlanned: s.totalExercises,
      exercisesCompleted: s.exercisesCompleted,
      completedExerciseIds: [],
      xpEarned: s.xpEarned,
      status: s.exercisesCompleted > 0 ? 'gold' : 'empty',
    };
  }
  return out;
}

function recomputePainAverages(painHistory: PainRecord[]): {
  averageOverallPain: number;
  painByArea: Partial<Record<BodyArea, number>>;
} {
  if (painHistory.length === 0) {
    return { averageOverallPain: 0, painByArea: {} };
  }
  const averageOverallPain =
    Math.round(
      (painHistory.reduce((sum, r) => sum + r.painLevel, 0) / painHistory.length) * 10
    ) / 10;
  const byArea: Partial<Record<BodyArea, number>> = {};
  const buckets: Partial<Record<BodyArea, { sumw: number; w: number }>> = {};
  for (const r of painHistory) {
    const cur = buckets[r.bodyArea] ?? { sumw: 0, w: 0 };
    cur.sumw += r.painLevel;
    cur.w += 1;
    buckets[r.bodyArea] = cur;
  }
  for (const [area, v] of Object.entries(buckets)) {
    if (v && v.w > 0) {
      byArea[area as BodyArea] = Math.round((v.sumw / v.w) * 10) / 10;
    }
  }
  return { averageOverallPain, painByArea: byArea };
}

/** Union-merge per clinical day: completed exercise IDs + max session XP (local vs server). */
export function mergeSessionCompletionByDateMaps(
  a?: Record<string, { completedIds: string[]; sessionXp: number }>,
  b?: Record<string, { completedIds: string[]; sessionXp: number }>
): Record<string, { completedIds: string[]; sessionXp: number }> | undefined {
  if (!a && !b) return undefined;
  if (!a) return b && Object.keys(b).length > 0 ? { ...b } : undefined;
  if (!b) return Object.keys(a).length > 0 ? { ...a } : undefined;
  const out: Record<string, { completedIds: string[]; sessionXp: number }> = {};
  for (const d of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const aa = a[d];
    const bb = b[d];
    const ids = new Set<string>([...(aa?.completedIds ?? []), ...(bb?.completedIds ?? [])]);
    out[d] = {
      completedIds: [...ids],
      sessionXp: Math.max(aa?.sessionXp ?? 0, bb?.sessionXp ?? 0),
    };
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export type MergePatientPayloadOptions = {
  /**
   * When set, `currentStreak` is derived from the merged `sessionHistory` (union of server + local),
   * so one side cannot replace the other's streak counter without merging activity first.
   */
  clinicalToday?: string;
};

/**
 * Fetch-merge-save safe: combines server (`existing`) and client (`incoming`) so cumulative
 * gamification cannot be wiped by a stale client payload (e.g. empty XP after reload).
 * Demographics / clinical fields follow `incoming`; XP and coins use {@link Math.max}; session and
 * pain histories are merged by date/key; streaks use merged history when `clinicalToday` is passed.
 */
export function mergePatientPayloadForUpsert(
  existing: Patient | undefined,
  incoming: Patient,
  opts?: MergePatientPayloadOptions
): Patient {
  if (!existing) {
    let sole = normalizePatientProgressFields({ ...incoming });
    sole._sessionCompletionByDate = mergeSessionCompletionByDateMaps(
      undefined,
      incoming._sessionCompletionByDate
    );
    if (opts?.clinicalToday) {
      const dm = dayMapFromExerciseSessions(sole.analytics?.sessionHistory ?? []);
      sole.currentStreak = computeStreakForPatient(sole, dm, opts.clinicalToday);
      sole.longestStreak = Math.max(sole.longestStreak ?? 0, sole.currentStreak);
    }
    return sole;
  }
  const maxLife = Math.max(lifetimeXpFromPatient(existing), lifetimeXpFromPatient(incoming));
  let merged = patientWithLifetimeXp({ ...incoming }, maxLife);
  merged.coins = Math.max(existing.coins ?? 0, incoming.coins ?? 0);
  merged.lastSessionDate =
    (existing.lastSessionDate ?? '').localeCompare(incoming.lastSessionDate ?? '') > 0
      ? existing.lastSessionDate
      : incoming.lastSessionDate;
  merged.pendingMessages = Math.max(existing.pendingMessages ?? 0, incoming.pendingMessages ?? 0);

  const sessionHistory = mergeSessionHistoryByDate(
    existing.analytics?.sessionHistory ?? [],
    incoming.analytics?.sessionHistory ?? []
  );
  const painHistory = mergePainHistoryUnique(
    existing.analytics?.painHistory ?? [],
    incoming.analytics?.painHistory ?? []
  );
  const { averageOverallPain, painByArea } = recomputePainAverages(painHistory);
  const sessionDiffAvg =
    sessionHistory.length === 0
      ? incoming.analytics.averageDifficulty
      : sessionHistory.reduce((sum, s) => sum + s.difficultyRating, 0) / sessionHistory.length;

  merged.analytics = {
    ...incoming.analytics,
    sessionHistory,
    painHistory,
    averageOverallPain,
    painByArea,
    averageDifficulty: Math.round(sessionDiffAvg * 10) / 10,
    totalSessions: Math.max(
      sessionHistory.length,
      existing.analytics?.totalSessions ?? 0,
      incoming.analytics?.totalSessions ?? 0
    ),
  };

  if (opts?.clinicalToday) {
    const dm = dayMapFromExerciseSessions(sessionHistory);
    const fromMergedHistory = computeStreakForPatient(merged, dm, opts.clinicalToday);
    merged.currentStreak = fromMergedHistory;
    merged.longestStreak = Math.max(
      existing.longestStreak ?? 0,
      incoming.longestStreak ?? 0,
      fromMergedHistory
    );
  } else {
    merged.currentStreak = Math.max(existing.currentStreak ?? 0, incoming.currentStreak ?? 0);
    merged.longestStreak = Math.max(existing.longestStreak ?? 0, incoming.longestStreak ?? 0);
  }

  merged._sessionCompletionByDate = mergeSessionCompletionByDateMaps(
    existing._sessionCompletionByDate,
    incoming._sessionCompletionByDate
  );

  return normalizePatientProgressFields(merged);
}

function consoleTableBeforePatientsUpsert(row: Record<string, unknown>, label: string) {
  const { payload, ...scalar } = row;
  const p = payload as Record<string, unknown> | null | undefined;
  const payloadKeys = p && typeof p === 'object' ? Object.keys(p).length : 0;
  console.log(`[upsertPatientRecords] ▶ ${label} (console.table)`);
  console.table([
    {
      ...scalar,
      payload: `(JSONB object, ${payloadKeys} top-level keys)`,
    },
  ]);
}

function consoleTableExercisePlanRow(label: string, row: Record<string, unknown>) {
  const ex = row.exercises;
  const exN = Array.isArray(ex) ? (ex as unknown[]).length : '—';
  console.log(`[upsertExercisePlans] ▶ ${label} (console.table)`);
  console.table([
    {
      id: row.id,
      patient_id: row.patient_id,
      version_number: row.version_number,
      is_active: row.is_active,
      parent_plan_id: row.parent_plan_id,
      updated_at: row.updated_at,
      change_summary: row.change_summary,
      exercises: `[${exN} items]`,
    },
  ]);
}

/** HTTP status when PostgREST / Auth returns one (helps surface 400/401 to the UI). */
export function postgrestHttpStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const o = err as Record<string, unknown>;
    const s = o.status ?? o.statusCode;
    if (typeof s === 'number' && Number.isFinite(s)) return s;
  }
  return undefined;
}

export function clinicalPushFail(message: string, err?: unknown): {
  ok: false;
  message: string;
  httpStatus?: number;
} {
  const httpStatus = err !== undefined ? postgrestHttpStatus(err) : undefined;
  return httpStatus !== undefined ? { ok: false, message, httpStatus } : { ok: false, message };
}

export type ClinicalPushResult =
  | { ok: true; syncedPatients?: Patient[] }
  | { ok: false; message: string; httpStatus?: number };

export type ClinicalAuditLogRow = {
  id: string;
  therapist_id: string;
  patient_id: string;
  entity_type: string;
  action: string;
  old_value: unknown;
  new_value: unknown;
  created_at: string;
};

/**
 * Therapist profile rows for Supabase — used when syncing patient state (patient.therapistId).
 *
 * With Supabase Auth + RLS (`profiles.id = auth.uid()::text`), only the signed-in user's row may be
 * written. Demo ids like `therapist-001` are not valid UUIDs for `auth.uid()` — upserting them causes 400.
 * When {@link isSupabaseAuthEnabled} is true, we only upsert the row for `auth.getUser().id`.
 */
export async function upsertTherapistProfilesForPatients(
  client: SupabaseClient,
  patients: Patient[],
  now: string
): Promise<ClinicalPushResult> {
  let therapistIds: string[];
  let authUser: User | null = null;

  if (isSupabaseAuthEnabled()) {
    const {
      data: { user },
      error: userErr,
    } = await client.auth.getUser();
    if (userErr || !user?.id) {
      return { ok: true };
    }
    therapistIds = [user.id];
    authUser = user;
  } else {
    const ids = new Set<string>();
    for (const p of patients) {
      ids.add(p.therapistId);
    }
    therapistIds = [...ids];
  }

  const profileRows = therapistIds.map((id) => {
    const t = THERAPISTS_BY_ID[id] ?? {
      id,
      name: 'מטפל',
      email: '',
      title: '',
      avatarInitials: '—',
      clinicName: '',
    };
    const meta = authUser?.user_metadata as Record<string, unknown> | undefined;
    const fromMetaName =
      typeof meta?.full_name === 'string' && meta.full_name.trim()
        ? meta.full_name.trim()
        : typeof meta?.name === 'string' && meta.name.trim()
          ? meta.name.trim()
          : '';
    return {
      id,
      email:
        authUser?.id === id && authUser.email?.trim()
          ? authUser.email.trim()
          : t.email,
      name: fromMetaName || t.name,
      title: t.title,
      avatar_initials: t.avatarInitials,
      clinic_name: t.clinicName,
      updated_at: now,
    };
  });

  if (profileRows.length > 0) {
    const { error } = await client.from('profiles').upsert(profileRows, { onConflict: 'id' });
    if (error) return clinicalPushFail(`profiles: ${error.message}`, error);
  }

  return { ok: true };
}

async function insertClinicalAuditLog(
  client: SupabaseClient,
  row: {
    therapistId: string;
    patientId: string;
    entityType: 'plan' | 'patient_info';
    action: 'create' | 'update';
    oldValue: unknown;
    newValue: unknown;
  }
): Promise<ClinicalPushResult> {
  const { error } = await client.from('clinical_audit_logs').insert({
    therapist_id: row.therapistId,
    patient_id: row.patientId,
    entity_type: row.entityType,
    action: row.action,
    old_value: row.oldValue,
    new_value: row.newValue,
  });
  if (error) return clinicalPushFail(`clinical_audit_logs: ${error.message}`, error);
  return { ok: true };
}

export type UpsertPatientRecordsOptions = {
  /** When set (portal patient / RLS patient role), only this row is written to `patients`. */
  onlyPatientId?: string;
  /**
   * Supabase Auth UUID for the portal patient account just created by
   * {@link signUpPortalPatientOnCreate}.  When provided, it is written into
   * `patients.auth_user_id` immediately so the patient can access their data
   * via the portal without waiting for their first login to trigger
   * `link_patient_auth_user`.
   *
   * Only include a value here when the patients being upserted correspond to
   * this specific newly-created Auth user.  On subsequent saves (autosave,
   * full-sync) omit this option so existing `auth_user_id` values are never
   * accidentally overwritten.
   */
  authUserId?: string;
};

export async function upsertPatientRecords(
  client: SupabaseClient,
  patients: Patient[],
  now: string,
  options?: UpsertPatientRecordsOptions
): Promise<ClinicalPushResult> {
  try {
  const onlyId = options?.onlyPatientId?.trim();
  // auth_user_id to set at creation time (from signUpPortalPatientOnCreate).
  // Empty string means "not provided" — we won't include the column so we don't
  // accidentally clear an existing link.
  const newAuthUserId = options?.authUserId?.trim() || null;
  const source =
    onlyId && onlyId.length > 0 ? patients.filter((p) => p.id === onlyId) : patients;
  const skipAudit = Boolean(onlyId && onlyId.length > 0);
  const isPatientPortal = Boolean(onlyId && onlyId.length > 0);

  if (isSupabaseAuthEnabled()) {
    const guard = await ensureSupabaseSessionReady(client, {
      context: isPatientPortal ? 'שמירת מטופל (פורטל)' : 'שמירת מטופל (דשבורד מטפל)',
    });
    if (!guard.ok) {
      return { ok: false, message: `patients: ${guard.message}` };
    }
  }

  let therapistUser: User | null = null;
  if (isSupabaseAuthEnabled() && !isPatientPortal) {
    const {
      data: { user },
      error: userErr,
    } = await client.auth.getUser();
    if (userErr || !user?.id) {
      return { ok: false, message: 'patients: נדרש מטפל מחובר ל-Supabase לכתיבה' };
    }
    therapistUser = user;
  }

  let wroteAny = false;
  const syncedPatients: Patient[] = [];

  for (const p of source) {
    let therapistIdForRow = p.therapistId;
    let payloadForRow: Patient = p;

    if (therapistUser) {
      const resolved = resolveTherapistIdForSupabaseRls(p.therapistId, therapistUser);
      if (resolved === null) {
        therapistIdForRow = therapistUser.id;
        payloadForRow =
          p.therapistId === therapistUser.id ? p : { ...p, therapistId: therapistUser.id };
      } else {
        therapistIdForRow = resolved;
        payloadForRow = resolved === p.therapistId ? p : { ...p, therapistId: resolved };
      }
    }

    const { data: existing, error: fetchErr } = await client
      .from('patients')
      .select('payload, therapist_id, auth_user_id')
      .eq('id', p.id)
      .maybeSingle();

    if (fetchErr) {
      console.error('[SYNC_ERROR] upsertPatientRecords/select', fetchErr, { patientId: p.id });
      logSupabaseCallError('upsertPatientRecords/select', fetchErr, { patientId: p.id });
      return clinicalPushFail(`patients: ${fetchErr.message}`, fetchErr);
    }

    const oldPayload = existing?.payload != null ? (existing.payload as Patient) : undefined;

    /** patients.auth_user_id = portal patient's Auth id only — never the therapist's uid */

    const rawUsername = payloadForRow.portalUsername?.trim() ?? '';
    const contactEmail = rawUsername
      ? portalUsernameToAuthEmail(normalizePortalUsername(rawUsername))
      : '';

    const ageVal =
      typeof payloadForRow.age === 'number' && Number.isFinite(payloadForRow.age)
        ? Math.round(payloadForRow.age)
        : null;
    const birthRaw = payloadForRow.birthDate?.trim();
    const birthDateSql =
      birthRaw && /^\d{4}-\d{2}-\d{2}$/.test(birthRaw) ? birthRaw : null;
    const occupationSql = payloadForRow.occupation?.trim()
      ? payloadForRow.occupation.trim()
      : null;
    const demoFree =
      typeof payloadForRow.demographicsFreeText === 'string'
        ? payloadForRow.demographicsFreeText.trim()
        : '';
    const activeArea =
      payloadForRow.primaryBodyArea != null && `${payloadForRow.primaryBodyArea}`.trim() !== ''
        ? String(payloadForRow.primaryBodyArea)
        : null;

    const payloadDraft: Patient = {
      ...payloadForRow,
      therapistId: therapistIdForRow,
      name: (payloadForRow.name ?? '').trim() || payloadForRow.name,
      demographicsFreeText: demoFree.length > 0 ? demoFree : undefined,
      occupation: occupationSql ?? undefined,
      birthDate: birthDateSql ?? undefined,
      primaryBodyArea: payloadForRow.primaryBodyArea,
    };

    /** Merge with DB row so stale clients cannot zero out XP/coins (see {@link mergePatientPayloadForUpsert}). */
    const payloadForUpsert = mergePatientPayloadForUpsert(oldPayload, payloadDraft);
    const firstName = (payloadForUpsert.name ?? '').trim();

    const baseRow: Record<string, unknown> = {
      id: payloadForUpsert.id,
      therapist_id: therapistIdForRow,
      first_name: firstName,
      active_area: activeArea,
      demographics_free_text: demoFree.length > 0 ? demoFree : null,
      occupation: occupationSql,
      payload: payloadForUpsert,
      updated_at: now,
    };

    if (PATIENTS_UPSERT_FULL_DENORMALIZED) {
      baseRow.contact_email = contactEmail;
      baseRow.age = ageVal;
      baseRow.gender = payloadForRow.clinicalSex ?? null;
      baseRow.birth_date = birthDateSql;
      if (newAuthUserId) {
        baseRow.auth_user_id = newAuthUserId;
      }
    }

    const upsertRow = shallowStripUndefined(baseRow);

    console.log('[upsertPatientRecords] row preview', {
      id: upsertRow.id,
      therapist_id: upsertRow.therapist_id,
      original_therapistId: p.therapistId,
      therapist_id_repaired: p.therapistId !== therapistIdForRow,
      full_denormalized: PATIENTS_UPSERT_FULL_DENORMALIZED,
    });
    consoleTableBeforePatientsUpsert(upsertRow, `UPSERT patients id=${payloadForUpsert.id}`);

    const selectCols = PATIENTS_UPSERT_FULL_DENORMALIZED
      ? 'id, therapist_id, updated_at, first_name, age, gender, occupation, birth_date, demographics_free_text, active_area, contact_email, payload'
      : 'id, therapist_id, updated_at, first_name, active_area, demographics_free_text, occupation, payload';

    const { data: upserted, error } = await client
      .from('patients')
      .upsert([upsertRow], { onConflict: 'id' })
      .select(selectCols);
    if (error) {
      console.error('[SYNC_ERROR] upsertPatientRecords/upsert', {
        patientId: payloadForUpsert.id,
        therapist_id: therapistIdForRow,
        error_message: error.message,
        error_code: (error as { code?: string }).code,
        error_details: (error as { details?: string }).details,
        error,
      });
      logSupabaseCallError('upsertPatientRecords/upsert', error, {
        patientId: payloadForUpsert.id,
        therapist_id: therapistIdForRow,
      });
      return clinicalPushFail(`patients: ${error.message}`, error);
    }
    console.log('[upsertPatientRecords] upsert select() response', { upserted, error: null });

    for (const u of upserted ?? []) {
      const pl = (u as { payload?: unknown }).payload;
      if (
        pl &&
        typeof pl === 'object' &&
        'id' in pl &&
        typeof (pl as Patient).id === 'string'
      ) {
        syncedPatients.push(pl as Patient);
      }
    }

    wroteAny = true;

    if (skipAudit) continue;

    const audit =
      oldPayload === undefined
        ? await insertClinicalAuditLog(client, {
            therapistId: therapistIdForRow,
            patientId: p.id,
            entityType: 'patient_info',
            action: 'create',
            oldValue: null,
            newValue: payloadForUpsert,
          })
        : await insertClinicalAuditLog(client, {
            therapistId: therapistIdForRow,
            patientId: p.id,
            entityType: 'patient_info',
            action: 'update',
            oldValue: oldPayload,
            newValue: payloadForUpsert,
          });
    if (!audit.ok) return audit;
  }

  if (therapistUser && source.length > 0 && !wroteAny) {
    return {
      ok: false,
      message:
        'patients: אין מטופלים שמשויכים למטפל המחובר (או שורות קיימות ב-DB עם therapist_id ישן — עדכן ב-SQL או מחק מקומית)',
    };
  }

  return { ok: true, syncedPatients };
  } catch (e) {
    console.error('[SYNC_ERROR] upsertPatientRecords/unexpected', e);
    logSupabaseCallError('upsertPatientRecords/unexpected', e);
    return {
      ok: false,
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

export type UpsertTreatmentReportOptions = Pick<UpsertPatientRecordsOptions, 'onlyPatientId'> & {
  now?: string;
};

/**
 * Persists treatment documentation and related clinical narrative fields on the patient row
 * (`patients.payload`, including `clinicalTimeline`). Prefer this after merging new timeline
 * entries into a {@link Patient} snapshot so the payload matches what the user just saved.
 */
export async function upsertTreatmentReport(
  client: SupabaseClient,
  patient: Patient,
  options?: UpsertTreatmentReportOptions
): Promise<ClinicalPushResult> {
  const now = options?.now ?? new Date().toISOString();
  const onlyPatientId = options?.onlyPatientId?.trim();
  return upsertPatientRecords(
    client,
    [patient],
    now,
    onlyPatientId ? { onlyPatientId } : undefined
  );
}

/**
 * Returns the IDs of patient rows that have a `portalUsername` in their payload
 * but no `auth_user_id` set — i.e. the portal account was created but the patient
 * has never signed in (or the Auth link was lost).
 *
 * The therapist dashboard can call this after loading patients and warn the user
 * that these patients cannot yet access the patient portal.
 *
 * NOTE: `auth_user_id` is only used for *patient* RLS (portal access).
 * Therapist saves (exercise plans, patient records) use `therapist_id` and are
 * NOT affected by null `auth_user_id`.
 */
export async function fetchUnlinkedPortalPatientIds(
  client: SupabaseClient
): Promise<{ patientIds: string[]; error?: string }> {
  const { data, error } = await client
    .from('patients')
    .select('id, payload, auth_user_id')
    .is('auth_user_id', null);

  if (error) {
    return { patientIds: [], error: error.message };
  }

  const unlinked: string[] = [];
  for (const row of data ?? []) {
    const payload = row.payload as { portalUsername?: string } | null;
    if (payload?.portalUsername?.trim()) {
      unlinked.push(row.id as string);
    }
  }

  if (unlinked.length > 0) {
    console.warn(
      '[fetchUnlinkedPortalPatientIds] מטופלים עם חשבון פורטל שלא התחברו מעולם (auth_user_id = NULL)',
      {
        count: unlinked.length,
        patientIds: unlinked,
        note: 'שמירות מטפל (exercise_plans, patients) אינן מושפעות. הגישה לפורטל המטופל תופעל רק לאחר כניסה ראשונה.',
      }
    );
  }

  return { patientIds: unlinked };
}

/** מחיקת שורת מטופל ב-Supabase (RLS — מטפל מחובר בלבד). מפעיל CASCADE למסדי תלות (תוכניות, היסטוריית סשנים, יומן ביקורת). חייב להצליח לפני ניקוי המצב המקומי. */
export async function deletePatientRowFromSupabase(
  client: SupabaseClient,
  patientId: string
): Promise<ClinicalPushResult> {
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser();
  if (userErr || !user?.id) {
    return { ok: false, message: 'patients delete: נדרש מטפל מחובר ל-Supabase' };
  }

  // Filter by therapist_id (TEXT column, matches auth.uid()::text — satisfies RLS) and
  // the app patient ID stored inside the payload JSONB. This avoids touching the `id`
  // primary-key column whose type (TEXT vs UUID) may differ between environments.
  const { error } = await client
    .from('patients')
    .delete()
    .eq('therapist_id', user.id)
    .filter('payload->>id', 'eq', patientId)
    .select('therapist_id');

  if (error) {
    return { ok: false, message: `patients delete: ${error.message}` };
  }
  // If data is empty the row was already gone — treat as success.
  return { ok: true };
}

function logExercisePlansSupabaseError(
  scope: string,
  err: unknown,
  context?: Record<string, unknown>
) {
  const p = err as (PostgrestError & { status?: number; statusText?: string }) | undefined;
  console.error(`[upsertExercisePlans] ${scope}`, {
    message: p?.message ?? (err instanceof Error ? err.message : String(err)),
    code: p?.code,
    status: p?.status,
    statusText: p?.statusText,
    details: p?.details,
    hint: p?.hint,
    ...context,
  });
}

/**
 * Logs the exact object being sent to a Supabase `.upsert()` / `.insert()` call so that
 * snake_case column names, nulls, and missing fields are immediately visible in DevTools.
 *
 * `exercises` / `payload` JSONB arrays are replaced with `"[N items]"` to keep the output
 * short; every other field is shown verbatim.
 */
function logUpsertPayload(
  label: string,
  payload: Record<string, unknown>,
  extra?: Record<string, unknown>
): void {
  const display: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    display[k] = Array.isArray(v) ? `[${(v as unknown[]).length} items]` : v;
  }
  console.group(`[upsertExercisePlans] ▶ ${label}`);
  console.log('EXACT PAYLOAD KEYS:', Object.keys(payload).join(', '));
  console.log('EXACT PAYLOAD:', display);
  if (extra) console.log('CONTEXT:', extra);
  console.groupEnd();
}

function isUniqueOrConflictPostgrest(
  err: { code?: string; message?: string },
  httpStatus?: number
): boolean {
  if (err.code === '23505') return true;
  if (httpStatus === 409) return true;
  const m = (err.message ?? '').toLowerCase();
  return m.includes('duplicate') || m.includes('unique') || m.includes('conflict');
}

async function deactivateAllActiveExercisePlansForPatient(
  client: SupabaseClient,
  patientId: string
): Promise<ClinicalPushResult> {
  const { error } = await client
    .from('exercise_plans')
    .update({ is_active: false })
    .eq('patient_id', patientId)
    .eq('is_active', true);
  if (error) {
    return clinicalPushFail(`exercise_plans: deactivate active plans: ${error.message}`, error);
  }
  return { ok: true };
}

type InsertActivePlanVersionArgs = {
  patientId: string;
  exercises: PatientExercise[];
  now: string;
  versionNumber: number;
  parentPlanId: string | null;
  changeSummary: string | null;
  therapistId: string;
  authUid: string;
  rowTherapistId: string | null;
  logLabel: string;
};

/**
 * Inserts a new exercise plan row with a **fresh** {@link crypto.randomUUID} on each attempt.
 * Clears active rows for the patient first so at most one `is_active=true` plan remains app-wide;
 * retries on primary-key / unique violations (e.g. duplicate `id`) or transient conflicts.
 */
async function insertNewActiveExercisePlanVersion(
  client: SupabaseClient,
  args: InsertActivePlanVersionArgs
): Promise<ClinicalPushResult> {
  const maxAttempts = 3;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const deact = await deactivateAllActiveExercisePlansForPatient(client, args.patientId);
    if (!deact.ok) return deact;

    const newId = crypto.randomUUID();
    const insertPayload = {
      id: newId,
      patient_id: args.patientId,
      exercises: args.exercises,
      updated_at: args.now,
      version_number: args.versionNumber,
      is_active: true,
      parent_plan_id: args.parentPlanId,
      change_summary: args.changeSummary,
    };

    if (!insertPayload.patient_id || !args.authUid) {
      console.warn('[upsertExercisePlans] ⚠ חסר patient_id או auth_uid לפני insert', {
        patient_id: insertPayload.patient_id,
        auth_uid: args.authUid,
      });
    }

    logUpsertPayload(args.logLabel, insertPayload as unknown as Record<string, unknown>, {
      auth_uid: args.authUid,
      row_therapist_id: args.rowTherapistId,
      rls_will_pass: args.rowTherapistId === args.authUid,
      note: 'insert after clearing all is_active=true for patient_id',
    });
    consoleTableExercisePlanRow(args.logLabel, insertPayload as unknown as Record<string, unknown>);

    const { data: insData, error: insErr } = await client
      .from('exercise_plans')
      .insert(insertPayload)
      .select('id');

    if (!insErr) {
      console.log('[upsertExercisePlans] insert OK', { data: insData, label: args.logLabel });
      return { ok: true };
    }

    const st = postgrestHttpStatus(insErr);
    if (isUniqueOrConflictPostgrest(insErr, st) && attempt < maxAttempts - 1) {
      logExercisePlansSupabaseError('ייחודיות / קונפליקט — ניסיון חוזר', insErr, {
        patientId: args.patientId,
        attempt: attempt + 1,
      });
      await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
      continue;
    }

    logExercisePlansSupabaseError('שגיאת insert ל-exercise_plans', insErr, {
      patient_id: args.patientId,
      auth_uid: args.authUid,
      new_row_id: newId,
    });
    return clinicalPushFail(`exercise_plans: ${insErr.message}`, insErr);
  }
  return {
    ok: false,
    message:
      'exercise_plans: לא ניתן לשמור תוכנית פעילה לאחר ניסיונות חוזרים (קונפליקט ייחודיות)',
  };
}

/**
 * Syncs a single patient's exercise plan using the same versioning flow as {@link upsertExercisePlans}.
 * (A legacy `.upsert({ onConflict: 'patient_id' })` path is invalid once multiple `exercise_plans`
 * rows exist per patient — it causes PostgREST 409 / constraint conflicts.)
 */
export async function upsertExercisePlan(
  client: SupabaseClient,
  patientId: string,
  exercises: PatientExercise[],
  options?: { changeSummary?: string | null; now?: string }
): Promise<ClinicalPushResult> {
  try {
    const trimmedPid = typeof patientId === 'string' ? patientId.trim() : '';
    if (!trimmedPid) {
      return { ok: false, message: 'exercise_plans: patientId חסר או לא תקין' };
    }
    const now = options?.now ?? new Date().toISOString();
    const cs = options?.changeSummary?.trim();
    return await upsertExercisePlans(
      client,
      [{ patientId: trimmedPid, exercises }],
      now,
      cs ? { changeSummaryByPatientId: { [trimmedPid]: cs } } : undefined
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[upsertExercisePlan] שגיאה בלתי צפויה', msg, e);
    return { ok: false, message: `exercise_plans: ${msg}` };
  }
}

export type UpsertExercisePlansOptions = {
  /** Optional per-patient note stored on the new version row when content changes. */
  changeSummaryByPatientId?: Record<string, string>;
};

/**
 * Syncs exercise plans to Supabase with versioning: each push deactivates the active row and inserts
 * a new version (even when the exercise JSON is unchanged), so every explicit save sends a full write.
 * Writes {@link clinical_audit_logs} when the plan body changes or a plan is first created.
 */
export async function upsertExercisePlans(
  client: SupabaseClient,
  exercisePlans: ExercisePlan[],
  now: string,
  options?: UpsertExercisePlansOptions
): Promise<ClinicalPushResult> {
  try {
    // ── Resolve auth user once for the entire batch ──────────────────────────
    // The exercise_plans RLS INSERT/UPDATE policy checks:
    //   patients.therapist_id = auth.uid()::text
    // so we must know auth.uid() upfront to detect mismatches before writing.
    const {
      data: { user: authUser },
      error: authErr,
    } = await client.auth.getUser();

    if (authErr || !authUser?.id) {
      console.error('[upsertExercisePlans] אין משתמש מחובר — לא ניתן לכתוב ל-exercise_plans', {
        authErr,
      });
      return {
        ok: false,
        message: 'exercise_plans: נדרש מטפל מחובר ל-Supabase לכתיבה (auth.uid() חסר)',
      };
    }
    const authUid = authUser.id;

    const changeSummaryByPatientId = options?.changeSummaryByPatientId ?? {};

    for (const plan of exercisePlans) {
      const { patientId: rawPatientId, exercises } = plan;

      // ── Validate patient_id ──────────────────────────────────────────────
      if (typeof rawPatientId !== 'string' || !rawPatientId.trim()) {
        console.error('[upsertExercisePlans] patient_id חסר או לא תקין', { rawPatientId });
        return { ok: false, message: 'exercise_plans: patient_id חסר או לא תקין' };
      }
      const patientId = rawPatientId.trim();
      const changeSummary =
        changeSummaryByPatientId[patientId] ??
        changeSummaryByPatientId[rawPatientId] ??
        null;

      // ── Resolve therapist_id from patients row ───────────────────────────
      // exercise_plans has no therapist_id column; RLS enforces access through
      // the FK: patients.therapist_id = auth.uid()::text.  We fetch it here so
      // we can (a) verify it matches auth.uid() — if not, the INSERT will be
      // silently blocked by RLS, and (b) populate the audit log.
      const { data: prow, error: pErr } = await client
        .from('patients')
        .select('therapist_id')
        .eq('id', patientId)
        .maybeSingle();

      if (pErr) {
        logExercisePlansSupabaseError('שגיאה בשליפת therapist_id מ-patients', pErr, {
          patientId,
          auth_uid: authUid,
        });
        return clinicalPushFail(`patients: ${pErr.message}`, pErr);
      }

      // The therapist_id value we'll use for the audit log.
      // Always prefer auth.uid() — it's what RLS actually checks against.
      const rowTherapistId = (prow?.therapist_id as string | null | undefined) ?? null;
      const therapistId = authUid;

      if (!rowTherapistId) {
        // Patient row not visible via RLS (may not exist yet, or therapist_id is stale).
        // We'll still try the exercise_plans write; it will succeed only if the patients
        // row on the DB side already has therapist_id = auth.uid().
        console.warn(
          '[upsertExercisePlans] patients.therapist_id לא נמצא — ייתכן שה-RLS יחסום את ה-INSERT',
          { patientId, auth_uid: authUid }
        );
      } else if (rowTherapistId !== authUid) {
        // Mismatch: the stored therapist_id is different from the current JWT.
        // The RLS policy will block the INSERT with a silent 0-rows result or 403.
        console.warn(
          '[upsertExercisePlans] patients.therapist_id אינו תואם ל-auth.uid() — RLS ייחסום את הכתיבה',
          { patientId, row_therapist_id: rowTherapistId, auth_uid: authUid }
        );
      }

      console.log('[upsertExercisePlans] שולח תוכנית לענן', {
        patient_id: patientId,
        therapist_id_auth_uid: authUid,
        row_therapist_id: rowTherapistId,
        rls_will_pass: rowTherapistId === authUid,
        exerciseCount: exercises.length,
        is_active: true,
        changeSummary,
        now,
      });

      // ── Fetch current active row ─────────────────────────────────────────
      const { data: active, error: selErr } = await client
        .from('exercise_plans')
        .select('id, version_number, exercises')
        .eq('patient_id', patientId)
        .eq('is_active', true)
        .maybeSingle();

      if (selErr) {
        logExercisePlansSupabaseError('שגיאה בשליפת תוכנית פעילה', selErr, {
          patientId,
          auth_uid: authUid,
        });
        return clinicalPushFail(`exercise_plans: ${selErr.message}`, selErr);
      }

      // Previous active row (for version chain + audit). Re-fetch if a concurrent tab
      // inserted an active row between our first select and here.
      let prevActive = active as { id: string; version_number: number; exercises: unknown } | null;
      if (!prevActive) {
        const { data: recheck } = await client
          .from('exercise_plans')
          .select('id, version_number, exercises')
          .eq('patient_id', patientId)
          .eq('is_active', true)
          .maybeSingle();
        if (recheck) {
          prevActive = recheck as { id: string; version_number: number; exercises: unknown };
        }
      }

      const hadPrev = prevActive != null;
      const nextVersion = hadPrev ? (prevActive!.version_number ?? 1) + 1 : 1;
      const parentPlanId = hadPrev ? prevActive!.id : null;
      const logLabel = hadPrev ? 'exercise_plans INSERT (new version)' : 'exercise_plans INSERT (v1)';

      const ins = await insertNewActiveExercisePlanVersion(client, {
        patientId,
        exercises,
        now,
        versionNumber: nextVersion,
        parentPlanId,
        changeSummary,
        therapistId,
        authUid,
        rowTherapistId,
        logLabel,
      });
      if (!ins.ok) return ins;

      if (!hadPrev) {
        const audit = await insertClinicalAuditLog(client, {
          therapistId,
          patientId,
          entityType: 'plan',
          action: 'create',
          oldValue: null,
          newValue: { exercises },
        });
        if (!audit.ok) return audit;
      } else {
        const audit = await insertClinicalAuditLog(client, {
          therapistId,
          patientId,
          entityType: 'plan',
          action: 'update',
          oldValue: { exercises: prevActive!.exercises },
          newValue: { exercises },
        });
        if (!audit.ok) return audit;
      }
    }

    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[upsertExercisePlans] שגיאה בלתי צפויה', msg, e);
    return { ok: false, message: `exercise_plans: ${msg}` };
  }
}

export async function fetchClinicalAuditLogsForPatient(
  client: SupabaseClient,
  patientId: string,
  limit = 80
): Promise<ClinicalAuditLogRow[] | null> {
  const { data, error } = await client
    .from('clinical_audit_logs')
    .select('id, therapist_id, patient_id, entity_type, action, old_value, new_value, created_at')
    .eq('patient_id', patientId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) return null;
  return (data ?? []) as ClinicalAuditLogRow[];
}

export type FetchPatientPayloadsForTherapistResult =
  | { ok: true; patients: Patient[] }
  | { ok: false; message: string };

/**
 * Loads `patients.payload` rows visible to the current JWT (RLS: therapist_id = auth.uid()).
 * תרגילי תוכנית פעילה אינם ב־payload — משיגים באמצעות {@link fetchActiveExercisePlansForPatientIds}
 * או {@link fetchPatients}.
 */
export async function fetchPatientPayloadsForTherapist(
  client: SupabaseClient
): Promise<FetchPatientPayloadsForTherapistResult> {
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser();
  if (userErr || !user?.id) {
    return { ok: false, message: userErr?.message ?? 'אין משתמש מחובר' };
  }

  // Defence-in-depth: filter by therapist_id in addition to relying on RLS,
  // so a misconfigured RLS policy cannot return another therapist's patients.
  const { data, error } = await client
    .from('patients')
    .select('payload')
    .eq('therapist_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    if (import.meta.env.DEV) {
      console.warn('[fetchPatientPayloadsForTherapist]', error.message);
    }
    return { ok: false, message: error.message };
  }

  const out: Patient[] = [];
  for (const row of data ?? []) {
    const payload = (row as { payload?: unknown }).payload;
    if (
      payload &&
      typeof payload === 'object' &&
      'id' in payload &&
      typeof (payload as Patient).id === 'string'
    ) {
      out.push(payload as Patient);
    }
  }
  return { ok: true, patients: out };
}

export type FetchActiveExercisePlansResult =
  | { ok: true; exercisePlans: ExercisePlan[] }
  | { ok: false; message: string };

/**
 * Fetches exercise plans for the given patient IDs from `exercise_plans`.
 * With a UNIQUE constraint on `patient_id` there is exactly one row per patient,
 * so the `is_active` filter is omitted to avoid hiding rows where the column was
 * never set or defaulted to false.
 */
export async function fetchActiveExercisePlansForPatientIds(
  client: SupabaseClient,
  patientIds: string[]
): Promise<FetchActiveExercisePlansResult> {
  const ids = [...new Set(patientIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) {
    return { ok: true, exercisePlans: [] };
  }

  const { data, error } = await client
    .from('exercise_plans')
    .select('patient_id, exercises')
    .in('patient_id', ids);

  console.log('[fetchActiveExercisePlansForPatientIds] raw Supabase response', {
    patientIds: ids,
    rowCount: data?.length ?? 0,
    data,
    error,
  });

  if (error) {
    return { ok: false, message: `exercise_plans: ${error.message}` };
  }

  const exercisePlans: ExercisePlan[] = (data ?? []).map((row) => ({
    patientId: row.patient_id as string,
    exercises: Array.isArray(row.exercises)
      ? (row.exercises as PatientExercise[])
      : ([] as PatientExercise[]),
  }));
  return { ok: true, exercisePlans };
}

export type FetchActiveExercisePlanForPatientResult =
  | { ok: true; exercisePlan: ExercisePlan | null }
  | { ok: false; message: string };

export async function fetchActiveExercisePlanForPatient(
  client: SupabaseClient,
  patientId: string
): Promise<FetchActiveExercisePlanForPatientResult> {
  const id = patientId.trim();
  if (!id) {
    return { ok: true, exercisePlan: null };
  }

  // With versioned `exercise_plans`, multiple rows per `patient_id` are possible until legacy
  // data is cleaned up. Never use `.single()` / `.maybeSingle()` here — PostgREST errors when
  // more than one row matches. Pick the newest row by version_number, then updated_at.
  const { data, error } = await client
    .from('exercise_plans')
    .select('id, patient_id, exercises, version_number, updated_at, is_active')
    .eq('patient_id', id)
    .order('version_number', { ascending: false })
    .order('updated_at', { ascending: false });

  console.log('[fetchActiveExercisePlanForPatient] raw Supabase response', {
    patientId: id,
    rowCount: data?.length ?? 0,
    error,
  });

  if (error) {
    return { ok: false, message: `exercise_plans: ${error.message}` };
  }

  const rows = data ?? [];
  if (rows.length > 1) {
    console.warn(
      '[fetchActiveExercisePlanForPatient] multiple exercise_plans rows for patient_id — using first after sort (newest version)',
      {
        patientId: id,
        rowCount: rows.length,
        pickedVersion: rows[0]?.version_number,
        pickedId: rows[0]?.id,
      }
    );
  }

  const row = rows[0];
  if (!row) {
    return { ok: true, exercisePlan: null };
  }

  const exercises = Array.isArray(row.exercises)
    ? (row.exercises as PatientExercise[])
    : ([] as PatientExercise[]);

  return {
    ok: true,
    exercisePlan: {
      patientId: row.patient_id as string,
      exercises,
      planRowId: row.id as string,
      versionNumber: typeof row.version_number === 'number' ? row.version_number : undefined,
      isActive: row.is_active === true ? true : row.is_active === false ? false : undefined,
    },
  };
}

export type FetchPatientsResult =
  | { ok: true; patients: Patient[]; exercisePlans: ExercisePlan[] }
  | { ok: false; message: string };

/**
 * טעינת מטופלים + התוכנית הפעילה לכל אחד (מ־`exercise_plans`), לסנכרון מלא בעת כניסה.
 * מתאים לגרסת API שנקראית `fetchPatients` — לעומת `fetchPatientPayloadsForTherapist` שמטעינה את ה־payload בלבד.
 */
export async function fetchPatients(client: SupabaseClient): Promise<FetchPatientsResult> {
  const base = await fetchPatientPayloadsForTherapist(client);
  if (!base.ok) return base;

  const plans = await fetchActiveExercisePlansForPatientIds(
    client,
    base.patients.map((p) => p.id)
  );
  if (!plans.ok) return plans;

  return {
    ok: true,
    patients: base.patients,
    exercisePlans: plans.exercisePlans,
  };
}

export type GetPatientByIdResult =
  | { ok: true; patient: Patient; exercisePlan: ExercisePlan | null }
  | { ok: false; message: string };

/**
 * משיג שורת `patients` (payload מלא) + תוכנית תרגול פעילה לפי `patient_id`.
 *
 * כאשר ה-JWT של המטופל אינו מכוסה על-ידי מדיניות ה-RLS של `exercise_plans`
 * (מדיניות ברירת מחדל מגבילה לגישת מטפל בלבד), השאילתה מחזירה null.
 * במקרה זה משתמשים ב-`_exercisePlanCache` מתוך `patients.payload` —
 * שדה שהמטפל מעדכן בכל שמירה ושהמטופל תמיד רשאי לקרוא.
 */
export async function getPatientById(
  client: SupabaseClient,
  patientId: string
): Promise<GetPatientByIdResult> {
  const id = patientId.trim();
  if (!id) {
    return { ok: false, message: 'getPatientById: missing patient id' };
  }

  const [rowResult, activePlanResult] = await Promise.all([
    client.from('patients').select('payload').eq('id', id).maybeSingle(),
    fetchActiveExercisePlanForPatient(client, id),
  ]);

  const { data, error } = rowResult;

  console.log('[getPatientById] patients row result', {
    patientId: id,
    hasData: !!data,
    error: error ?? null,
  });

  if (error) {
    return { ok: false, message: `patients: ${error.message}` };
  }
  const payload = (data as { payload?: unknown } | null)?.payload;
  if (
    !payload ||
    typeof payload !== 'object' ||
    !('id' in payload) ||
    typeof (payload as Patient).id !== 'string'
  ) {
    console.warn('[getPatientById] patients payload חסר או לא תקין', {
      patientId: id,
      hasData: !!data,
      payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload) : [],
    });
    return { ok: false, message: 'patients: missing or invalid payload' };
  }

  if (!activePlanResult.ok) {
    return { ok: false, message: activePlanResult.message };
  }

  let exercisePlan = activePlanResult.exercisePlan;

  // Fallback: if exercise_plans returned nothing (RLS blocks patient JWT),
  // use the cached copy stored inside patients.payload by the therapist on last save.
  if (!exercisePlan) {
    const cached = (payload as Patient)._exercisePlanCache;
    if (Array.isArray(cached) && cached.length > 0) {
      console.log('[getPatientById] exercise_plans ריק — משתמש ב-_exercisePlanCache מ-patients.payload', {
        patientId: id,
        cachedCount: cached.length,
      });
      exercisePlan = { patientId: id, exercises: cached as PatientExercise[] };
    } else {
      console.warn('[getPatientById] exercise_plans ריק וגם אין _exercisePlanCache — ייתכן שה-RLS חוסם את המטופל מטבלת exercise_plans', {
        patientId: id,
      });
    }
  }

  return {
    ok: true,
    patient: payload as Patient,
    exercisePlan,
  };
}

/**
 * מעלה לענן את רשימת התרגילים הפעילה של מטופל.
 * מאציל ל-{@link upsertExercisePlan} שמטפל באימות מטפל ו-upsert על-פי `patient_id`.
 */
export async function updatePatientExercises(
  client: SupabaseClient,
  patientId: string,
  updatedExercises: PatientExercise[],
  now?: string,
  options?: { changeSummary?: string | null }
): Promise<ClinicalPushResult> {
  return upsertExercisePlan(client, patientId, updatedExercises, {
    changeSummary: options?.changeSummary,
    now,
  });
}
