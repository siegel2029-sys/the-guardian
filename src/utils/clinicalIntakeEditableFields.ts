import type { ClinicalIntakeAiInsights, Patient, PatientClinicalIntakeProfile } from '../types';
import { isClinicalIntakeProfileEmpty, medicalHistoryToProfileMetadata } from './clinicalIntakeTemplate';
import { resolveCoreLegacyIntakeSummaryText } from './clinicalIntakeProfileMigration';
import { resolvePatientClinicalIntakeProfile } from './clinicalIntakeProfileDisplay';
import { normalizeClinicalIntakeProfileForStorage } from './clinicalIntakeProfilePersist';
import {
  clinicalInsightsToSavePayload,
  formatClinicalIntakeInsightsNarrative,
} from './clinicalIntakeInsightsDisplay';
import {
  extractNarrativeCaseStory,
  pruneAiInsightLists,
  stripIntakeSystemArtifacts,
} from './clinicalIntakeNarrativeExtract';
import { normalizeLegacyIntake } from './normalizeLegacyIntake';

export type ClinicalIntakeEditableFields = {
  caseStory: string;
  vasScore: number | null;
  diagnosis: string;
  differentialDiagnosis: string[];
  precautionsHe: string[];
  recommendedTestsHe: string[];
  clinicalConclusionsHe: string[];
  redFlags: string[];
  /** Objective metrics — ROM, MMT, special tests, medical history, goals */
  clinicalIntakeProfile: PatientClinicalIntakeProfile;
};

export type LegacyIntakeRestoreResult = {
  fields: ClinicalIntakeEditableFields;
  restoredFromLegacy: boolean;
  filledProfileFields: string[];
};

function emptyProfile(): PatientClinicalIntakeProfile {
  return {};
}

function ensureList(items: string[] | undefined, min = 1): string[] {
  const clean = (items ?? []).map((s) => s.trim()).filter(Boolean);
  return clean.length > 0 ? clean : Array(min).fill('');
}

function hasStoredStructuredProfile(patient: Patient): boolean {
  const stored = patient.clinicalIntakeProfile;
  if (!isClinicalIntakeProfileEmpty(stored)) return true;
  const archive = patient.initialIntakeArchive?.extras?.clinicalIntakeProfile;
  return !isClinicalIntakeProfileEmpty(archive);
}

function hasStoredAiInsights(patient: Patient): boolean {
  const stored = patient.clinicalIntakeAiInsights;
  if (stored) {
    const has =
      (stored.differentialDiagnosis?.length ?? 0) > 0 ||
      (stored.precautionsHe?.length ?? 0) > 0 ||
      (stored.recommendedTestsHe?.length ?? 0) > 0 ||
      (stored.clinicalConclusionsHe?.length ?? 0) > 0 ||
      (stored.redFlags?.length ?? 0) > 0;
    if (has) return true;
  }
  return Boolean(
    (patient.clinicalReasoningHe?.length ?? 0) > 0 ||
      (patient.initialIntakeArchive?.extras?.clinicalIntakeAiInsights != null)
  );
}

/**
 * When structured fields are empty but a legacy blob exists, parse and merge legacy data.
 */
export function applyLegacyNormalizationIfNeeded(
  patient: Patient,
  base?: ClinicalIntakeEditableFields
): LegacyIntakeRestoreResult {
  const fields = base ?? loadClinicalIntakeEditableFields(patient, { skipLegacyRestore: true });
  const legacyBlob = resolveCoreLegacyIntakeSummaryText(patient);
  const needsProfileRestore = !hasStoredStructuredProfile(patient);
  const needsInsightsRestore = !hasStoredAiInsights(patient);
  const hasEmptyCaseStory = !fields.caseStory.trim();
  const hasEmptyVas = fields.vasScore == null;

  if (!legacyBlob?.trim() || (!needsProfileRestore && !needsInsightsRestore && !hasEmptyCaseStory)) {
    return { fields, restoredFromLegacy: false, filledProfileFields: [] };
  }

  const normalized = normalizeLegacyIntake(patient);
  if (!normalized.hadLegacyBlob) {
    return { fields, restoredFromLegacy: false, filledProfileFields: [] };
  }

  const profile = resolvePatientClinicalIntakeProfile(patient) ?? emptyProfile();
  const mergedProfile: PatientClinicalIntakeProfile = {
    ...profile,
    ...(needsProfileRestore && normalized.clinicalIntakeProfile
      ? normalized.clinicalIntakeProfile
      : {}),
  };

  const ai = normalized.aiInsights;
  const mergedInsights = {
    differentialDiagnosis: needsInsightsRestore
      ? ensureList(ai.differentialDiagnosis ?? fields.differentialDiagnosis)
      : fields.differentialDiagnosis,
    precautionsHe: needsInsightsRestore
      ? ensureList(ai.precautionsHe ?? fields.precautionsHe)
      : fields.precautionsHe,
    recommendedTestsHe: needsInsightsRestore
      ? ensureList(ai.recommendedTestsHe ?? fields.recommendedTestsHe)
      : fields.recommendedTestsHe,
    clinicalConclusionsHe: needsInsightsRestore
      ? ensureList(ai.clinicalConclusionsHe ?? fields.clinicalConclusionsHe)
      : fields.clinicalConclusionsHe,
    redFlags: needsInsightsRestore
      ? ensureList(ai.redFlags ?? fields.redFlags)
      : fields.redFlags,
  };

  const pruned = pruneAiInsightLists(mergedInsights, {
    narrative: fields.caseStory || normalized.caseStory,
    profile: mergedProfile,
  });

  const restoredFields: ClinicalIntakeEditableFields = {
    ...fields,
    caseStory: hasEmptyCaseStory && normalized.caseStory ? normalized.caseStory : fields.caseStory,
    vasScore:
      hasEmptyVas && normalized.vasScore != null ? normalized.vasScore : fields.vasScore,
    clinicalIntakeProfile: mergedProfile,
    differentialDiagnosis: pruned.differentialDiagnosis.length
      ? ensureList(pruned.differentialDiagnosis)
      : fields.differentialDiagnosis,
    precautionsHe: pruned.precautionsHe.length
      ? ensureList(pruned.precautionsHe)
      : fields.precautionsHe,
    recommendedTestsHe: pruned.recommendedTestsHe.length
      ? ensureList(pruned.recommendedTestsHe)
      : fields.recommendedTestsHe,
    clinicalConclusionsHe: pruned.clinicalConclusionsHe.length
      ? ensureList(pruned.clinicalConclusionsHe)
      : fields.clinicalConclusionsHe,
    redFlags: pruned.redFlags.length ? ensureList(pruned.redFlags) : fields.redFlags,
  };

  const restoredFromLegacy =
    restoredFields.caseStory !== fields.caseStory ||
    restoredFields.vasScore !== fields.vasScore ||
    JSON.stringify(restoredFields.clinicalIntakeProfile) !==
      JSON.stringify(fields.clinicalIntakeProfile) ||
    JSON.stringify(restoredFields.differentialDiagnosis) !==
      JSON.stringify(fields.differentialDiagnosis);

  return {
    fields: restoredFields,
    restoredFromLegacy,
    filledProfileFields: normalized.filledProfileFields,
  };
}

/** @deprecated Prefer `loadLatestIntakeFields` — kept for existing callers */
export function loadClinicalIntakeEditableFields(
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

export function buildPatientPatchFromEditableIntakeFields(
  fields: ClinicalIntakeEditableFields
): Partial<
  Pick<
    Patient,
    | 'intakeStory'
    | 'therapistNotes'
    | 'diagnosis'
    | 'intakeVasScore'
    | 'clinicalIntakeProfile'
    | 'medicalProfileMetadata'
    | 'clinicalIntakeAiInsights'
    | 'clinicalReasoningHe'
    | 'geminiClinicalNarrative'
  >
> {
  const caseStory =
    extractNarrativeCaseStory(fields.caseStory.trim()) ||
    stripIntakeSystemArtifacts(fields.caseStory.trim());
  const diagnosis = fields.diagnosis.trim();
  const differentialDiagnosis = fields.differentialDiagnosis.map((s) => s.trim()).filter(Boolean);
  const precautionsHe = fields.precautionsHe.map((s) => s.trim()).filter(Boolean);
  const recommendedTestsHe = fields.recommendedTestsHe.map((s) => s.trim()).filter(Boolean);
  const clinicalConclusionsHe = fields.clinicalConclusionsHe.map((s) => s.trim()).filter(Boolean);
  const redFlags = fields.redFlags.map((s) => s.trim()).filter(Boolean);

  const clinicalIntakeAiInsights: ClinicalIntakeAiInsights = clinicalInsightsToSavePayload({
    differentialDiagnosis,
    precautionsHe,
    recommendedTestsHe,
    redFlags,
    clinicalConclusions: clinicalConclusionsHe,
  });

  const clinicalIntakeProfile = normalizeClinicalIntakeProfileForStorage(
    fields.clinicalIntakeProfile
  );
  const medicalProfileMetadata = medicalHistoryToProfileMetadata(
    clinicalIntakeProfile?.medical_history
  );

  return {
    /** clinical_story → intakeStory + therapistNotes */
    ...(caseStory ? { intakeStory: caseStory, therapistNotes: caseStory } : {}),
    ...(diagnosis ? { diagnosis } : {}),
    /** vas_score → intakeVasScore */
    ...(fields.vasScore != null && Number.isFinite(fields.vasScore)
      ? { intakeVasScore: Math.min(10, Math.max(0, Math.round(fields.vasScore))) }
      : {}),
    /** Objective metrics — ROM, MMT, special tests, medical history, goals */
    ...(clinicalIntakeProfile ? { clinicalIntakeProfile } : {}),
    ...(medicalProfileMetadata ? { medicalProfileMetadata } : {}),
    /** Structured AI clinical notes — separate from case story */
    clinicalIntakeAiInsights,
    clinicalReasoningHe: clinicalConclusionsHe,
    geminiClinicalNarrative: formatClinicalIntakeInsightsNarrative({
      diagnosis,
      differentialDiagnosis,
      clinicalConclusions: clinicalConclusionsHe,
      precautions: precautionsHe,
      redFlags,
      recommendedTests: recommendedTestsHe,
      storySummary: caseStory.slice(0, 400),
    }),
  };
}
