import type {
  ClinicalIntakeAiInsights,
  Patient,
  PatientClinicalIntakeProfile,
  PatientIntakeArchive,
} from '../types';
import { bodyAreaLabels } from '../types';
import { geminiGenerateText, getGeminiApiKey } from './geminiClient';
import { normalizeLegacyIntake } from '../utils/normalizeLegacyIntake';
import { isClinicalIntakeProfileEmpty } from '../utils/clinicalIntakeTemplate';
import {
  mapMedicalSchemaToEditableFields,
  mapEditableFieldsToMedicalSchema,
  parseMedicalIntakeSchemaFromAi,
  type MedicalIntakeAnalysisSchema,
} from '../utils/medicalIntakeSchema';
import type { ClinicalIntakeEditableFields } from '../utils/clinicalIntakeEditableFields';

const LOG_PREFIX = '[GeminiIntakeComparative]';

export type IntakeComparativeStructuredInsights = {
  differentialDiagnosis: string[];
  precautionsHe: string[];
  recommendedTestsHe: string[];
  clinicalConclusionsHe: string[];
  redFlags: string[];
};

export type IntakeComparativeAiResult = {
  discrepancies: string[];
  reevaluation: {
    needed: boolean;
    rationaleHe: string;
  };
  /** Strict medical schema — primary structured output */
  medicalSchema: MedicalIntakeAnalysisSchema;
  /** Legacy compat — mapped from schema */
  structuredInsights: IntakeComparativeStructuredInsights;
  updatedCaseStory: string;
  clinicalIntakeProfile: PatientClinicalIntakeProfile;
  vasScore: number | null;
};

function asStringList(v: unknown, max = 16): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((x) => (typeof x === 'string' ? x.trim() : String(x).trim()))
    .filter(Boolean)
    .slice(0, max);
}

function structuredInsightsFromSchema(
  schema: MedicalIntakeAnalysisSchema
): IntakeComparativeStructuredInsights {
  return {
    differentialDiagnosis: schema.differential_diagnosis ?? [],
    precautionsHe: schema.precautions ?? [],
    recommendedTestsHe: schema.recommendations,
    clinicalConclusionsHe: schema.ai_conclusions,
    redFlags: schema.red_flags ?? [],
  };
}

function parseIntakeComparative(
  raw: string,
  sourceFields?: ClinicalIntakeEditableFields
): IntakeComparativeAiResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const o = JSON.parse(trimmed) as Record<string, unknown>;
    const medicalSchema = parseMedicalIntakeSchemaFromAi(o);
    if (!medicalSchema) return null;

    const discrepancies = asStringList(o.discrepancies);
    const re = o.reevaluation as Record<string, unknown> | undefined;
    const needed = Boolean(re?.needed);
    const rationaleHe =
      typeof re?.rationaleHe === 'string'
        ? re.rationaleHe.trim()
        : typeof re?.rationale_he === 'string'
          ? re.rationale_he.trim()
          : '—';

    const mapped = mapMedicalSchemaToEditableFields(medicalSchema, sourceFields);
    const structuredInsights = structuredInsightsFromSchema(medicalSchema);

    return {
      discrepancies,
      reevaluation: { needed, rationaleHe },
      medicalSchema,
      structuredInsights,
      updatedCaseStory: medicalSchema.clinical_story,
      clinicalIntakeProfile: mapped.clinicalIntakeProfile,
      vasScore: medicalSchema.pain_score,
    };
  } catch {
    return null;
  }
}

function patientCurrentContextLite(p: Patient): string {
  const pain = [...p.analytics.painHistory]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-10);
  const sessions = [...p.analytics.sessionHistory]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 12);

  return JSON.stringify(
    {
      diagnosisNow: p.diagnosis,
      primaryBodyAreaNow: bodyAreaLabels[p.primaryBodyArea],
      painHistoryRecent: pain,
      sessionHistoryRecent: sessions,
      intakeVasScore: p.intakeVasScore ?? null,
      clinicalIntakeProfile: p.clinicalIntakeProfile ?? null,
      clinicalIntakeAiInsights: p.clinicalIntakeAiInsights ?? null,
    },
    null,
    2
  );
}

export type StructuredIntakeForComparative = {
  caseStory: string;
  vasScore: number | null;
  clinicalIntakeProfile?: PatientClinicalIntakeProfile;
  aiInsights: ClinicalIntakeAiInsights;
};

export function buildStructuredIntakeForComparative(
  patient: Patient,
  intakeArchive: PatientIntakeArchive
): StructuredIntakeForComparative {
  const archiveStory =
    intakeArchive.extras?.intakeStory?.trim() ??
    intakeArchive.therapistNotes?.trim() ??
    '';

  const fromArchive = archiveStory ? normalizeLegacyIntake(archiveStory) : null;
  const fromPatient = normalizeLegacyIntake(patient);

  const caseStory =
    fromArchive?.caseStory || fromPatient.caseStory || archiveStory;

  const profile =
    intakeArchive.extras?.clinicalIntakeProfile ??
    fromArchive?.clinicalIntakeProfile ??
    fromPatient.clinicalIntakeProfile;

  const aiInsights: ClinicalIntakeAiInsights = {
    differentialDiagnosis:
      patient.clinicalIntakeAiInsights?.differentialDiagnosis ??
      fromArchive?.aiInsights.differentialDiagnosis ??
      fromPatient.aiInsights.differentialDiagnosis,
    precautionsHe:
      patient.clinicalIntakeAiInsights?.precautionsHe ??
      fromArchive?.aiInsights.precautionsHe ??
      fromPatient.aiInsights.precautionsHe,
    recommendedTestsHe:
      patient.clinicalIntakeAiInsights?.recommendedTestsHe ??
      fromArchive?.aiInsights.recommendedTestsHe ??
      fromPatient.aiInsights.recommendedTestsHe,
    clinicalConclusionsHe:
      patient.clinicalIntakeAiInsights?.clinicalConclusionsHe ??
      fromArchive?.aiInsights.clinicalConclusionsHe ??
      fromPatient.aiInsights.clinicalConclusionsHe,
    redFlags:
      patient.clinicalIntakeAiInsights?.redFlags ??
      fromArchive?.aiInsights.redFlags ??
      fromPatient.aiInsights.redFlags,
  };

  return {
    caseStory,
    vasScore:
      patient.intakeVasScore ?? fromArchive?.vasScore ?? fromPatient.vasScore ?? null,
    ...(profile && !isClinicalIntakeProfileEmpty(profile) ? { clinicalIntakeProfile: profile } : {}),
    aiInsights,
  };
}

const MEDICAL_SCHEMA_PROMPT = `החזר **רק** JSON תקין עם המפתחות הבאים (אין טקסט חופשי מחוץ ל-JSON):

{
  "medical_schema": {
    "clinical_story": "סיפור מקרה סובייקטיבי בלבד — תלונה, מנגנון, התנהגות כאב",
    "pain_score": 0,
    "strength_metrics": "כוח שרירים MMT או אובייקט {\\"שריר\\": \\"4/5\\"}",
    "rom_metrics": "טווחי תנועה או אובייקט {\\"כתף\\": \\"120°\\"}",
    "ai_conclusions": ["מסקנה קלינית 1"],
    "recommendations": ["המלצה לטיפול 1"],
    "differential_diagnosis": ["אבחנה מבדלת"],
    "precautions": ["ממה להיזהר"],
    "red_flags": ["דגל אדום"],
    "diagnosis": "רושם קליני קצר"
  },
  "discrepancies": ["פער בין אינטייק לנוכחי"],
  "reevaluation": { "needed": false, "rationaleHe": "נימוק" }
}

חובה: medical_schema.clinical_story, pain_score (0-10 או null), strength_metrics, rom_metrics, ai_conclusions (מערך), recommendations (מערך).
אסור לשלב ROM/MMT/מסקנות בתוך clinical_story.`;

export async function analyzeIntakeVersusCurrentCare(
  patient: Patient,
  intakeArchive: PatientIntakeArchive,
  supabaseDatastoreJson: string,
  currentFields?: ClinicalIntakeEditableFields
): Promise<IntakeComparativeAiResult> {
  if (!getGeminiApiKey()) {
    throw new Error('נדרש חיבור ל־Supabase ופרסום gemini-proxy + GEMINI_API_KEY');
  }

  const structuredIntake = buildStructuredIntakeForComparative(patient, intakeArchive);
  const currentSchema = currentFields
    ? mapEditableFieldsToMedicalSchema(currentFields)
    : undefined;

  const intakeJson = JSON.stringify(
    { archive: intakeArchive, structured: structuredIntake, currentVersion: currentSchema },
    null,
    2
  );

  const systemInstruction = `אתה עוזר קליני לפיזיותרפיסט (מטא־ניתוח בלבד).
חוקים:
- עברית מקצועית, תמציתית.
- אין אבחנה סופית ואין התחייבות רפואית.
- השווה בין אינטייק ראשוני לבין מצב נוכחי ונתוני תוכנית/סשנים.
- הפלט חייב להיות JSON מובנה בלבד — ללא בלוב טקסט יחיד.

${MEDICAL_SCHEMA_PROMPT}`;

  const userText = `אינטייק ראשוני + גרסה נוכחית (JSON):
${intakeJson}

מצב נוכחי (מקומי):
${patientCurrentContextLite(patient)}

נתוני Supabase:
${supabaseDatastoreJson}`;

  const raw = await geminiGenerateText({
    systemInstruction,
    userText,
    temperature: 0.2,
    responseMimeType: 'application/json',
    logPrefix: LOG_PREFIX,
    logDetail: { mode: 'intake_comparative', patientId: patient.id },
  });

  const parsed = parseIntakeComparative(raw, currentFields);
  if (parsed) return parsed;

  const fallbackSchema: MedicalIntakeAnalysisSchema = {
    clinical_story: currentFields?.caseStory ?? structuredIntake.caseStory,
    pain_score: currentFields?.vasScore ?? structuredIntake.vasScore,
    strength_metrics: currentFields?.clinicalIntakeProfile.muscle_strength ?? '',
    rom_metrics: (currentFields?.clinicalIntakeProfile.ranges ?? []).join('\n'),
    ai_conclusions: ['לא ניתן לפרש את תשובת ה-AI — ערכו ידנית.'],
    recommendations: [],
  };

  const mapped = mapMedicalSchemaToEditableFields(fallbackSchema, currentFields);
  return {
    discrepancies: ['לא ניתן לפרש JSON — נדרש עריכה ידנית.'],
    reevaluation: { needed: false, rationaleHe: '—' },
    medicalSchema: fallbackSchema,
    structuredInsights: structuredInsightsFromSchema(fallbackSchema),
    updatedCaseStory: fallbackSchema.clinical_story,
    clinicalIntakeProfile: mapped.clinicalIntakeProfile,
    vasScore: fallbackSchema.pain_score,
  };
}

export function buildPatientPatchFromComparativeResult(
  result: IntakeComparativeAiResult,
  existing: Pick<Patient, 'diagnosis'>
): Partial<Patient> {
  const mapped = mapMedicalSchemaToEditableFields(result.medicalSchema);
  const si = result.structuredInsights;

  return {
    intakeStory: result.updatedCaseStory,
    therapistNotes: result.updatedCaseStory,
    intakeVasScore: result.vasScore ?? undefined,
    clinicalIntakeProfile: result.clinicalIntakeProfile,
    clinicalIntakeAiInsights: {
      differentialDiagnosis: si.differentialDiagnosis,
      precautionsHe: si.precautionsHe,
      recommendedTestsHe: si.recommendedTestsHe,
      clinicalConclusionsHe: si.clinicalConclusionsHe,
      redFlags: si.redFlags,
    },
    clinicalReasoningHe: si.clinicalConclusionsHe,
    diagnosis: result.medicalSchema.diagnosis?.trim() || existing.diagnosis,
  };
}
