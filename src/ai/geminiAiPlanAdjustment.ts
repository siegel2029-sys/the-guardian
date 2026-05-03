import type { AiSuggestion, AiSuggestionType, Patient, PatientExercise } from '../types';
import { geminiGenerateText, getGeminiApiKey } from './geminiClient';
import { parseJsonObject } from './geminiClinicalIntake';
import type { AiLongitudinalGateResult } from './aiProgramLongitudinalGate';
import {
  analyzePatientProgress,
  buildPatientProgressPayload,
  type PatientProgressAnalysis,
} from './patientProgressReasoning';

const LOG_PREFIX = '[GeminiAiPlanAdjustment]';

const SUGGESTION_TYPES = new Set<AiSuggestionType>([
  'increase_reps',
  'increase_sets',
  'reduce_reps',
  'add_exercise',
]);

type GeminiPlanAdjustmentRaw = {
  exerciseId?: unknown;
  type?: unknown;
  field?: unknown;
  suggestedValue?: unknown;
  reasonHebrew?: unknown;
};

function clampInt(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function buildHeuristicPlanAdjustment(
  patientId: string,
  clinicalExercises: PatientExercise[],
  analysis: PatientProgressAnalysis,
  options?: { preferEasierReentry?: boolean }
): AiSuggestion | null {
  if (clinicalExercises.length === 0) return null;
  const ex =
    clinicalExercises.find((e) => (e.patientReps ?? e.reps ?? 0) > 0) ?? clinicalExercises[0];
  const currentReps = ex.patientReps ?? ex.reps ?? 10;

  if (options?.preferEasierReentry) {
    const suggested = clampInt(Math.max(1, Math.floor(currentReps * 0.65)), 1, currentReps);
    if (suggested < currentReps) {
      return {
        id: `ai-heuristic-${patientId}-${Date.now()}`,
        patientId,
        exerciseId: ex.id,
        exerciseName: ex.name,
        type: 'reduce_reps',
        field: 'reps',
        currentValue: currentReps,
        suggestedValue: suggested,
        reason:
          'אחרי הפסקה ארוכה המערכת מציעה כניסה חוזרת עדינה יותר (פחות חזרות) כדי לשחזר רצף ולמנוע ניתוק נוסף — יש לאשר עם המטפל.',
        createdAt: new Date().toISOString(),
        status: 'pending',
        source: 'gemini_portal',
      };
    }
  }

  if (analysis.allowExerciseLoadIncrease) {
    const suggested = clampInt(currentReps + 2, 1, 80);
    if (suggested <= currentReps) return null;
    return {
      id: `ai-heuristic-${patientId}-${Date.now()}`,
      patientId,
      exerciseId: ex.id,
      exerciseName: ex.name,
      type: 'increase_reps',
      field: 'reps',
      currentValue: currentReps,
      suggestedValue: suggested,
      reason:
        (analysis.relationshipSummaryHebrew ? `${analysis.relationshipSummaryHebrew} ` : '') +
        'המערכת מציעה להעלות מעט חזרות בזהירות — יש לאשר עם המטפל.',
      createdAt: new Date().toISOString(),
      status: 'pending',
      source: 'gemini_portal',
    };
  }

  const suggested = clampInt(Math.floor(currentReps * 0.7), 1, currentReps);
  return {
    id: `ai-heuristic-${patientId}-${Date.now()}`,
    patientId,
    exerciseId: ex.id,
    exerciseName: ex.name,
    type: 'reduce_reps',
    field: 'reps',
    currentValue: currentReps,
    suggestedValue: suggested,
    reason:
      (analysis.refusalExplanationHebrew ?? analysis.relationshipSummaryHebrew) ||
      'לפי נתוני הכאב והקושי — מומלץ להפחית זמנית עומס. יש לאשר עם המטפל.',
    createdAt: new Date().toISOString(),
    status: 'pending',
    source: 'gemini_portal',
  };
}

function normalizeGeminiRaw(
  raw: unknown,
  patientId: string,
  byId: Map<string, PatientExercise>
): Omit<AiSuggestion, 'id' | 'createdAt' | 'status'> | null {
  const o = raw as GeminiPlanAdjustmentRaw;
  const exerciseId = typeof o.exerciseId === 'string' ? o.exerciseId.trim() : '';
  const ex = exerciseId ? byId.get(exerciseId) : undefined;
  if (!ex) return null;

  const type = typeof o.type === 'string' ? (o.type.trim() as AiSuggestionType) : null;
  if (!type || !SUGGESTION_TYPES.has(type)) return null;

  const field =
    o.field === 'sets' ? ('sets' as const) : o.field === 'weight' ? ('weight' as const) : ('reps' as const);

  let currentValue = 0;
  let suggestedValue = 0;

  if (field === 'reps') {
    currentValue = ex.patientReps ?? ex.reps ?? 0;
    suggestedValue = typeof o.suggestedValue === 'number' ? o.suggestedValue : Number(o.suggestedValue);
  } else if (field === 'sets') {
    currentValue = ex.patientSets ?? ex.sets ?? 0;
    suggestedValue = typeof o.suggestedValue === 'number' ? o.suggestedValue : Number(o.suggestedValue);
  } else {
    currentValue = ex.patientWeightKg ?? 0;
    suggestedValue = typeof o.suggestedValue === 'number' ? o.suggestedValue : Number(o.suggestedValue);
  }

  if (!Number.isFinite(suggestedValue) || !Number.isFinite(currentValue)) return null;

  suggestedValue = clampInt(suggestedValue, 1, field === 'weight' ? 200 : field === 'sets' ? 20 : 100);
  currentValue = clampInt(currentValue, 0, field === 'weight' ? 200 : field === 'sets' ? 20 : 100);

  if (suggestedValue === currentValue) return null;

  let resolvedType: AiSuggestionType = type;
  if (type === 'add_exercise') {
    resolvedType = suggestedValue > currentValue ? 'increase_reps' : 'reduce_reps';
  }

  const reason =
    typeof o.reasonHebrew === 'string' && o.reasonHebrew.trim().length > 0
      ? o.reasonHebrew.trim()
      : 'המלצת AI לשינוי עומס — יש לאשר עם המטפל לפני ביצוע.';

  return {
    patientId,
    exerciseId: ex.id,
    exerciseName: ex.name,
    type: resolvedType,
    field,
    currentValue,
    suggestedValue,
    reason,
    source: 'gemini_portal',
  };
}

export type AiPlanAdjustmentGeminiParams = {
  patient: Patient;
  clinicalExercises: PatientExercise[];
  /** מגמות שזוהו בחלון 4 הימים — רק אחרי שער לונגיטודינלי */
  longitudinalGate: AiLongitudinalGateResult;
};

/**
 * מחזיר הצעת שינוי תוכנית (מבנה AiSuggestion) — מ־Gemini או היוריסטיקה.
 */
export async function fetchAiPlanAdjustmentSuggestion(
  params: AiPlanAdjustmentGeminiParams
): Promise<AiSuggestion | null> {
  const { patient, clinicalExercises, longitudinalGate } = params;
  const payload = buildPatientProgressPayload(patient, clinicalExercises);
  const analysis = analyzePatientProgress(payload);

  if (clinicalExercises.length === 0) {
    return null;
  }

  const byId = new Map(clinicalExercises.map((e) => [e.id, e]));
  const preferEasierReentry = longitudinalGate.triggers.includes('return_from_absence_reengagement');
  const heuristic = buildHeuristicPlanAdjustment(patient.id, clinicalExercises, analysis, {
    preferEasierReentry,
  });

  if (!getGeminiApiKey()) {
    return heuristic;
  }

  const exercisePayload = clinicalExercises.slice(0, 24).map((e) => ({
    id: e.id,
    name: e.name,
    patientReps: e.patientReps ?? e.reps ?? 0,
    patientSets: e.patientSets ?? e.sets ?? 0,
    holdSeconds: e.holdSeconds ?? null,
  }));

  const reengagementExtra = longitudinalGate.geminiExtraInstructionEnglish;

  const systemInstruction = `אתה יועץ שיקום באפליקציה. קהל: מטופל (לא רופא).
החזר אך ורק אובייקט JSON תקין (בלי טקסט מסביב) עם השדות:
- exerciseId: string — חייב להיות אחד מהמזהים ברשימת התרגילים שסופקה
- type: אחד מ: "increase_reps" | "reduce_reps" | "increase_sets" | "add_exercise"
- field: "reps" | "sets" | "weight" — לרוב reps או sets
- suggestedValue: מספר שלם חיובי — הערך המוצע החדש (לא הפרש)
- reasonHebrew: string קצר בעברית (2–4 משפטים) — למה ההמלצה, בשפה פשוטה

כללים:
- כבר זוהו מגמות לונגיטודינליות (שדה longitudinalTrendGate) — התאם את הניסוח וההמלצה רק להן; אל תניח מגמה שלא הופיעה שם.
- התאם את ההמלצה לפי ניתוח PHYSIOSHIELD (שדה JSON guardianAnalysis: כאב, קושי, האם מותר להגביר עומס).
- אם אסור להגביר עומס — העדף reduce_reps או הפחתת סטים; אל תציע increase כשהכאב עולה או גבוה.
- אל תאבחן מחלות. אל תחרוג מתרגילים מהרשימה.
- עבור תרגילי החזקה (reps=0 עם holdSeconds), אפשר לשנות sets או להציע שינוי בזמן החזקה דרך שדה reps כמספר שניות רק אם מתאים — אם לא בטוח, בחר תרגיל עם חזרות מספריות.${
    reengagementExtra
      ? `

Additional instruction (must follow for this patient): ${reengagementExtra}`
      : ''
  }`;

  const userText = `נתונים:
${JSON.stringify(
  {
    longitudinalTrendGate: {
      triggersFired: longitudinalGate.triggers,
      summaryHebrew: longitudinalGate.summaryHebrew,
      reengagementInstructionEnglish: reengagementExtra ?? null,
    },
    guardianAnalysis: {
      painTrend: analysis.painTrend,
      relationshipSummaryHebrew: analysis.relationshipSummaryHebrew,
      allowExerciseLoadIncrease: analysis.allowExerciseLoadIncrease,
      refusalExplanationHebrew: analysis.refusalExplanationHebrew ?? null,
    },
    clinicalExercises: exercisePayload,
  },
  null,
  2
)}

החזר JSON בלבד.`;

  try {
    const rawText = await geminiGenerateText({
      systemInstruction,
      userText,
      temperature: 0.35,
      responseMimeType: 'application/json',
      logPrefix: LOG_PREFIX,
      logDetail: { patientId: patient.id },
    });
    const parsed = parseJsonObject(rawText);
    const normalized = normalizeGeminiRaw(parsed, patient.id, byId);
    if (normalized) {
      return {
        ...normalized,
        id: `ai-gemini-${patient.id}-${Date.now()}`,
        createdAt: new Date().toISOString(),
        status: 'pending',
      };
    }
  } catch (e) {
    console.warn(`${LOG_PREFIX} Gemini failed, using heuristic`, e);
  }

  return heuristic;
}
