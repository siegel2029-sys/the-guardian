import type { IntakeComparativeAiResult } from '../ai/geminiIntakeComparativeFollowup';
import type { PatientClinicalIntakeProfile } from '../types';
import type { ClinicalIntakeEditableFields } from './clinicalIntakeEditableFields';
import { normalizeClinicalIntakeProfileForStorage } from './clinicalIntakeProfilePersist';

/** Strict medical schema — AI must return structured JSON, never a single text blob. */
export type MedicalIntakeAnalysisSchema = {
  clinical_story: string;
  pain_score: number | null;
  strength_metrics: string | Record<string, string>;
  rom_metrics: string | Record<string, string>;
  ai_conclusions: string[];
  recommendations: string[];
  /** Optional structured extras */
  differential_diagnosis?: string[];
  precautions?: string[];
  red_flags?: string[];
  diagnosis?: string;
};

function asStringList(v: unknown, max = 24): string[] {
  if (!Array.isArray(v)) {
    if (typeof v === 'string' && v.trim()) return [v.trim()];
    return [];
  }
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : String(x).trim()))
    .filter(Boolean)
    .slice(0, max);
}

function metricsToString(v: unknown): string {
  if (typeof v === 'string') return v.trim();
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => `${k}: ${typeof val === 'string' ? val.trim() : String(val).trim()}`)
      .filter((line) => line.length > 2)
      .join('\n');
  }
  return '';
}

function romMetricsToRanges(v: unknown): string[] {
  if (typeof v === 'string') {
    return v
      .split(/\r?\n|[;,]/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, val]) => {
        const t = typeof val === 'string' ? val.trim() : String(val).trim();
        return t ? `${k}: ${t}` : '';
      })
      .filter(Boolean);
  }
  return [];
}

function parsePainScore(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) {
    return Math.min(10, Math.max(0, Math.round(v)));
  }
  if (typeof v === 'string' && v.trim()) {
    const n = Number.parseInt(v, 10);
    if (Number.isFinite(n)) return Math.min(10, Math.max(0, n));
  }
  return null;
}

function ensureList(items: string[] | undefined, min = 1): string[] {
  const clean = (items ?? []).map((s) => s.trim()).filter(Boolean);
  return clean.length > 0 ? clean : Array(min).fill('');
}

/** Parse AI JSON into the strict medical schema. */
export function parseMedicalIntakeSchemaFromAi(raw: Record<string, unknown>): MedicalIntakeAnalysisSchema | null {
  const ms = (raw.medical_schema ?? raw.medicalSchema ?? raw) as Record<string, unknown>;

  const clinical_story =
    typeof ms.clinical_story === 'string'
      ? ms.clinical_story.trim()
      : typeof ms.clinicalStory === 'string'
        ? ms.clinicalStory.trim()
        : '';

  const pain_score = parsePainScore(ms.pain_score ?? ms.painScore);
  const strength_metrics = ms.strength_metrics ?? ms.strengthMetrics ?? '';
  const rom_metrics = ms.rom_metrics ?? ms.romMetrics ?? '';

  const ai_conclusions = asStringList(ms.ai_conclusions ?? ms.aiConclusions);
  const recommendations = asStringList(ms.recommendations);

  if (
    !clinical_story &&
    pain_score == null &&
    !metricsToString(strength_metrics) &&
    romMetricsToRanges(rom_metrics).length === 0 &&
    ai_conclusions.length === 0 &&
    recommendations.length === 0
  ) {
    return null;
  }

  return {
    clinical_story,
    pain_score,
    strength_metrics:
      typeof strength_metrics === 'object' && strength_metrics !== null
        ? (strength_metrics as Record<string, string>)
        : metricsToString(strength_metrics),
    rom_metrics:
      typeof rom_metrics === 'object' && rom_metrics !== null
        ? (rom_metrics as Record<string, string>)
        : metricsToString(rom_metrics),
    ai_conclusions,
    recommendations,
    differential_diagnosis: asStringList(ms.differential_diagnosis ?? ms.differentialDiagnosis),
    precautions: asStringList(ms.precautions ?? ms.precautionsHe),
    red_flags: asStringList(ms.red_flags ?? ms.redFlags),
    diagnosis:
      typeof ms.diagnosis === 'string'
        ? ms.diagnosis.trim()
        : undefined,
  };
}

/** Map structured AI JSON → editable intake fields (strength, ROM, case story, etc.). */
export function mapAiResponseToFields(
  aiResponse: MedicalIntakeAnalysisSchema | IntakeComparativeAiResult,
  base?: ClinicalIntakeEditableFields
): ClinicalIntakeEditableFields {
  const schema =
    'medicalSchema' in aiResponse ? aiResponse.medicalSchema : aiResponse;
  return mapMedicalSchemaToEditableFields(schema, base);
}

/** Map medical schema → editable intake fields for the versioned UI. */
export function mapMedicalSchemaToEditableFields(
  schema: MedicalIntakeAnalysisSchema,
  base?: ClinicalIntakeEditableFields
): ClinicalIntakeEditableFields {
  const strength = metricsToString(schema.strength_metrics);
  const ranges = romMetricsToRanges(schema.rom_metrics);

  const profile: PatientClinicalIntakeProfile = normalizeClinicalIntakeProfileForStorage({
    ...(base?.clinicalIntakeProfile ?? {}),
    ...(ranges.length ? { ranges } : {}),
    ...(strength ? { muscle_strength: strength } : {}),
  }) ?? {
    ...(ranges.length ? { ranges } : {}),
    ...(strength ? { muscle_strength: strength } : {}),
  };

  return {
    caseStory: schema.clinical_story || base?.caseStory || '',
    vasScore: schema.pain_score ?? base?.vasScore ?? null,
    diagnosis: schema.diagnosis?.trim() || base?.diagnosis || '',
    differentialDiagnosis: ensureList(
      schema.differential_diagnosis?.length
        ? schema.differential_diagnosis
        : base?.differentialDiagnosis
    ),
    precautionsHe: ensureList(
      schema.precautions?.length ? schema.precautions : base?.precautionsHe
    ),
    recommendedTestsHe: ensureList(
      schema.recommendations.length ? schema.recommendations : base?.recommendedTestsHe
    ),
    clinicalConclusionsHe: ensureList(
      schema.ai_conclusions.length ? schema.ai_conclusions : base?.clinicalConclusionsHe
    ),
    redFlags: ensureList(schema.red_flags?.length ? schema.red_flags : base?.redFlags),
    clinicalIntakeProfile: profile,
  };
}

/** Serialize editable fields back to medical schema (for AI context). */
export function mapEditableFieldsToMedicalSchema(
  fields: ClinicalIntakeEditableFields
): MedicalIntakeAnalysisSchema {
  return {
    clinical_story: fields.caseStory.trim(),
    pain_score: fields.vasScore,
    strength_metrics: fields.clinicalIntakeProfile.muscle_strength?.trim() ?? '',
    rom_metrics: (fields.clinicalIntakeProfile.ranges ?? []).join('\n'),
    ai_conclusions: fields.clinicalConclusionsHe.map((s) => s.trim()).filter(Boolean),
    recommendations: fields.recommendedTestsHe.map((s) => s.trim()).filter(Boolean),
    differential_diagnosis: fields.differentialDiagnosis.map((s) => s.trim()).filter(Boolean),
    precautions: fields.precautionsHe.map((s) => s.trim()).filter(Boolean),
    red_flags: fields.redFlags.map((s) => s.trim()).filter(Boolean),
    diagnosis: fields.diagnosis.trim() || undefined,
  };
}
