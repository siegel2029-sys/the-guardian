import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { ExercisePlan, Patient, Therapist } from '../types';
import { isSupabaseAuthEnabled } from '../lib/patientPortalAuth';

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

    const patientRows = [
      {
        id: payloadForRow.id,
        therapist_id: therapistIdForRow,
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

function exercisesJsonEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
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

    const { data: prow, error: pErr } = await client
      .from('patients')
      .select('therapist_id')
      .eq('id', patientId)
      .maybeSingle();
    if (pErr) return { ok: false, message: `patients: ${pErr.message}` };
    const therapistId = prow?.therapist_id as string | undefined;
    if (!therapistId) {
      return { ok: false, message: 'exercise_plans: missing patient therapist_id' };
    }

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

/**
 * Loads `patients.payload` rows visible to the current JWT (RLS: therapist_id = auth.uid()).
 * Used to hydrate the therapist dashboard from Supabase instead of local mock IDs only.
 */
export async function fetchPatientPayloadsForTherapist(client: SupabaseClient): Promise<Patient[]> {
  const {
    data: { user },
    error: userErr,
  } = await client.auth.getUser();
  if (userErr || !user?.id) return [];

  const { data, error } = await client
    .from('patients')
    .select('payload')
    .order('updated_at', { ascending: false });

  if (error) {
    if (import.meta.env.DEV) {
      console.warn('[fetchPatientPayloadsForTherapist]', error.message);
    }
    return [];
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
  return out;
}
