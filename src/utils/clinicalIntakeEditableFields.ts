import type { ClinicalIntakeAiInsights, Patient } from '../types';
import { resolveCoreLegacyIntakeSummaryText } from './clinicalIntakeProfileMigration';
import { buildClinicalIntakeInsightsDisplay } from './clinicalIntakeInsightsDisplay';
import {
  clinicalInsightsToSavePayload,
  formatClinicalIntakeInsightsNarrative,
} from './clinicalIntakeInsightsDisplay';

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

  const caseStory =
    resolveCoreLegacyIntakeSummaryText(patient) ??
    patient.intakeStory?.trim() ??
    ex?.intakeStory?.trim() ??
    insights.storySummary ??
    '';

  const vasFromPatient = patient.intakeVasScore;
  const painHistory = patient.analytics?.painHistory ?? [];
  const latestPain = [...painHistory].sort((a, b) => b.date.localeCompare(a.date))[0]?.painLevel;

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
    differentialDiagnosis: ensureList(
      stored?.differentialDiagnosis ?? insights.differentialDiagnosis
    ),
    precautionsHe: ensureList(stored?.precautionsHe ?? insights.precautions),
    recommendedTestsHe: ensureList(
      stored?.recommendedTestsHe ?? insights.recommendedTests
    ),
    clinicalConclusionsHe: ensureList(
      stored?.clinicalConclusionsHe ??
        patient.clinicalReasoningHe ??
        ex?.clinicalReasoningHe ??
        insights.clinicalConclusions
    ),
    redFlags: ensureList(stored?.redFlags ?? insights.redFlags),
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
  const caseStory = fields.caseStory.trim();
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
    ...(caseStory ? { intakeStory: caseStory, therapistNotes: caseStory } : {}),
    ...(diagnosis ? { diagnosis } : {}),
    ...(fields.vasScore != null && Number.isFinite(fields.vasScore)
      ? { intakeVasScore: Math.min(10, Math.max(0, Math.round(fields.vasScore))) }
      : {}),
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
