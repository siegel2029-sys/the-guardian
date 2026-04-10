import type { BodyArea, Exercise } from '../types';
import { EXERCISE_LIBRARY } from '../data/mockData';
import { getExerciseBankIdListForPrompt } from '../data/exerciseBank';
import { filterToJointBodyAreas, JOINT_BODY_AREAS } from '../body/jointBodyAreas';
import {
  geminiGenerateText,
  getGeminiApiKey,
  getGeminiGenerateContentUrlForLogging,
  getGeminiModelId,
} from './geminiClient';

export { getGeminiApiKey, GeminiRateLimitedError } from './geminiClient';

const LOG_PREFIX = '[GeminiClinicalIntake]';

const VALID_LIB_IDS = new Set(EXERCISE_LIBRARY.map((e) => e.id));

/** Raw JSON shape from the model (strings before validation). */
export type GeminiClinicalCaseRaw = {
  primaryInjuryZoneJoint?: string | null;
  chainReactionZoneJoints?: unknown;
  clinicalDiagnosis?: unknown;
  differentialDiagnosis?: unknown;
  clinicalReasoningHe?: unknown;
  redFlags?: unknown;
  redFlagAnalysis?: unknown;
  patientQuestions?: unknown;
  suggestedAnswers?: unknown;
  exerciseLibraryIds?: unknown;
};

/** Normalized clinical case returned to the app. */
export type GeminiClinicalIntakeResult = {
  primaryInjuryZoneJoint: BodyArea | null;
  chainReactionZoneJoints: BodyArea[];
  clinicalDiagnosis: string;
  differentialDiagnosis: string[];
  clinicalReasoningHe: string[];
  redFlags: string[];
  redFlagAnalysis: string;
  patientQuestions: string[];
  suggestedAnswers: string[];
  redFlagDetected: boolean;
  exerciseLibraryIds: string[];
  proposedExercises: Exercise[];
};

function logInfo(message: string, detail?: Record<string, unknown>): void {
  if (detail) {
    console.info(`${LOG_PREFIX} ${message}`, detail);
  } else {
    console.info(`${LOG_PREFIX} ${message}`);
  }
}

function logError(message: string, detail?: unknown): void {
  console.error(`${LOG_PREFIX} ${message}`, detail ?? '');
}

/**
 * Strips markdown fences and extracts the first balanced `{ ... }` JSON object.
 * Handles leading/trailing prose from the model.
 */
export function parseJsonObject(text: string): unknown {
  let t = text.replace(/^\uFEFF/, '').trim();

  const fenceJson = /^```(?:json)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/im.exec(t);
  if (fenceJson) {
    t = fenceJson[1].trim();
  } else {
    t = t.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();
  }

  const slice = extractFirstBalancedJsonObject(t);
  if (slice) {
    t = slice;
  }

  try {
    return JSON.parse(t) as unknown;
  } catch (firstErr) {
    const loose = t.match(/\{[\s\S]*\}/);
    if (loose && loose[0] !== t) {
      try {
        return JSON.parse(loose[0]) as unknown;
      } catch {
        logError('parseJsonObject: fallback brace match failed', { snippet: loose[0].slice(0, 200) });
      }
    }
    logError('parseJsonObject: JSON.parse failed', { preview: t.slice(0, 280), error: firstErr });
    throw new Error('Invalid AI response: could not parse JSON');
  }
}

function extractFirstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function asTrimmedString(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

function asStringArray(v: unknown, maxLen?: number): string[] {
  if (!Array.isArray(v)) return [];
  const out = v
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
  return maxLen !== undefined ? out.slice(0, maxLen) : out;
}

function inferRedFlagDetected(flags: string[], analysis: string): boolean {
  if (flags.length === 0) return false;
  const blob = `${flags.join(' ')} ${analysis}`.toLowerCase();
  return /night|nocturnal|weight\s*loss|bilateral|neuro|numbness|weakness|cauda|saddle|fever|malignancy|אובדן משקל|כאב לילי|לילה|דו[\s-]?צדדי|נוירולוג|חום|חולשה מתקדמת/i.test(
    blob
  );
}

function normalizeClinicalCase(raw: unknown): GeminiClinicalIntakeResult {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('AI JSON root must be an object');
  }
  const o = raw as GeminiClinicalCaseRaw;

  const primaryFiltered = filterToJointBodyAreas(
    o.primaryInjuryZoneJoint != null && String(o.primaryInjuryZoneJoint).trim() !== ''
      ? [String(o.primaryInjuryZoneJoint)]
      : []
  );
  const primary = primaryFiltered[0] ?? null;

  let chain = filterToJointBodyAreas(asStringArray(o.chainReactionZoneJoints));
  if (primary) chain = chain.filter((a) => a !== primary);

  const clinicalDiagnosis =
    asTrimmedString(o.clinicalDiagnosis) || 'הערכה קלינית (דורשת אימות)';
  const differentialDiagnosis = asStringArray(o.differentialDiagnosis, 5).slice(0, 3);
  const clinicalReasoningHe = asStringArray(o.clinicalReasoningHe, 12);
  const redFlags = asStringArray(o.redFlags, 20);
  const redFlagAnalysis = asTrimmedString(o.redFlagAnalysis);
  const patientQuestions = asStringArray(o.patientQuestions, 15);
  const suggestedAnswers = asStringArray(o.suggestedAnswers, 15);

  const rawIds = asStringArray(o.exerciseLibraryIds, 10);
  const exerciseLibraryIds = [
    ...new Set(rawIds.filter((id) => VALID_LIB_IDS.has(id))),
  ].slice(0, 5);

  const proposedExercises: Exercise[] = exerciseLibraryIds
    .map((id) => EXERCISE_LIBRARY.find((e) => e.id === id))
    .filter((e): e is Exercise => e != null);

  const redFlagDetected = inferRedFlagDetected(redFlags, redFlagAnalysis);

  return {
    primaryInjuryZoneJoint: primary,
    chainReactionZoneJoints: chain,
    clinicalDiagnosis,
    differentialDiagnosis,
    clinicalReasoningHe,
    redFlags,
    redFlagAnalysis,
    patientQuestions,
    suggestedAnswers,
    redFlagDetected,
    exerciseLibraryIds,
    proposedExercises,
  };
}

/**
 * Sends the patient narrative to Gemini and returns a validated clinical case.
 */
export async function analyzeIntakeStoryWithGemini(
  patientStory: string,
  opts?: { followUp?: boolean }
): Promise<GeminiClinicalIntakeResult> {
  if (!getGeminiApiKey()) {
    logError('Missing VITE_GEMINI_API_KEY (or placeholder YOUR_KEY_HERE)');
    throw new Error('Missing VITE_GEMINI_API_KEY');
  }

  const trimmedStory = patientStory.trim();
  const catalog = getExerciseBankIdListForPrompt();
  const jointIds = [...JOINT_BODY_AREAS].join(', ');
  const modelId = getGeminiModelId();
  const urlForLog = getGeminiGenerateContentUrlForLogging();

  const followUpBlock = opts?.followUp
    ? `

מצב אינטייק משכי: המטופל בתחילת טיפול חוזר.
- אל תחזור על שאלות דמוגרפיות או היסטוריה כללית שלא השתנתה.
- התמקד בשינוי: האם הכאב השתנה? איך הייתה התגובה לטיפול האחרון? האם חזרה פעילות פונקציונלית?
`
    : '';

  const systemInstruction = `אתה פיזיותרפיסט אורתופדי בכיר. קהל היעד: פיזיותרפיסט בממשק ניהול.
טון: מקצועי, תמציתי, מבוסס נתונים.
משימות: נתח גם טווחי תנועה (ROM), מבחני כוח ותוצאות אינטייק אם הופיעו בסיפור; התאם למפת גוף תלת־ממדית (מפרק מוקד, שרשרת).

הנחיה: סכם דגלים אדומים (Red Flags), הצע אבחנה מבדלת והמלץ על דגשים לתוכנית הטיפול על בסיס הנתונים שהוזנו — כולל מיפוי מפרקים במפה התלת־ממדית כשסופק.

הפלט שלך חייב להיות אך ורק JSON תקף, ללא טקסט לפני או אחרי, ללא Markdown.
השפה הקלינית בעברית חייבת להיות מקצועית, מדויקת ומתאימה לתיעוד קליני.

מבנה JSON נדרש (שמות השדות בדיוק):
{
  "primaryInjuryZoneJoint": "<BodyArea ID יחיד מתוך רשימת המפרקים המורשית>",
  "chainReactionZoneJoints": ["<BodyArea IDs>", "..."],
  "clinicalDiagnosis": "<אבחנה עיקרית בעברית>",
  "differentialDiagnosis": ["<חלופה 1 בעברית>", "<חלופה 2 בעברית>", "<חלופה 3 בעברית>"],
  "clinicalReasoningHe": ["<שורת נימוק 1>", "<שורת נימוק 2>", "..."],
  "redFlags": ["<דגלים שזוהו, אם אין — מערך ריק>"],
  "redFlagAnalysis": "<הסבר קליני קצר בעברית לגבי דגלים או 'אין דגלים חריגים' אם רלוונטי>",
  "patientQuestions": ["<שאלות/מטרות שהמטופל העלה בסיפור>"],
  "suggestedAnswers": ["<תשובות מקצועיות קצרות בעברית המתאימות לשאלות>"],
  "exerciseLibraryIds": ["<בדיוק 5 מזהי id מהקטלוג>"]
}

כללים:
- primaryInjuryZoneJoint ו-chainReactionZoneJoints: רק ערכים מתוך רשימת המפרקים שסופקה למטה (מחרוזות מדויקות).
- אל תכלול אזורים שאינם מפרקים מהרשימה.
- exerciseLibraryIds: בדיוק 5 מזהים, כל אחד חייב להופיע בקטלוג התרגילים שסופק (שדה id בלבד).
- אם אין דגלים אדומים — redFlags: [] ו-redFlagAnalysis בעברית מקצועית שמסבירה שאין אזהרות מיידיות מהטקסט.
- patientQuestions ו-suggestedAnswers: אותו אורך מערך ככל האפשר (שאלה↔תשובה) לפי הסיפור.${followUpBlock}`;

  const userText = `רשימת מפרקים מורשית (BodyArea IDs בלבד):
${jointIds}

קטלוג תרגילים (id, name, targetArea):
${JSON.stringify(catalog)}

סיפור המטופל / אינטייק:
${trimmedStory}`;

  logInfo('Starting clinical analysis', {
    model: modelId,
    requestUrlKeyRedacted: urlForLog,
    storyChars: trimmedStory.length,
    catalogSize: catalog.length,
  });

  const responseText = await geminiGenerateText({
    systemInstruction,
    userText,
    temperature: 0.2,
    responseMimeType: 'application/json',
    logPrefix: LOG_PREFIX,
    logDetail: { storyChars: trimmedStory.length, catalogSize: catalog.length },
  });

  logInfo('Received model text', { modelId, chars: responseText.length });

  const parsed = parseJsonObject(responseText);
  const normalized = normalizeClinicalCase(parsed);

  logInfo('Analysis normalized successfully', {
    modelUsed: modelId,
    primary: normalized.primaryInjuryZoneJoint,
    chainCount: normalized.chainReactionZoneJoints.length,
    exerciseCount: normalized.exerciseLibraryIds.length,
    redFlagDetected: normalized.redFlagDetected,
  });

  return normalized;
}
