import type {
  Patient,
  PatientClinicalIntakeProfile,
  PatientIntakeArchive,
  PatientIntakeVersionEntry,
} from '../types';
import { isClinicalIntakeProfileEmpty } from './clinicalIntakeTemplate';
import { resolveCoreLegacyIntakeSummaryText } from './clinicalIntakeProfileMigration';
import { normalizeLegacyIntake } from './normalizeLegacyIntake';
import {
  applyLegacyNormalizationIfNeeded,
  buildPatientPatchFromEditableIntakeFields,
  type ClinicalIntakeEditableFields,
} from './clinicalIntakeEditableFields';
import {
  extractNarrativeCaseStory,
  pruneAiInsightLists,
  stripIntakeSystemArtifacts,
} from './clinicalIntakeNarrativeExtract';
import type { MedicalIntakeAnalysisSchema } from './medicalIntakeSchema';
import { mapAiResponseToFields } from './medicalIntakeSchema';
import type { IntakeComparativeAiResult } from '../ai/geminiIntakeComparativeFollowup';
import { supabase } from '../lib/supabase';
import {
  fetchPatientIntakeVersions,
  insertPatientIntakeVersion,
  isClientDraftIntakeVersionId,
  isPersistedIntakeVersionId,
  migrateTimelineEntriesToDbIfNeeded,
  updatePatientIntakeVersion,
} from '../services/patientIntakeService';

export { isClientDraftIntakeVersionId, isPersistedIntakeVersionId } from '../services/patientIntakeService';

export type IntakeVersionSaveMode = 'insert' | 'update';

export type { ClinicalIntakeEditableFields };

function emptyProfile(): PatientClinicalIntakeProfile {
  return {};
}

function ensureList(items: string[] | undefined, min = 1): string[] {
  const clean = (items ?? []).map((s) => s.trim()).filter(Boolean);
  return clean.length > 0 ? clean : Array(min).fill('');
}

function fieldsToSnapshot(fields: ClinicalIntakeEditableFields): ClinicalIntakeEditableFields {
  return JSON.parse(JSON.stringify(fields)) as ClinicalIntakeEditableFields;
}

function buildFallbackArchive(patient: Patient): PatientIntakeArchive {
  const coreIntakeText = resolveCoreLegacyIntakeSummaryText(patient) ?? patient.therapistNotes;
  return {
    capturedAt: patient.joinDate,
    primaryBodyArea: patient.primaryBodyArea,
    libraryExerciseIds: [],
    diagnosis: patient.diagnosis,
    therapistNotes: coreIntakeText,
    extras: {
      intakeStory: coreIntakeText,
      ...(patient.clinicalIntakeProfile ? { clinicalIntakeProfile: patient.clinicalIntakeProfile } : {}),
      ...(patient.clinicalIntakeAiInsights
        ? { clinicalIntakeAiInsights: patient.clinicalIntakeAiInsights }
        : {}),
      clinicalDiagnosis: patient.diagnosis,
    },
  };
}

function fieldsFromArchiveSource(
  archive: PatientIntakeArchive,
  opts?: { normalizeLegacy?: boolean }
): ClinicalIntakeEditableFields {
  const ex = archive.extras ?? {};
  const rawStory = ex.intakeStory?.trim() ?? archive.therapistNotes?.trim() ?? '';
  let profile = ex.clinicalIntakeProfile ?? emptyProfile();
  let caseStory =
    extractNarrativeCaseStory(rawStory) || stripIntakeSystemArtifacts(rawStory);

  const stored = ex.clinicalIntakeAiInsights;
  let vasScore =
    ex.intakeVasScore != null && Number.isFinite(ex.intakeVasScore)
      ? Math.min(10, Math.max(0, ex.intakeVasScore))
      : null;

  if (opts?.normalizeLegacy && rawStory) {
    const normalized = normalizeLegacyIntake(rawStory);
    if (!caseStory && normalized.caseStory) caseStory = normalized.caseStory;
    if (isClinicalIntakeProfileEmpty(profile) && normalized.clinicalIntakeProfile) {
      profile = normalized.clinicalIntakeProfile;
    }
    if (vasScore == null && normalized.vasScore != null) vasScore = normalized.vasScore;
  }

  const pruned = pruneAiInsightLists(
    {
      differentialDiagnosis: stored?.differentialDiagnosis ?? [],
      clinicalConclusionsHe:
        stored?.clinicalConclusionsHe ?? ex.clinicalReasoningHe ?? [],
      precautionsHe: stored?.precautionsHe ?? [],
      recommendedTestsHe: stored?.recommendedTestsHe ?? [],
      redFlags: stored?.redFlags ?? [],
    },
    { narrative: caseStory, profile }
  );

  return {
    caseStory,
    vasScore,
    diagnosis: archive.diagnosis?.trim() || ex.clinicalDiagnosis?.trim() || '',
    differentialDiagnosis: ensureList(pruned.differentialDiagnosis),
    precautionsHe: ensureList(pruned.precautionsHe),
    recommendedTestsHe: ensureList(pruned.recommendedTestsHe),
    clinicalConclusionsHe: ensureList(pruned.clinicalConclusionsHe),
    redFlags: ensureList(pruned.redFlags),
    clinicalIntakeProfile: profile,
  };
}

export function loadInitialIntakeFields(patient: Patient): ClinicalIntakeEditableFields {
  const archive = patient.initialIntakeArchive ?? buildFallbackArchive(patient);
  return fieldsFromArchiveSource(archive, { normalizeLegacy: true });
}

/**
 * Load latest fields from patient root payload only — never calls `resolveIntakeVersionTimeline`
 * (avoids infinite recursion during timeline bootstrap).
 */
function loadPatientRootIntakeFields(
  patient: Patient,
  options?: { skipLegacyRestore?: boolean }
): ClinicalIntakeEditableFields {
  const stored = patient.clinicalIntakeAiInsights;
  const profile = patient.clinicalIntakeProfile ?? emptyProfile();
  const rawStory = patient.intakeStory?.trim() ?? patient.therapistNotes?.trim() ?? '';
  const caseStory =
    extractNarrativeCaseStory(rawStory) || stripIntakeSystemArtifacts(rawStory);
  const vasFromPatient = patient.intakeVasScore;
  const painHistory = patient.analytics?.painHistory ?? [];
  const latestPain = [...painHistory].sort((a, b) => b.date.localeCompare(a.date))[0]?.painLevel;

  const pruned = pruneAiInsightLists(
    {
      differentialDiagnosis: stored?.differentialDiagnosis ?? [],
      clinicalConclusionsHe: stored?.clinicalConclusionsHe ?? patient.clinicalReasoningHe ?? [],
      precautionsHe: stored?.precautionsHe ?? [],
      recommendedTestsHe: stored?.recommendedTestsHe ?? [],
      redFlags: stored?.redFlags ?? [],
    },
    { narrative: caseStory, profile }
  );

  const base: ClinicalIntakeEditableFields = {
    caseStory,
    vasScore:
      vasFromPatient != null && Number.isFinite(vasFromPatient)
        ? Math.min(10, Math.max(0, vasFromPatient))
        : latestPain != null && Number.isFinite(latestPain)
          ? Math.min(10, Math.max(0, latestPain))
          : null,
    diagnosis: patient.diagnosis?.trim() ?? '',
    differentialDiagnosis: ensureList(pruned.differentialDiagnosis),
    precautionsHe: ensureList(pruned.precautionsHe),
    recommendedTestsHe: ensureList(pruned.recommendedTestsHe),
    clinicalConclusionsHe: ensureList(pruned.clinicalConclusionsHe),
    redFlags: ensureList(pruned.redFlags),
    clinicalIntakeProfile: profile,
  };

  if (options?.skipLegacyRestore) return base;
  return applyLegacyNormalizationIfNeeded(patient, base).fields;
}

export function loadLatestIntakeFields(
  patient: Patient,
  options?: { skipLegacyRestore?: boolean }
): ClinicalIntakeEditableFields {
  const persisted = (patient.intakeVersionTimeline ?? []).filter((v) => !v.archived);
  if (persisted.length > 0) {
    const active = getActiveIntakeVersion(persisted);
    if (active) return fieldsToSnapshot(active.fields);
  }
  return loadPatientRootIntakeFields(patient, options);
}

export function formatIntakeVersionDate(version: PatientIntakeVersionEntry): string {
  const d = new Date(version.createdAt);
  return Number.isFinite(d.getTime())
    ? d.toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit' })
    : '—';
}

export function formatIntakeVersionTabLabel(version: PatientIntakeVersionEntry): string {
  if (version.label?.trim()) return version.label.trim();
  const dateStr = formatIntakeVersionDate(version);
  const suffix = version.kind === 'initial' ? 'קבלה' : 'ניתוח';
  return `${dateStr} - ${suffix}`;
}

function createInitialVersionEntry(patient: Patient): PatientIntakeVersionEntry {
  const archive = patient.initialIntakeArchive;
  return {
    id: `intake-initial-${patient.id}`,
    createdAt: archive?.capturedAt ?? patient.joinDate ?? new Date().toISOString(),
    kind: 'initial',
    immutable: true,
    fields: fieldsToSnapshot(loadInitialIntakeFields(patient)),
  };
}

/** Build or restore the full version timeline from payload (bootstraps from archive if empty). */
export function resolveIntakeVersionTimeline(patient: Patient): PatientIntakeVersionEntry[] {
  const stored = (patient.intakeVersionTimeline ?? []).filter((v) => !v.archived);
  if (stored.length > 0) {
    return [...stored].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }

  return [createInitialVersionEntry(patient)];
}

export function getActiveIntakeVersion(
  timeline: PatientIntakeVersionEntry[]
): PatientIntakeVersionEntry | undefined {
  const visible = timeline.filter((v) => !v.archived);
  return visible[visible.length - 1];
}

export function getActiveVersionId(timeline: PatientIntakeVersionEntry[]): string {
  return getActiveIntakeVersion(timeline)?.id ?? '';
}

export function latestIntakeHasContent(fields: ClinicalIntakeEditableFields): boolean {
  return Boolean(
    fields.caseStory.trim() ||
      fields.diagnosis.trim() ||
      fields.vasScore != null ||
      !isClinicalIntakeProfileEmpty(fields.clinicalIntakeProfile) ||
      fields.differentialDiagnosis.some((s) => s.trim()) ||
      fields.clinicalConclusionsHe.some((s) => s.trim()) ||
      fields.precautionsHe.some((s) => s.trim()) ||
      fields.recommendedTestsHe.some((s) => s.trim()) ||
      fields.redFlags.some((s) => s.trim())
  );
}

export function patientHasComparativeAnalysis(patient: Patient): boolean {
  const timeline = resolveIntakeVersionTimeline(patient);
  return timeline.some((v) => v.kind === 'analysis');
}

/** Persist edits to the active (latest) version only — initial stays immutable. */
export function buildPatchForLatestVersionSave(
  patient: Patient,
  fields: ClinicalIntakeEditableFields,
  versionId?: string
): Partial<Patient> {
  const timeline = resolveIntakeVersionTimeline(patient);
  const targetId = versionId ?? getActiveVersionId(timeline);
  const targetIdx = timeline.findIndex((v) => v.id === targetId);
  if (targetIdx < 0) return buildPatientPatchFromEditableIntakeFields(fields);

  const next = [...timeline];
  next[targetIdx] = {
    ...next[targetIdx],
    fields: fieldsToSnapshot(fields),
  };

  return {
    ...buildPatientPatchFromEditableIntakeFields(fields),
    intakeVersionTimeline: next,
  };
}

/** Deep-clone the latest tab into a new successive version entry (client draft id). */
export function buildClonedVersionEntry(
  sourceVersion: PatientIntakeVersionEntry
): PatientIntakeVersionEntry {
  const now = new Date().toISOString();
  const clonedFields = fieldsToSnapshot(sourceVersion.fields as ClinicalIntakeEditableFields);
  const dateStr = formatIntakeVersionDate({ ...sourceVersion, createdAt: now });
  return {
    id: `intake-analysis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    kind: 'analysis',
    label: `${dateStr} - ניתוח`,
    fields: clonedFields,
  };
}

/** Build a draft analysis version entry from AI output (not persisted until confirm). */
export function buildAnalysisVersionEntry(
  sourceFields: ClinicalIntakeEditableFields,
  analysis: IntakeComparativeAiResult
): PatientIntakeVersionEntry {
  const schema: MedicalIntakeAnalysisSchema =
    analysis.medicalSchema ??
    ({
      clinical_story: analysis.updatedCaseStory ?? sourceFields.caseStory,
      pain_score: analysis.vasScore ?? sourceFields.vasScore,
      strength_metrics: sourceFields.clinicalIntakeProfile.muscle_strength ?? '',
      rom_metrics: (sourceFields.clinicalIntakeProfile.ranges ?? []).join('\n'),
      ai_conclusions: analysis.structuredInsights.clinicalConclusionsHe,
      recommendations: analysis.structuredInsights.recommendedTestsHe,
    } as MedicalIntakeAnalysisSchema);

  const newFields = mapAiResponseToFields(analysis, sourceFields);
  const now = new Date().toISOString();
  const dateStr = formatIntakeVersionDate({ id: '', createdAt: now, kind: 'analysis', fields: newFields });
  return {
    id: `intake-analysis-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: now,
    kind: 'analysis',
    label: `${dateStr} - ניתוח`,
    fields: fieldsToSnapshot(newFields),
    medicalSchema: schema,
    comparativeMeta: {
      discrepancies: analysis.discrepancies,
      reevaluation: analysis.reevaluation,
    },
  };
}

export type UpsertIntakeVersionResult = {
  patch: Partial<Patient>;
  newVersion: PatientIntakeVersionEntry;
  timeline: PatientIntakeVersionEntry[];
};

type IntakeSaveDeps = {
  updatePatient: (id: string, patch: Partial<Patient>) => void;
  saveToCloud: () => Promise<boolean | void>;
};

/** Offline/payload fallback — always APPEND for new drafts (never overwrite by id). */
function buildInsertIntakeVersionPayloadPatch(
  patient: Patient,
  version: PatientIntakeVersionEntry,
  editedFields: ClinicalIntakeEditableFields,
  insertedVersion: PatientIntakeVersionEntry
): UpsertIntakeVersionResult {
  const timeline = resolveIntakeVersionTimeline(patient).filter((v) => v.id !== version.id);
  const nextTimeline = [...timeline, insertedVersion];

  return {
    patch: {
      ...buildPatientPatchFromEditableIntakeFields(editedFields),
      intakeVersionTimeline: nextTimeline,
    },
    newVersion: insertedVersion,
    timeline: nextTimeline,
  };
}

/** Offline/payload fallback — UPDATE one existing version by id. */
function buildUpdateIntakeVersionPayloadPatch(
  patient: Patient,
  versionId: string,
  version: PatientIntakeVersionEntry,
  editedFields: ClinicalIntakeEditableFields
): UpsertIntakeVersionResult {
  const timeline = resolveIntakeVersionTimeline(patient);
  const updated: PatientIntakeVersionEntry = {
    ...version,
    id: versionId,
    fields: fieldsToSnapshot(editedFields),
  };
  const nextTimeline = timeline.map((v) => (v.id === versionId ? updated : v));

  return {
    patch: {
      ...buildPatientPatchFromEditableIntakeFields(editedFields),
      intakeVersionTimeline: nextTimeline,
    },
    newVersion: updated,
    timeline: nextTimeline,
  };
}

async function syncPatientAfterIntakeSave(
  patientId: string,
  patient: Patient,
  timeline: PatientIntakeVersionEntry[],
  latestFields: ClinicalIntakeEditableFields,
  save: IntakeSaveDeps
): Promise<void> {
  const patch: Partial<Patient> = {
    ...buildPatientPatchFromEditableIntakeFields(latestFields),
    intakeVersionTimeline: timeline,
  };
  save.updatePatient(patientId, patch);
  const ok = await save.saveToCloud();
  if (ok === false) {
    throw new Error('שגיאת שמירה לענן — הגרסה לא נשמרה.');
  }
}

/**
 * INSERT a new comparative intake version (new DB row, new UUID).
 * Re-fetches the full version list from Supabase after save.
 */
export async function insertIntakeVersion(
  patientId: string,
  patient: Patient,
  draftVersion: PatientIntakeVersionEntry,
  editedFields: ClinicalIntakeEditableFields,
  save: IntakeSaveDeps
): Promise<UpsertIntakeVersionResult> {
  if (!isClientDraftIntakeVersionId(draftVersion.id)) {
    throw new Error('insertIntakeVersion: רק טיוטה חדשה יכולה להיווצר — לא לעדכן שורה קיימת');
  }

  if (supabase) {
    const payloadTimeline = resolveIntakeVersionTimeline(patient);
    await migrateTimelineEntriesToDbIfNeeded(supabase, patientId, payloadTimeline);

    const inserted = await insertPatientIntakeVersion(
      supabase,
      patientId,
      draftVersion,
      editedFields
    );
    const timeline = await fetchPatientIntakeVersions(supabase, patientId);
    await syncPatientAfterIntakeSave(patientId, patient, timeline, editedFields, save);
    return { patch: { intakeVersionTimeline: timeline }, newVersion: inserted, timeline };
  }

  const insertedLocal: PatientIntakeVersionEntry = {
    ...draftVersion,
    id: `local-intake-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    fields: fieldsToSnapshot(editedFields),
  };
  const built = buildInsertIntakeVersionPayloadPatch(
    patient,
    draftVersion,
    editedFields,
    insertedLocal
  );
  save.updatePatient(patientId, built.patch);
  const ok = await save.saveToCloud();
  if (ok === false) throw new Error('שגיאת שמירה לענן — הגרסה לא נשמרה.');
  return built;
}

/**
 * UPDATE an existing persisted intake version row by DB uuid.
 * Re-fetches the full version list after save.
 */
export async function updateIntakeVersion(
  patientId: string,
  patient: Patient,
  versionId: string,
  version: PatientIntakeVersionEntry,
  editedFields: ClinicalIntakeEditableFields,
  save: IntakeSaveDeps
): Promise<UpsertIntakeVersionResult> {
  if (!isPersistedIntakeVersionId(versionId)) {
    throw new Error('updateIntakeVersion: נדרש מזהה UUID שמור — לא ניתן לעדכן טיוטה');
  }

  if (supabase) {
    const updated = await updatePatientIntakeVersion(
      supabase,
      versionId,
      version,
      editedFields
    );
    const timeline = await fetchPatientIntakeVersions(supabase, patientId);
    await syncPatientAfterIntakeSave(patientId, patient, timeline, editedFields, save);
    return { patch: { intakeVersionTimeline: timeline }, newVersion: updated, timeline };
  }

  const built = buildUpdateIntakeVersionPayloadPatch(
    patient,
    versionId,
    version,
    editedFields
  );
  save.updatePatient(patientId, built.patch);
  const ok = await save.saveToCloud();
  if (ok === false) throw new Error('שגיאת שמירה לענן — הגרסה לא נשמרה.');
  return built;
}

/** Load intake versions from DB (migrates payload timeline first if DB is empty). */
export async function refreshIntakeVersionsFromDb(
  patientId: string,
  patient: Patient,
  updatePatient: (id: string, patch: Partial<Patient>) => void
): Promise<PatientIntakeVersionEntry[]> {
  const payloadTimeline = resolveIntakeVersionTimeline(patient);
  if (!supabase) return payloadTimeline;

  await migrateTimelineEntriesToDbIfNeeded(supabase, patientId, payloadTimeline);
  const timeline = await fetchPatientIntakeVersions(supabase, patientId);
  if (timeline.length > 0) {
    const latest = getActiveIntakeVersion(timeline);
    const patch: Partial<Patient> = { intakeVersionTimeline: timeline };
    if (latest) {
      Object.assign(
        patch,
        buildPatientPatchFromEditableIntakeFields(latest.fields as ClinicalIntakeEditableFields)
      );
    }
    updatePatient(patientId, patch);
    return timeline;
  }
  return payloadTimeline;
}

/**
 * INSERT a successive version cloned from the current latest tab (deep clone).
 * Navigates caller to the new row via returned `newVersion`.
 */
export async function cloneSuccessiveIntakeVersion(
  patientId: string,
  patient: Patient,
  sourceVersion: PatientIntakeVersionEntry,
  save: IntakeSaveDeps
): Promise<UpsertIntakeVersionResult> {
  const draft = buildClonedVersionEntry(sourceVersion);
  const fields = fieldsToSnapshot(draft.fields as ClinicalIntakeEditableFields);
  return insertIntakeVersion(patientId, patient, draft, fields, save);
}

/** @deprecated Use insertIntakeVersion (confirm) or updateIntakeVersion (edit existing tab). */
export async function upsertIntakeVersion(
  patientId: string,
  patient: Patient,
  version: PatientIntakeVersionEntry,
  editedFields: ClinicalIntakeEditableFields,
  save: IntakeSaveDeps
): Promise<UpsertIntakeVersionResult> {
  if (isClientDraftIntakeVersionId(version.id)) {
    return insertIntakeVersion(patientId, patient, version, editedFields, save);
  }
  return updateIntakeVersion(patientId, patient, version.id, version, editedFields, save);
}

/** @deprecated Use buildAnalysisVersionEntry + insertIntakeVersion on confirm. */
export function buildPatchForNewAnalysisVersion(
  patient: Patient,
  sourceFields: ClinicalIntakeEditableFields,
  analysis: IntakeComparativeAiResult
): Partial<Patient> {
  const version = buildAnalysisVersionEntry(sourceFields, analysis);
  const fields = mapAiResponseToFields(analysis, sourceFields);
  const inserted: PatientIntakeVersionEntry = { ...version, fields: fieldsToSnapshot(fields) };
  return buildInsertIntakeVersionPayloadPatch(patient, version, fields, inserted).patch;
}

/** Soft-archive an analysis version (never the initial intake). */
/** Persist bootstrapped timeline when payload has no `intakeVersionTimeline` yet. */
export function buildBootstrapTimelinePatchIfNeeded(patient: Patient): Partial<Patient> | null {
  if ((patient.intakeVersionTimeline?.length ?? 0) > 0) return null;
  return { intakeVersionTimeline: resolveIntakeVersionTimeline(patient) };
}

export function buildPatchForArchiveIntakeVersion(
  patient: Patient,
  versionId: string
): Partial<Patient> | null {
  const timeline = patient.intakeVersionTimeline ?? resolveIntakeVersionTimeline(patient);
  const target = timeline.find((v) => v.id === versionId);
  if (!target || target.immutable || target.kind === 'initial') return null;

  const next = timeline.map((v) =>
    v.id === versionId ? { ...v, archived: true } : v
  );
  return { intakeVersionTimeline: next };
}
