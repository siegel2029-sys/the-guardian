import type { ClinicalIntakeAiInsights, Patient } from '../types';
import { resolveCoreLegacyIntakeSummaryText } from './clinicalIntakeProfileMigration';
import { resolvePatientClinicalIntakeProfile } from './clinicalIntakeProfileDisplay';
import { buildClinicalIntakeInsightsDisplay } from './clinicalIntakeInsightsDisplay';
import {
  clinicalInsightsToSavePayload,
  formatClinicalIntakeInsightsNarrative,
} from './clinicalIntakeInsightsDisplay';
import {
  extractNarrativeCaseStory,
  pruneAiInsightLists,
  stripIntakeSystemArtifacts,
} from './clinicalIntakeNarrativeExtract';

export type ClinicalIntakeEditableFields = {
  caseStory: string;
  vasScore: number | null;
  diagnosis: string;
  differentialDiagnosis: string[];
  precautionsHe: string[];
  recommendedTestsHe: string[];
  clinicalConclusionsHe: string[];
  redFlags: string[];
};

function ensureList(items: string[] | undefined, min = 1): string[] {
  const clean = (items ?? []).map((s) => s.trim()).filter(Boolean);
  return clean.length > 0 ? clean : Array(min).fill('');
}

export function loadClinicalIntakeEditableFields(patient: Patient): ClinicalIntakeEditableFields {
  const insights = buildClinicalIntakeInsightsDisplay(patient);
  const ex = patient.initialIntakeArchive?.extras;
  const stored = patient.clinicalIntakeAiInsights ?? ex?.clinicalIntakeAiInsights;
  const profile = resolvePatientClinicalIntakeProfile(patient);

  const rawStory =
    resolveCoreLegacyIntakeSummaryText(patient) ??
    patient.intakeStory?.trim() ??
    ex?.intakeStory?.trim() ??
    '';

  const caseStory =
    extractNarrativeCaseStory(rawStory) ||
    insights.storySummary ||
    stripIntakeSystemArtifacts(rawStory);

  const vasFromPatient = patient.intakeVasScore;
  const painHistory = patient.analytics?.painHistory ?? [];
  const latestPain = [...painHistory].sort((a, b) => b.date.localeCompare(a.date))[0]?.painLevel;

  const pruned = pruneAiInsightLists(
    {
      differentialDiagnosis: stored?.differentialDiagnosis ?? insights.differentialDiagnosis,
      clinicalConclusionsHe:
        stored?.clinicalConclusionsHe ??
        patient.clinicalReasoningHe ??
        ex?.clinicalReasoningHe ??
        insights.clinicalConclusions,
      precautionsHe: stored?.precautionsHe ?? insights.precautions,
      recommendedTestsHe: stored?.recommendedTestsHe ?? insights.recommendedTests,
      redFlags: stored?.redFlags ?? insights.redFlags,
    },
    { narrative: caseStory, profile }
  );

  return {
    caseStory,
    vasScore:
      vasFromPatient != null && Number.isFinite(vasFromPatient)
        ? Math.min(10, Math.max(0, vasFromPatient))
        : latestPain != null && Number.isFinite(latestPain)
          ? Math.min(10, Math.max(0, latestPain))
          : null,
    diagnosis:
      patient.diagnosis?.trim() ||
      ex?.clinicalDiagnosis?.trim() ||
      insights.diagnosis ||
      '',
    differentialDiagnosis: ensureList(pruned.differentialDiagnosis),
    precautionsHe: ensureList(pruned.precautionsHe),
    recommendedTestsHe: ensureList(pruned.recommendedTestsHe),
    clinicalConclusionsHe: ensureList(pruned.clinicalConclusionsHe),
    redFlags: ensureList(pruned.redFlags),
  };
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

  return {
    /** clinical_story → intakeStory + therapistNotes */
    ...(caseStory ? { intakeStory: caseStory, therapistNotes: caseStory } : {}),
    ...(diagnosis ? { diagnosis } : {}),
    /** vas_score → intakeVasScore */
    ...(fields.vasScore != null && Number.isFinite(fields.vasScore)
      ? { intakeVasScore: Math.min(10, Math.max(0, Math.round(fields.vasScore))) }
      : {}),
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
