import type { SupabaseClient } from '@supabase/supabase-js';
import type { PatientIntakeVersionEntry } from '../types';
import type { ClinicalIntakeEditableFields } from '../utils/clinicalIntakeEditableFields';
import { ensureSupabaseSessionReady, logSupabaseCallError } from '../lib/supabaseSessionGuard';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type PatientIntakeRow = {
  id: string;
  patient_id: string;
  created_at: string;
  updated_at?: string;
  archived: boolean;
  intake_data: PatientIntakeVersionPayload;
};

type PatientIntakeVersionPayload = {
  kind: PatientIntakeVersionEntry['kind'];
  label?: string;
  immutable?: boolean;
  fields: PatientIntakeVersionEntry['fields'];
  medicalSchema?: PatientIntakeVersionEntry['medicalSchema'];
  comparativeMeta?: PatientIntakeVersionEntry['comparativeMeta'];
};

function fieldsToSnapshot(fields: ClinicalIntakeEditableFields): ClinicalIntakeEditableFields {
  return JSON.parse(JSON.stringify(fields)) as ClinicalIntakeEditableFields;
}

/** True when the id is a Postgres-generated UUID (persisted row). */
export function isPersistedIntakeVersionId(id: string): boolean {
  return UUID_RE.test(id);
}

/** Client-side draft ids (pre-confirm) must never be sent on UPDATE. */
export function isClientDraftIntakeVersionId(id: string): boolean {
  return !isPersistedIntakeVersionId(id);
}

export function versionEntryToIntakePayload(
  version: PatientIntakeVersionEntry,
  fields: ClinicalIntakeEditableFields
): PatientIntakeVersionPayload {
  return {
    kind: version.kind,
    label: version.label,
    immutable: version.immutable,
    fields: fieldsToSnapshot(fields) as PatientIntakeVersionEntry['fields'],
    medicalSchema: version.medicalSchema,
    comparativeMeta: version.comparativeMeta,
  };
}

export function rowToVersionEntry(row: PatientIntakeRow): PatientIntakeVersionEntry {
  const data = row.intake_data;
  return {
    id: row.id,
    createdAt: row.created_at,
    kind: data.kind ?? 'analysis',
    label: data.label,
    immutable: data.immutable,
    archived: row.archived,
    fields: data.fields,
    medicalSchema: data.medicalSchema,
    comparativeMeta: data.comparativeMeta,
  };
}

/** Fetch all non-archived intake versions for a patient, oldest first. */
export async function fetchPatientIntakeVersions(
  client: SupabaseClient,
  patientId: string
): Promise<PatientIntakeVersionEntry[]> {
  await ensureSupabaseSessionReady(client);

  const { data, error } = await client
    .from('patient_intakes')
    .select('id, patient_id, created_at, archived, intake_data')
    .eq('patient_id', patientId)
    .eq('archived', false)
    .order('created_at', { ascending: true });

  if (error) {
    logSupabaseCallError('fetchPatientIntakeVersions', error);
    throw new Error(error.message || 'שגיאה בטעינת גרסאות אינטייק');
  }

  return (data ?? []).map((row) => rowToVersionEntry(row as PatientIntakeRow));
}

/**
 * INSERT a new intake version — never sends `id` (Postgres generates UUID).
 * Use for new comparative analysis confirm only.
 */
export async function insertPatientIntakeVersion(
  client: SupabaseClient,
  patientId: string,
  version: PatientIntakeVersionEntry,
  fields: ClinicalIntakeEditableFields
): Promise<PatientIntakeVersionEntry> {
  if (!isClientDraftIntakeVersionId(version.id)) {
    throw new Error('insertPatientIntakeVersion requires a client draft id — use update for persisted rows');
  }

  await ensureSupabaseSessionReady(client);

  const payload = versionEntryToIntakePayload(version, fields);
  const { data, error } = await client
    .from('patient_intakes')
    .insert({
      patient_id: patientId,
      intake_data: payload,
    })
    .select('id, patient_id, created_at, archived, intake_data')
    .single();

  if (error) {
    logSupabaseCallError('insertPatientIntakeVersion', error);
    throw new Error(error.message || 'שגיאה בשמירת גרסת אינטייק חדשה');
  }

  return rowToVersionEntry(data as PatientIntakeRow);
}

/**
 * UPDATE an existing persisted intake row by UUID.
 * Use only when editing an existing tab — never for new comparative drafts.
 */
export async function updatePatientIntakeVersion(
  client: SupabaseClient,
  versionId: string,
  version: PatientIntakeVersionEntry,
  fields: ClinicalIntakeEditableFields
): Promise<PatientIntakeVersionEntry> {
  if (!isPersistedIntakeVersionId(versionId)) {
    throw new Error('updatePatientIntakeVersion requires a persisted DB uuid');
  }

  await ensureSupabaseSessionReady(client);

  const payload = versionEntryToIntakePayload(version, fields);
  const { data, error } = await client
    .from('patient_intakes')
    .update({
      intake_data: payload,
      updated_at: new Date().toISOString(),
    })
    .eq('id', versionId)
    .select('id, patient_id, created_at, archived, intake_data')
    .single();

  if (error) {
    logSupabaseCallError('updatePatientIntakeVersion', error);
    throw new Error(error.message || 'שגיאה בעדכון גרסת אינטייק');
  }

  return rowToVersionEntry(data as PatientIntakeRow);
}

/** One-time migration: copy payload timeline rows into patient_intakes when DB is empty. */
export async function migrateTimelineEntriesToDbIfNeeded(
  client: SupabaseClient,
  patientId: string,
  timeline: PatientIntakeVersionEntry[]
): Promise<void> {
  const existing = await fetchPatientIntakeVersions(client, patientId);
  if (existing.length > 0) return;
  if (timeline.length === 0) return;

  await ensureSupabaseSessionReady(client);

  for (const version of timeline) {
    if (version.archived) continue;
    const fields = version.fields as ClinicalIntakeEditableFields;
    const payload = versionEntryToIntakePayload(version, fields);
    const { error } = await client.from('patient_intakes').insert({
      patient_id: patientId,
      created_at: version.createdAt,
      intake_data: payload,
    });
    if (error) {
      logSupabaseCallError('migrateTimelineEntriesToDbIfNeeded', error);
      throw new Error(error.message || 'שגיאה בהעברת גרסאות אינטייק לענן');
    }
  }
}
