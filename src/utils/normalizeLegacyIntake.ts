import type { ClinicalIntakeAiInsights, Patient, PatientClinicalIntakeProfile } from '../types';
import { buildClinicalIntakeInsightsDisplay } from './clinicalIntakeInsightsDisplay';
import {
  collectLegacyClinicalIntakeTexts,
  mergeClinicalIntakeProfilesGapFill,
  parseClinicalIntakeProfileFromLegacyText,
  resolveCoreLegacyIntakeSummaryText,
} from './clinicalIntakeProfileMigration';
import { isClinicalIntakeProfileEmpty } from './clinicalIntakeTemplate';
import {
  extractNarrativeCaseStory,
  stripIntakeSystemArtifacts,
} from './clinicalIntakeNarrativeExtract';

export type NormalizedLegacyIntake = {
  /** Narrative-only case story (subjective) */
  caseStory: string;
  /** Objective metrics — ROM, MMT, special tests, medical history, goals */
  clinicalIntakeProfile?: PatientClinicalIntakeProfile;
  /** AI insight lists extracted or inferred from legacy blob */
  aiInsights: ClinicalIntakeAiInsights;
  /** VAS 0–10 when found in legacy text */
  vasScore: number | null;
  /** True when input contained a non-empty legacy blob */
  hadLegacyBlob: boolean;
  /** Structured profile field names that were filled from legacy */
  filledProfileFields: string[];
};

function listProfileFields(profile: PatientClinicalIntakeProfile | undefined): string[] {
  if (!profile) return [];
  const fields: string[] = [];
  if ((profile.ranges?.length ?? 0) > 0) fields.push('ranges');
  if (profile.muscle_strength?.trim()) fields.push('muscle_strength');
  if ((profile.special_tests?.length ?? 0) > 0) fields.push('special_tests');
  if (profile.medical_history?.backgroundDiseases?.trim()) fields.push('backgroundDiseases');
  if (profile.medical_history?.chronicMedications?.trim()) fields.push('chronicMedications');
  if ((profile.goals?.length ?? 0) > 0) fields.push('goals');
  return fields;
}

function extractVasFromText(text: string): number | null {
  const patterns = [
    /(?:VAS|מדד\s*כאב|כאב)[^\d]{0,20}(\d{1,2})(?:\s*\/\s*10)?/i,
    /(\d{1,2})\s*\/\s*10(?:\s*כאב)?/i,
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (!m?.[1]) continue;
    const n = Number.parseInt(m[1], 10);
    if (Number.isFinite(n) && n >= 0 && n <= 10) return n;
  }
  return null;
}

function normalizeFromTextBlob(raw: string): NormalizedLegacyIntake {
  const text = raw.trim();
  if (!text) {
    return {
      caseStory: '',
      aiInsights: {},
      vasScore: null,
      hadLegacyBlob: false,
      filledProfileFields: [],
    };
  }

  const profile = parseClinicalIntakeProfileFromLegacyText(text);
  const caseStory =
    extractNarrativeCaseStory(text) || stripIntakeSystemArtifacts(text);
  const insights = buildClinicalIntakeInsightsDisplay({
    intakeStory: text,
    therapistNotes: text,
    geminiClinicalNarrative: text,
  } as Patient);

  const aiInsights: ClinicalIntakeAiInsights = {
    differentialDiagnosis: insights.differentialDiagnosis,
    precautionsHe: insights.precautions,
    recommendedTestsHe: insights.recommendedTests,
    clinicalConclusionsHe: insights.clinicalConclusions,
    redFlags: insights.redFlags,
    ...(insights.redFlagAnalysis ? { redFlagAnalysis: insights.redFlagAnalysis } : {}),
  };

  return {
    caseStory,
    ...(profile && !isClinicalIntakeProfileEmpty(profile) ? { clinicalIntakeProfile: profile } : {}),
    aiInsights,
    vasScore: extractVasFromText(text),
    hadLegacyBlob: true,
    filledProfileFields: listProfileFields(profile),
  };
}

/**
 * Parses a legacy intake text blob (or full patient record) into structured fields:
 * Case Story, Objective Metrics, VAS, and AI insight lists.
 */
export function normalizeLegacyIntake(legacyData: string | Patient): NormalizedLegacyIntake {
  if (typeof legacyData === 'string') {
    return normalizeFromTextBlob(legacyData);
  }

  try {
    const patient = legacyData;
    const core = resolveCoreLegacyIntakeSummaryText(patient);
    const texts = collectLegacyClinicalIntakeTexts(patient);
    const hadLegacyBlob = Boolean(core?.trim() || texts.length > 0);

    let mergedProfile: PatientClinicalIntakeProfile = {};
    for (const text of texts) {
      const parsed = parseClinicalIntakeProfileFromLegacyText(text);
      if (parsed) {
        mergedProfile = mergeClinicalIntakeProfilesGapFill(mergedProfile, parsed);
      }
    }
    mergedProfile = mergeClinicalIntakeProfilesGapFill(
      mergedProfile,
      patient.clinicalIntakeProfile,
      patient.initialIntakeArchive?.extras?.clinicalIntakeProfile
    );

    const primaryText = core ?? texts[0] ?? '';
    const fromText = primaryText ? normalizeFromTextBlob(primaryText) : null;

    const insightsDisplay = buildClinicalIntakeInsightsDisplay(patient);
    const aiInsights: ClinicalIntakeAiInsights = {
      differentialDiagnosis:
        patient.clinicalIntakeAiInsights?.differentialDiagnosis ??
        patient.initialIntakeArchive?.extras?.clinicalIntakeAiInsights?.differentialDiagnosis ??
        fromText?.aiInsights.differentialDiagnosis ??
        insightsDisplay.differentialDiagnosis,
      precautionsHe:
        patient.clinicalIntakeAiInsights?.precautionsHe ??
        fromText?.aiInsights.precautionsHe ??
        insightsDisplay.precautions,
      recommendedTestsHe:
        patient.clinicalIntakeAiInsights?.recommendedTestsHe ??
        fromText?.aiInsights.recommendedTestsHe ??
        insightsDisplay.recommendedTests,
      clinicalConclusionsHe:
        patient.clinicalIntakeAiInsights?.clinicalConclusionsHe ??
        patient.clinicalReasoningHe ??
        fromText?.aiInsights.clinicalConclusionsHe ??
        insightsDisplay.clinicalConclusions,
      redFlags:
        patient.clinicalIntakeAiInsights?.redFlags ??
        fromText?.aiInsights.redFlags ??
        insightsDisplay.redFlags,
    };

    const caseStory =
      extractNarrativeCaseStory(primaryText) ||
      fromText?.caseStory ||
      insightsDisplay.storySummary ||
      stripIntakeSystemArtifacts(primaryText);

    const vasFromPatient = patient.intakeVasScore;
    const vasScore =
      vasFromPatient != null && Number.isFinite(vasFromPatient)
        ? Math.min(10, Math.max(0, vasFromPatient))
        : fromText?.vasScore ?? extractVasFromText(primaryText);

    const profileEmpty = isClinicalIntakeProfileEmpty(mergedProfile);

    return {
      caseStory,
      ...(profileEmpty ? {} : { clinicalIntakeProfile: mergedProfile }),
      aiInsights,
      vasScore,
      hadLegacyBlob,
      filledProfileFields: listProfileFields(profileEmpty ? undefined : mergedProfile),
    };
  } catch {
    return {
      caseStory: '',
      aiInsights: {},
      vasScore: null,
      hadLegacyBlob: false,
      filledProfileFields: [],
    };
  }
}
