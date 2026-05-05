import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { ExercisePlan, Patient, PatientExercise, Therapist } from '../types';
import {
  isSupabaseAuthEnabled,
  normalizePortalUsername,
  portalUsernameToAuthEmail,
} from '../lib/patientPortalAuth';

/**
 * RLS requires `patients.therapist_id = auth.uid()::text`. Legacy data may use
 * `therapist-001` / `therapist-002`; map those to the signed-in user's real id.
 */
function resolveTherapistIdForSupabaseRls(patientTherapistId: string, user: User): string | null {
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
};

export async function upsertPatientRecords(
  client: SupabaseClient,
  patients: Patient[],
  now: string,
  options?: UpsertPatientRecordsOptions
): Promise<ClinicalPushResult> {
  const onlyId = options?.onlyPatientId?.trim();
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

    const patientRows = [
      {
        id: payloadForRow.id,
        therapist_id: therapistIdForRow,
        contact_email: contactEmail,
        payload: payloadForRow,
        updated_at: now,
      },
    ];

    const { error } = await client.from('patients').upsert(patientRows, { onConflict: 'id' });
    if (error) return { ok: false, message: `patients: ${error.message}` };

    wroteAny = true;

    if (skipAudit) continue;

    const unchanged =
      oldPayload !== undefined && JSON.stringify(oldPayload) === JSON.stringify(payloadForRow);
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

function exercisesJsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Upserts a single exercise plan for a patient using the UNIQUE constraint on `patient_id`.
 * Authenticates the therapist via `auth.getUser()` (required for RLS) and writes an audit log
 * entry when the exercises content changes.
 *
 * This replaces the versioning-based {@link upsertExercisePlans} for tables where
 * `exercise_plans.patient_id` carries a UNIQUE constraint (one row per patient).
 */
export async function upsertExercisePlan(
  client: SupabaseClient,
  patientId: string,
  exercises: PatientExercise[],
  options?: { changeSummary?: string | null; now?: string }
): Promise<ClinicalPushResult> {
  const now = options?.now ?? new Date().toISOString();
  const changeSummary = options?.changeSummary?.trim() ?? null;

  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser();
  if (userErr || !user?.id) {
    return { ok: false, message: 'exercise_plans: נדרש מטפל מחובר ל-Supabase לכתיבה' };
  }
  const therapistId = user.id;

  const { data: existing, error: fetchErr } = await client
    .from('exercise_plans')
    .select('exercises')
    .eq('patient_id', patientId)
    .maybeSingle();

  if (fetchErr) {
    return { ok: false, message: `exercise_plans: ${fetchErr.message}` };
  }

  const oldExercises = (existing as { exercises?: unknown } | null)?.exercises ?? null;

  const { error: upsertErr } = await client
    .from('exercise_plans')
    .upsert(
      {
        patient_id: patientId,
        exercises,
        is_active: true,
        updated_at: now,
        change_summary: changeSummary,
      },
      { onConflict: 'patient_id' }
    );

  if (upsertErr) {
    return { ok: false, message: `exercise_plans: ${upsertErr.message}` };
  }

  if (exercisesJsonEqual(oldExercises, exercises)) {
    return { ok: true };
  }

  const audit = await insertClinicalAuditLog(client, {
    therapistId,
    patientId,
    entityType: 'plan',
    action: oldExercises === null ? 'create' : 'update',
    oldValue: oldExercises !== null ? { exercises: oldExercises } : null,
    newValue: { exercises },
  });
  if (!audit.ok) return audit;

  return { ok: true };
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
  const changeSummaryByPatientId = options?.changeSummaryByPatientId ?? {};

  for (const plan of exercisePlans) {
    const { patientId, exercises } = plan;
    const changeSummary = changeSummaryByPatientId[patientId] ?? null;

    console.log('[upsertExercisePlans] שולח תוכנית לענן', {
      patientId,
      exerciseCount: exercises.length,
      is_active: true,
      changeSummary,
      now,
    });

    const { data: prow, error: pErr } = await client
      .from('patients')
      .select('therapist_id')
      .eq('id', patientId)
      .maybeSingle();

    if (pErr) {
      console.error('[upsertExercisePlans] שגיאה בשליפת therapist_id מ-patients', pErr, {
        patientId,
      });
      return { ok: false, message: `patients: ${pErr.message}` };
    }

    let therapistId = prow?.therapist_id as string | undefined;

    if (!therapistId) {
      // Patient row not visible — either it doesn't exist in Supabase yet or RLS blocked it
      // (e.g. patients.therapist_id still holds a legacy demo ID instead of auth.uid()).
      // Fall back to the current authenticated user so the audit log is still populated,
      // and still attempt the exercise_plans INSERT — RLS will accept it if the patient
      // row exists with the correct therapist_id on the DB side.
      console.warn('[upsertExercisePlans] שורת patients לא נמצאה עבור patientId — בודק auth.uid()', {
        patientId,
      });
      const { data: { user } } = await client.auth.getUser();
      if (user?.id) {
        console.warn('[upsertExercisePlans] משתמש ב-auth.uid() כ-therapist_id של יומן הביקורת', {
          patientId,
          therapistId: user.id,
        });
        therapistId = user.id;
      } else {
        console.error('[upsertExercisePlans] patients שורה לא נמצאה ואין משתמש מחובר', { patientId });
        return {
          ok: false,
          message:
            'exercise_plans: שורת המטופל אינה קיימת ב-Supabase — סנכרן את המטופל לענן תחילה (therapist_id חסר)',
        };
      }
    }

    const { data: active, error: selErr } = await client
      .from('exercise_plans')
      .select('id, version_number, exercises')
      .eq('patient_id', patientId)
      .eq('is_active', true)
      .maybeSingle();

    if (selErr) {
      console.error('[upsertExercisePlans] שגיאה בשליפת תוכנית פעילה', selErr, { patientId });
      return { ok: false, message: `exercise_plans: ${selErr.message}` };
    }

    if (!active) {
      // Guard against a concurrent insert that beat us here (unique constraint: one active per patient).
      // Re-check before inserting so we don't violate the constraint in a race.
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
          const { error: touchErr } = await client
            .from('exercise_plans')
            .update({ updated_at: now })
            .eq('id', recheckRow.id);
          if (touchErr) {
            console.error('[upsertExercisePlans] שגיאה בעדכון updated_at', touchErr, { patientId });
            return { ok: false, message: `exercise_plans: ${touchErr.message}` };
          }
          continue;
        }
        // Fall through to update the newly-created active row.
        const { error: deactRecheck } = await client
          .from('exercise_plans')
          .update({ is_active: false })
          .eq('id', recheckRow.id);
        if (deactRecheck) {
          console.error('[upsertExercisePlans] שגיאה בביטול is_active של שורה ישנה', deactRecheck, {
            patientId,
          });
          return { ok: false, message: `exercise_plans: ${deactRecheck.message}` };
        }
      }

      const insertPayload = {
        patient_id: patientId,
        exercises,
        updated_at: now,
        version_number: (recheck as { version_number?: number } | null)?.version_number
          ? ((recheck as { version_number: number }).version_number + 1)
          : 1,
        is_active: true,
        parent_plan_id: (recheck as { id?: string } | null)?.id ?? null,
        change_summary: changeSummary,
      };

      console.log('[upsertExercisePlans] מכניס שורת exercise_plans חדשה (גרסה ראשונה)', {
        patientId,
        version_number: insertPayload.version_number,
        is_active: insertPayload.is_active,
        exerciseCount: exercises.length,
      });

      const { error: insErr } = await client.from('exercise_plans').insert(insertPayload);
      if (insErr) {
        // 23505 = unique_violation — another concurrent write won the race; treat as non-fatal.
        if (insErr.code === '23505') continue;
        console.error('[upsertExercisePlans] שגיאת הכנסה ל-exercise_plans', insErr, {
          patientId,
          payload: { patient_id: patientId, is_active: true, exerciseCount: exercises.length },
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

    const row = active as { id: string; version_number: number; exercises: unknown };

    if (exercisesJsonEqual(row.exercises, exercises)) {
      const { error: touchErr } = await client
        .from('exercise_plans')
        .update({ updated_at: now })
        .eq('id', row.id);
      if (touchErr) {
        console.error('[upsertExercisePlans] שגיאה בעדכון updated_at', touchErr, { patientId });
        return { ok: false, message: `exercise_plans: ${touchErr.message}` };
      }
      continue;
    }

    const { error: deactErr } = await client
      .from('exercise_plans')
      .update({ is_active: false })
      .eq('id', row.id);
    if (deactErr) {
      console.error('[upsertExercisePlans] שגיאה בביטול is_active של תוכנית קיימת', deactErr, {
        patientId,
        rowId: row.id,
      });
      return { ok: false, message: `exercise_plans: ${deactErr.message}` };
    }

    const nextVersion = (row.version_number ?? 1) + 1;
    const updateInsertPayload = {
      patient_id: patientId,
      exercises,
      updated_at: now,
      version_number: nextVersion,
      is_active: true,
      parent_plan_id: row.id,
      change_summary: changeSummary,
    };

    console.log('[upsertExercisePlans] מכניס גרסת exercise_plans חדשה (עדכון)', {
      patientId,
      version_number: nextVersion,
      is_active: true,
      exerciseCount: exercises.length,
      parent_plan_id: row.id,
    });

    const { error: insErr } = await client.from('exercise_plans').insert(updateInsertPayload);
    if (insErr) {
      // 23505 = unique_violation — a concurrent save also inserted an active row.
      // The other writer won; our deactivation already ran so we need to reactivate their row.
      if (insErr.code === '23505') {
        await client
          .from('exercise_plans')
          .update({ is_active: true })
          .eq('id', row.id);
        continue;
      }
      console.error('[upsertExercisePlans] שגיאת הכנסת גרסה חדשה ל-exercise_plans', insErr, {
        patientId,
        payload: { patient_id: patientId, is_active: true, version_number: nextVersion },
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
