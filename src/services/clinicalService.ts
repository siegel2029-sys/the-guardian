import type { SupabaseClient } from '@supabase/supabase-js';
import type { Patient, Therapist } from '../types';
import { mockTherapist, mockTherapistB } from '../data/mockData';

const THERAPISTS_BY_ID: Record<string, Therapist> = {
  [mockTherapist.id]: mockTherapist,
  [mockTherapistB.id]: mockTherapistB,
};

export type ClinicalPushResult = { ok: true } | { ok: false; message: string };

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

/**
 * Full patient JSON payloads — includes avatar/body map highlights, pain (VAS) history in analytics,
 * medical/diagnosis fields, and persisted gamification fields stored on {@link Patient} (XP, gear, etc.).
 */
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

  const patientRows = source.map((p) => ({
    id: p.id,
    therapist_id: p.therapistId,
    payload: p,
    updated_at: now,
  }));

  if (patientRows.length > 0) {
    const { error } = await client.from('patients').upsert(patientRows, { onConflict: 'id' });
    if (error) return { ok: false, message: `patients: ${error.message}` };
  }

  return { ok: true };
}
