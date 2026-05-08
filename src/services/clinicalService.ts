import type { PostgrestError, SupabaseClient, User } from '@supabase/supabase-js';
import type { ExercisePlan, Patient, PatientExercise, Therapist } from '../types';
import {
  isSupabaseAuthEnabled,
  normalizePortalUsername,
  portalUsernameToAuthEmail,
} from '../lib/patientPortalAuth';

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

export type ClinicalPushResult = { ok: true } | { ok: false; message: string };

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
    if (error) return { ok: false, message: `profiles: ${error.message}` };
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
  if (error) return { ok: false, message: `clinical_audit_logs: ${error.message}` };
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
  const onlyId = options?.onlyPatientId?.trim();
  // auth_user_id to set at creation time (from signUpPortalPatientOnCreate).
  // Empty string means "not provided" — we won't include the column so we don't
  // accidentally clear an existing link.
  const newAuthUserId = options?.authUserId?.trim() || null;
  const source =
    onlyId && onlyId.length > 0 ? patients.filter((p) => p.id === onlyId) : patients;
  const skipAudit = Boolean(onlyId && onlyId.length > 0);
  const isPatientPortal = Boolean(onlyId && onlyId.length > 0);

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

  for (const p of source) {
    let therapistIdForRow = p.therapistId;
    let payloadForRow: Patient = p;

    if (therapistUser) {
      const resolved = resolveTherapistIdForSupabaseRls(p.therapistId, therapistUser);
      if (resolved === null) {
        continue;
      }
      therapistIdForRow = resolved;
      payloadForRow = resolved === p.therapistId ? p : { ...p, therapistId: resolved };
    }

    const { data: existing, error: fetchErr } = await client
      .from('patients')
      .select('payload')
      .eq('id', p.id)
      .maybeSingle();

    if (fetchErr) return { ok: false, message: `patients: ${fetchErr.message}` };

    const oldPayload = existing?.payload != null ? (existing.payload as Patient) : undefined;

    const rawUsername = payloadForRow.portalUsername?.trim() ?? '';
    const contactEmail = rawUsername
      ? portalUsernameToAuthEmail(normalizePortalUsername(rawUsername))
      : '';

    // Denormalised SQL columns (snake_case) — mirrored from `payload` for reporting / Table Editor.
    // Canonical clinical document stays in `payload` (Patient JSON).
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
    const baseRow: Record<string, unknown> = {
      id: payloadForRow.id,
      therapist_id: therapistIdForRow,
      contact_email: contactEmail,
      first_name: payloadForRow.name ?? '',
      age: ageVal,
      gender: payloadForRow.clinicalSex ?? null,
      birth_date: birthDateSql,
      occupation: occupationSql,
      demographics_free_text: demoFree || null,
      payload: payloadForRow,
      updated_at: now,
    };

    // Only include auth_user_id when a valid UUID was provided by the caller.
    // Omitting it on subsequent saves leaves any existing link intact.
    if (newAuthUserId) {
      baseRow.auth_user_id = newAuthUserId;
    }

    // ── Pre-upsert diagnostic log ────────────────────────────────────────────
    // Confirms therapist_id mapping and auth_user_id status for every patient row.
    console.log('[upsertPatientRecords] upsert patients row', {
      id: baseRow.id,
      therapist_id: baseRow.therapist_id,
      original_therapistId: p.therapistId,
      therapist_id_remapped: p.therapistId !== therapistIdForRow,
      auth_user_id: newAuthUserId || '(not set — preserving existing or will link on first portal login)',
      contact_email: baseRow.contact_email || '(no portal username)',
      first_name: baseRow.first_name,
      age: baseRow.age,
      gender: baseRow.gender,
      clinicalTimeline_len: Array.isArray(payloadForRow.clinicalTimeline)
        ? payloadForRow.clinicalTimeline.length
        : 0,
      demographicsFreeText_len: (payloadForRow.demographicsFreeText ?? '').length,
      demographics_free_text_sql: demoFree ? `${demoFree.slice(0, 120)}${demoFree.length > 120 ? '…' : ''}` : null,
    });

    // Full row as sent to PostgREST (large — includes entire `payload` JSON).
    try {
      console.log('[upsertPatientRecords] FULL_ROW_JSON', JSON.stringify(baseRow));
    } catch (e) {
      console.warn('[upsertPatientRecords] FULL_ROW_JSON stringify failed', e);
    }

    const { data: upserted, error } = await client
      .from('patients')
      .upsert([baseRow], { onConflict: 'id' })
      .select(
        'id, therapist_id, updated_at, first_name, age, gender, occupation, birth_date, demographics_free_text'
      );
    if (error) {
      console.error('[upsertPatientRecords] upsert failed', {
        patientId: payloadForRow.id,
        therapist_id: therapistIdForRow,
        error_message: error.message,
        error_code: (error as { code?: string }).code,
        error_details: (error as { details?: string }).details,
      });
      return { ok: false, message: `patients: ${error.message}` };
    }
    console.log('[upsertPatientRecords] upsert select() response', { upserted, error: null });

    wroteAny = true;

    if (skipAudit) continue;

    const unchanged =
      oldPayload !== undefined && patientPayloadJsonEqual(oldPayload, payloadForRow);
    if (unchanged) continue;

    const audit =
      oldPayload === undefined
        ? await insertClinicalAuditLog(client, {
            therapistId: therapistIdForRow,
            patientId: p.id,
            entityType: 'patient_info',
            action: 'create',
            oldValue: null,
            newValue: payloadForRow,
          })
        : await insertClinicalAuditLog(client, {
            therapistId: therapistIdForRow,
            patientId: p.id,
            entityType: 'patient_info',
            action: 'update',
            oldValue: oldPayload,
            newValue: payloadForRow,
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

  return { ok: true };
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

/**
 * Recursively sorts all object keys so that field-insertion-order differences
 * (e.g. React state vs Supabase JSONB round-trip) are invisible to the comparison.
 * Array order is preserved — exercise sequence is meaningful.
 */
function canonicalise(v: unknown): unknown {
  // Round-trip strips `undefined` values and aligns numeric representations,
  // matching what Supabase does when it serialises JSONB back to JS.
  const parsed: unknown = JSON.parse(JSON.stringify(v));
  const sort = (x: unknown): unknown => {
    if (Array.isArray(x)) return (x as unknown[]).map(sort);
    if (x !== null && typeof x === 'object') {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(x as object).sort()) {
        out[k] = sort((x as Record<string, unknown>)[k]);
      }
      return out;
    }
    return x;
  };
  return sort(parsed);
}

function exercisesJsonEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(canonicalise(a)) === JSON.stringify(canonicalise(b));
  } catch {
    // On any serialisation error treat as not-equal so a new version is written.
    return false;
  }
}

function patientPayloadJsonEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(canonicalise(a)) === JSON.stringify(canonicalise(b));
  } catch {
    return false;
  }
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
 * Syncs exercise plans to Supabase with versioning: updates create a new row, increment
 * version_number, link parent_plan_id, and set the previous active row to is_active = false.
 * Unchanged exercises vs the current active row only refresh updated_at.
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
        return { ok: false, message: `patients: ${pErr.message}` };
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
        return { ok: false, message: `exercise_plans: ${selErr.message}` };
      }

      if (!active) {
        // Guard against a concurrent insert that beat us here (unique constraint: one active per patient).
        const { data: recheck } = await client
          .from('exercise_plans')
          .select('id, version_number, exercises')
          .eq('patient_id', patientId)
          .eq('is_active', true)
          .maybeSingle();

        if (recheck) {
          // A concurrent save already created the active row — treat as an update path.
          const recheckRow = recheck as { id: string; version_number: number; exercises: unknown };
          if (exercisesJsonEqual(recheckRow.exercises, exercises)) {
            const touchPayload = { updated_at: now };
            console.log('[upsertExercisePlans] ✓ no content change (recheck) — touching updated_at only', {
              row_id: recheckRow.id,
              patient_id: patientId,
              auth_uid: authUid,
              db_exercise_count: Array.isArray(recheckRow.exercises) ? (recheckRow.exercises as unknown[]).length : '?',
              incoming_exercise_count: exercises.length,
              db_canonical_sample: JSON.stringify(canonicalise(
                Array.isArray(recheckRow.exercises) ? (recheckRow.exercises as unknown[])[0] : null
              )),
              incoming_canonical_sample: JSON.stringify(canonicalise(exercises[0] ?? null)),
            });
            const { data: touchData, error: touchErr } = await client
              .from('exercise_plans')
              .update(touchPayload)
              .eq('id', recheckRow.id)
              .select('id');
            console.log('[upsertExercisePlans] touch updated_at response', {
              data: touchData,
              error: touchErr ?? null,
            });
            if (touchErr) {
              logExercisePlansSupabaseError('שגיאה בעדכון updated_at (recheck)', touchErr, {
                patientId,
                rowId: recheckRow.id,
              });
              return { ok: false, message: `exercise_plans: ${touchErr.message}` };
            }
            continue;
          }
          console.log('[upsertExercisePlans] deactivating recheck row', {
            row_id: recheckRow.id,
            patient_id: patientId,
            auth_uid: authUid,
          });
          const { data: deactRecheckData, error: deactRecheck } = await client
            .from('exercise_plans')
            .update({ is_active: false })
            .eq('id', recheckRow.id)
            .select('id');
          console.log('[upsertExercisePlans] deactivate recheck response', {
            data: deactRecheckData,
            error: deactRecheck ?? null,
          });
          if (deactRecheck) {
            logExercisePlansSupabaseError('שגיאה בביטול is_active של שורה ישנה', deactRecheck, {
              patientId,
              rowId: recheckRow.id,
            });
            return { ok: false, message: `exercise_plans: ${deactRecheck.message}` };
          }
        }

        const newId = crypto.randomUUID();
        const newVersionNumber = (recheck as { version_number?: number } | null)?.version_number
          ? ((recheck as { version_number: number }).version_number + 1)
          : 1;

        const insertPayload = {
          id: newId,
          patient_id: patientId,
          exercises,
          updated_at: now,
          version_number: newVersionNumber,
          is_active: true,
          parent_plan_id: (recheck as { id?: string } | null)?.id ?? null,
          change_summary: changeSummary,
        };

        // ── Pre-upsert guard + full payload log (new plan) ───────────────
        if (!insertPayload.patient_id || !authUid) {
          console.warn('[upsertExercisePlans] ⚠ שדה חובה חסר לפני upsert (גרסה ראשונה)', {
            patient_id: insertPayload.patient_id || '⚠ MISSING',
            auth_uid: authUid || '⚠ MISSING',
          });
        }
        // NOTE: exercise_plans has NO therapist_id column.
        // RLS checks patients.therapist_id = auth.uid() via the FK on patient_id.
        logUpsertPayload('exercise_plans INSERT (v1)', insertPayload as unknown as Record<string, unknown>, {
          auth_uid: authUid,
          row_therapist_id: rowTherapistId,
          rls_will_pass: rowTherapistId === authUid,
          note: 'exercise_plans has no therapist_id column — RLS uses patients.therapist_id',
        });

        const { data: insData, error: insErr } = await client
          .from('exercise_plans')
          .upsert(insertPayload, { onConflict: 'id' })
          .select('id');
        console.log('[upsertExercisePlans] upsert response (גרסה ראשונה)', {
          data: insData,
          error: insErr ?? null,
        });
        if (insErr) {
          if (insErr.code === '23505') continue; // concurrent write won; non-fatal
          logExercisePlansSupabaseError('שגיאת upsert ל-exercise_plans (גרסה ראשונה)', insErr, {
            patient_id: patientId,
            auth_uid: authUid,
            new_row_id: newId,
            rls_note:
              rowTherapistId !== authUid
                ? `patients.therapist_id (${rowTherapistId ?? 'null'}) ≠ auth.uid() (${authUid})`
                : 'therapist_id תואם',
          });
          return { ok: false, message: `exercise_plans: ${insErr.message}` };
        }

        const audit = await insertClinicalAuditLog(client, {
          therapistId,
          patientId,
          entityType: 'plan',
          action: 'create',
          oldValue: null,
          newValue: { exercises },
        });
        if (!audit.ok) return audit;
        continue;
      }

      // ── Active row exists — check for content change ─────────────────────
      const row = active as { id: string; version_number: number; exercises: unknown };

      if (exercisesJsonEqual(row.exercises, exercises)) {
        const touchPayload = { updated_at: now };
        console.log('[upsertExercisePlans] ✓ no content change — touching updated_at only', {
          row_id: row.id,
          patient_id: patientId,
          auth_uid: authUid,
          db_exercise_count: Array.isArray(row.exercises) ? (row.exercises as unknown[]).length : '?',
          incoming_exercise_count: exercises.length,
          db_canonical_sample: JSON.stringify(canonicalise(
            Array.isArray(row.exercises) ? (row.exercises as unknown[])[0] : null
          )),
          incoming_canonical_sample: JSON.stringify(canonicalise(exercises[0] ?? null)),
        });
        const { data: touchData, error: touchErr } = await client
          .from('exercise_plans')
          .update(touchPayload)
          .eq('id', row.id)
          .select('id');
        console.log('[upsertExercisePlans] touch updated_at response', {
          data: touchData,
          error: touchErr ?? null,
        });
        if (touchErr) {
          logExercisePlansSupabaseError('שגיאה בעדכון updated_at', touchErr, {
            patientId,
            rowId: row.id,
          });
          return { ok: false, message: `exercise_plans: ${touchErr.message}` };
        }
        continue;
      }

      // ── Deactivate old row ────────────────────────────────────────────────
      console.log('[upsertExercisePlans] deactivating active row', {
        row_id: row.id,
        patient_id: patientId,
        auth_uid: authUid,
      });
      const { data: deactData, error: deactErr } = await client
        .from('exercise_plans')
        .update({ is_active: false })
        .eq('id', row.id)
        .select('id');
      console.log('[upsertExercisePlans] deactivate response', {
        data: deactData,
        error: deactErr ?? null,
      });
      if (deactErr) {
        logExercisePlansSupabaseError('שגיאה בביטול is_active של תוכנית קיימת', deactErr, {
          patientId,
          rowId: row.id,
        });
        return { ok: false, message: `exercise_plans: ${deactErr.message}` };
      }

      const nextVersion = (row.version_number ?? 1) + 1;
      const newId = crypto.randomUUID();

      const updateInsertPayload = {
        id: newId,
        patient_id: patientId,
        exercises,
        updated_at: now,
        version_number: nextVersion,
        is_active: true,
        parent_plan_id: row.id,
        change_summary: changeSummary,
      };

      // ── Pre-upsert guard + full payload log (new version) ────────────────
      if (!updateInsertPayload.patient_id || !authUid) {
        console.warn('[upsertExercisePlans] ⚠ שדה חובה חסר לפני upsert (גרסה חדשה)', {
          patient_id: updateInsertPayload.patient_id || '⚠ MISSING',
          auth_uid: authUid || '⚠ MISSING',
        });
      }
      // NOTE: exercise_plans has NO therapist_id column.
      // RLS checks patients.therapist_id = auth.uid() via the FK on patient_id.
      logUpsertPayload('exercise_plans INSERT (new version)', updateInsertPayload as unknown as Record<string, unknown>, {
        auth_uid: authUid,
        row_therapist_id: rowTherapistId,
        rls_will_pass: rowTherapistId === authUid,
        note: 'exercise_plans has no therapist_id column — RLS uses patients.therapist_id',
      });

      const { data: insData, error: insErr } = await client
        .from('exercise_plans')
        .upsert(updateInsertPayload, { onConflict: 'id' })
        .select('id');
      console.log('[upsertExercisePlans] upsert response (גרסה חדשה)', {
        data: insData,
        error: insErr ?? null,
      });
      if (insErr) {
        if (insErr.code === '23505') {
          // Concurrent save also inserted an active row; reactivate the old one.
          await client
            .from('exercise_plans')
            .update({ is_active: true })
            .eq('id', row.id);
          continue;
        }
        logExercisePlansSupabaseError('שגיאת upsert גרסה חדשה ל-exercise_plans', insErr, {
          patient_id: patientId,
          auth_uid: authUid,
          new_row_id: newId,
          rls_note:
            rowTherapistId !== authUid
              ? `patients.therapist_id (${rowTherapistId ?? 'null'}) ≠ auth.uid() (${authUid})`
              : 'therapist_id תואם',
        });
        return { ok: false, message: `exercise_plans: ${insErr.message}` };
      }

      const audit = await insertClinicalAuditLog(client, {
        therapistId,
        patientId,
        entityType: 'plan',
        action: 'update',
        oldValue: { exercises: row.exercises },
        newValue: { exercises },
      });
      if (!audit.ok) return audit;
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

  // With a UNIQUE constraint on patient_id there is at most one row per patient.
  // The is_active filter is intentionally omitted: if the column was never set
  // (defaulted to false/null) the filter would hide the row even though data exists.
  const { data, error } = await client
    .from('exercise_plans')
    .select('patient_id, exercises')
    .eq('patient_id', id)
    .maybeSingle();

  console.log('[fetchActiveExercisePlanForPatient] raw Supabase response', {
    patientId: id,
    data,
    error,
  });

  if (error) {
    return { ok: false, message: `exercise_plans: ${error.message}` };
  }
  if (!data) {
    return { ok: true, exercisePlan: null };
  }

  const exercises = Array.isArray(data.exercises)
    ? (data.exercises as PatientExercise[])
    : ([] as PatientExercise[]);

  return {
    ok: true,
    exercisePlan: { patientId: data.patient_id as string, exercises },
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
