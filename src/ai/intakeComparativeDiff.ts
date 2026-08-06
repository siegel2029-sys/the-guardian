/**
 * Client-side structured diff for comparative intake Gemini prompts.
 * Sends changed fields + short baselines instead of stacked full JSON archives.
 */

import type {
  ClinicalIntakeAiInsights,
  Patient,
  PatientClinicalIntakeProfile,
} from '../types';
import { bodyAreaLabels } from '../types';
import type { MedicalIntakeAnalysisSchema } from '../utils/medicalIntakeSchema';
import {
  CLINICAL_PROMPT_CONTEXT_LIMITS,
  clipText,
  compactJson,
} from './buildClinicalPromptContext';

export type ComparativeBaselineIntake = {
  caseStory: string;
  vasScore: number | null;
  clinicalIntakeProfile?: PatientClinicalIntakeProfile;
  aiInsights: ClinicalIntakeAiInsights;
};

export type ComparativeFieldChange = {
  path: string;
  before: unknown;
  after: unknown;
};

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  try {
    return compactJson(value);
  } catch {
    return String(value);
  }
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return stableStringify(a) === stableStringify(b);
}

function pushChange(
  out: ComparativeFieldChange[],
  path: string,
  before: unknown,
  after: unknown,
  maxValueLen: number
): void {
  if (valuesEqual(before, after)) return;
  const clipVal = (v: unknown): unknown => {
    if (typeof v === 'string') return clipText(v, maxValueLen);
    if (Array.isArray(v)) {
      return v.slice(0, 12).map((item) =>
        typeof item === 'string' ? clipText(item, maxValueLen) : item
      );
    }
    return v;
  };
  out.push({ path, before: clipVal(before), after: clipVal(after) });
}

function profileSnapshot(profile?: PatientClinicalIntakeProfile | null): Record<string, unknown> {
  if (!profile) return {};
  return {
    ranges: profile.ranges ?? [],
    muscle_strength: profile.muscle_strength ?? '',
    special_tests: profile.special_tests ?? [],
    goals: profile.goals ?? [],
    backgroundDiseases: profile.medical_history?.backgroundDiseases ?? '',
    chronicMedications: profile.medical_history?.chronicMedications ?? '',
  };
}

function insightsSnapshot(insights?: ClinicalIntakeAiInsights | null): Record<string, unknown> {
  if (!insights) return {};
  return {
    differentialDiagnosis: insights.differentialDiagnosis ?? [],
    precautionsHe: insights.precautionsHe ?? [],
    recommendedTestsHe: insights.recommendedTestsHe ?? [],
    clinicalConclusionsHe: insights.clinicalConclusionsHe ?? [],
    redFlags: insights.redFlags ?? [],
  };
}

function schemaSnapshot(schema?: MedicalIntakeAnalysisSchema | null): Record<string, unknown> {
  if (!schema) return {};
  return {
    clinical_story: schema.clinical_story ?? '',
    pain_score: schema.pain_score ?? null,
    strength_metrics: schema.strength_metrics ?? '',
    rom_metrics: schema.rom_metrics ?? '',
    diagnosis: schema.diagnosis ?? '',
    ai_conclusions: schema.ai_conclusions ?? [],
    recommendations: schema.recommendations ?? [],
    differential_diagnosis: schema.differential_diagnosis ?? [],
    precautions: schema.precautions ?? [],
    red_flags: schema.red_flags ?? [],
  };
}

/**
 * Build a compact comparative payload: short baselines + only changed fields.
 */
export function buildIntakeComparativeDiffPayload(params: {
  patient: Patient;
  structuredBaseline: ComparativeBaselineIntake;
  currentSchema?: MedicalIntakeAnalysisSchema;
  scrub: (s: string) => string;
}): Record<string, unknown> {
  const lim = CLINICAL_PROMPT_CONTEXT_LIMITS.comparative;
  const { patient, structuredBaseline, currentSchema, scrub } = params;
  const changes: ComparativeFieldChange[] = [];

  const baselineStory = scrub(structuredBaseline.caseStory ?? '');
  const currentStory = scrub(
    currentSchema?.clinical_story?.trim() ||
      patient.intakeStory?.trim() ||
      patient.therapistNotes?.trim() ||
      ''
  );
  const baselineVas = structuredBaseline.vasScore;
  const currentVas = currentSchema?.pain_score ?? patient.intakeVasScore ?? null;
  const baselineDiagnosis = scrub(
    typeof patient.initialIntakeArchive?.diagnosis === 'string'
      ? patient.initialIntakeArchive.diagnosis
      : ''
  );
  const currentDiagnosis = scrub(
    (currentSchema?.diagnosis?.trim() || patient.diagnosis || '').trim()
  );

  pushChange(changes, 'caseStory', baselineStory, currentStory, lim.fieldValue);
  pushChange(changes, 'vasScore', baselineVas, currentVas, lim.fieldValue);
  pushChange(changes, 'diagnosis', baselineDiagnosis, currentDiagnosis, lim.fieldValue);

  const baseProfile = profileSnapshot(structuredBaseline.clinicalIntakeProfile);
  const curProfile = profileSnapshot(
    patient.clinicalIntakeProfile ?? structuredBaseline.clinicalIntakeProfile
  );
  // Prefer current schema metrics when present for strength/ROM.
  if (currentSchema) {
    curProfile.muscle_strength =
      typeof currentSchema.strength_metrics === 'string'
        ? currentSchema.strength_metrics
        : compactJson(currentSchema.strength_metrics);
    curProfile.ranges =
      typeof currentSchema.rom_metrics === 'string'
        ? currentSchema.rom_metrics.split(/\n+/).map((s) => s.trim()).filter(Boolean)
        : curProfile.ranges;
  }
  for (const key of Object.keys({ ...baseProfile, ...curProfile })) {
    pushChange(
      changes,
      `clinicalIntakeProfile.${key}`,
      baseProfile[key],
      curProfile[key],
      lim.fieldValue
    );
  }

  const baseInsights = insightsSnapshot(structuredBaseline.aiInsights);
  const curInsights = insightsSnapshot(
    patient.clinicalIntakeAiInsights ?? structuredBaseline.aiInsights
  );
  for (const key of Object.keys({ ...baseInsights, ...curInsights })) {
    pushChange(
      changes,
      `aiInsights.${key}`,
      baseInsights[key],
      curInsights[key],
      lim.fieldValue
    );
  }

  if (currentSchema) {
    const baseSchemaLike = {
      clinical_story: baselineStory,
      pain_score: baselineVas,
      strength_metrics: String(baseProfile.muscle_strength ?? ''),
      rom_metrics: Array.isArray(baseProfile.ranges)
        ? (baseProfile.ranges as string[]).join('\n')
        : '',
      diagnosis: baselineDiagnosis,
      ai_conclusions: baseInsights.clinicalConclusionsHe ?? [],
      recommendations: baseInsights.recommendedTestsHe ?? [],
      differential_diagnosis: baseInsights.differentialDiagnosis ?? [],
      precautions: baseInsights.precautionsHe ?? [],
      red_flags: baseInsights.redFlags ?? [],
    };
    const curSchemaSnap = schemaSnapshot(currentSchema);
    for (const key of Object.keys(curSchemaSnap)) {
      // Already covered top-level story/vas/diagnosis above — skip duplicates.
      if (key === 'clinical_story' || key === 'pain_score' || key === 'diagnosis') continue;
      pushChange(
        changes,
        `currentSchema.${key}`,
        (baseSchemaLike as Record<string, unknown>)[key],
        curSchemaSnap[key],
        lim.fieldValue
      );
    }
  }

  const pain = [...patient.analytics.painHistory]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-lim.painRows)
    .map((r) => ({
      date: r.date,
      bodyArea: r.bodyArea,
      pain0to10: r.painLevel,
    }));
  const sessions = [...patient.analytics.sessionHistory]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, lim.sessions)
    .map((s) => ({
      date: s.date,
      done: `${s.exercisesCompleted}/${s.totalExercises}`,
      difficulty: s.difficultyRating,
    }));

  return {
    baseline: {
      diagnosis: clipText(baselineDiagnosis, lim.storyPreview) || null,
      vasScore: baselineVas,
      caseStoryPreview: clipText(baselineStory, lim.storyPreview) || null,
      primaryBodyArea: bodyAreaLabels[patient.primaryBodyArea],
      hasClinicalIntakeProfile: Boolean(structuredBaseline.clinicalIntakeProfile),
    },
    current: {
      diagnosis: clipText(currentDiagnosis, lim.storyPreview) || null,
      vasScore: currentVas,
      caseStoryPreview: clipText(currentStory, lim.storyPreview) || null,
      primaryBodyArea: bodyAreaLabels[patient.primaryBodyArea],
      status: patient.status,
    },
    changedFields: changes.slice(0, lim.changedFields),
    changedFieldCount: changes.length,
    unchangedHint:
      changes.length === 0
        ? 'No structural field diffs detected between baseline intake and current care — focus on recent pain/sessions.'
        : null,
    recentPain: pain,
    recentSessions: sessions,
  };
}
