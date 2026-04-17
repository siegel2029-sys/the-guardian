import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExercisePlan, Patient, Therapist } from '../types';
import { mockTherapist, mockTherapistB } from '../data/mockData';

const THERAPISTS_BY_ID: Record<string, Therapist> = {
  [mockTherapist.id]: mockTherapist,
  [mockTherapistB.id]: mockTherapistB,
};

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
 */
export async function upsertTherapistProfilesForPatients(
  client: SupabaseClient,
  patients: Patient[],
  now: string
): Promise<ClinicalPushResult> {
  const therapistIds = new Set<string>();
  for (const p of patients) {
    therapistIds.add(p.therapistId);
  }

  const profileRows = [...therapistIds].map((id) => {
    const t = THERAPISTS_BY_ID[id] ?? {
      id,
      name: 'מטפל',
      email: '',
      title: '',
      avatarInitials: '—',
      clinicName: '',
    };
    return {
      id,
      email: t.email,
      name: t.name,
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

  for (const p of source) {
    const { data: existing, error: fetchErr } = await client
      .from('patients')
      .select('payload')
      .eq('id', p.id)
      .maybeSingle();

    if (fetchErr) return { ok: false, message: `patients: ${fetchErr.message}` };

    const oldPayload = existing?.payload != null ? (existing.payload as Patient) : undefined;

    const patientRows = [
      {
        id: p.id,
        therapist_id: p.therapistId,
        payload: p,
        updated_at: now,
      },
    ];

    const { error } = await client.from('patients').upsert(patientRows, { onConflict: 'id' });
    if (error) return { ok: false, message: `patients: ${error.message}` };

    if (skipAudit) continue;

    const unchanged =
      oldPayload !== undefined && JSON.stringify(oldPayload) === JSON.stringify(p);
    if (unchanged) continue;

    const audit =
      oldPayload === undefined
        ? await insertClinicalAuditLog(client, {
            therapistId: p.therapistId,
            patientId: p.id,
            entityType: 'patient_info',
            action: 'create',
            oldValue: null,
            newValue: p,
          })
        : await insertClinicalAuditLog(client, {
            therapistId: p.therapistId,
            patientId: p.id,
            entityType: 'patient_info',
            action: 'update',
            oldValue: oldPayload,
            newValue: p,
          });
    if (!audit.ok) return audit;
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
