import type {
  BodyArea,
  Exercise,
  PatientClinicalIntakeMedicalHistory,
  PatientClinicalIntakeProfile,
  PatientMedicalProfileMetadata,
  ProtocolTrackingState,
  TreatmentProtocolWeek,
} from '../types';
import {
  ensureExerciseBankPrefetched,
  findExerciseInBank,
  getExerciseBank,
  getExerciseBankIdListForPrompt,
} from '../data/exerciseBank';
import { filterToJointBodyAreas, JOINT_BODY_AREAS } from '../body/jointBodyAreas';
import {
  geminiGenerateText,
  getGeminiApiKey,
  getGeminiGenerateContentUrlForLogging,
  getGeminiModelId,
} from './geminiClient';
import {
  collectPatientPhiTokens,
  patientInitialsFromName,
  scrubKnownPatientPhi,
  scrubPhiPatterns,
} from './clinicalConsultantContext';
import { mapInitialIntakeProtocolFromRaw } from '../utils/medicalIntakeSchema';

export { getGeminiApiKey, GeminiRateLimitedError } from './geminiClient';

const LOG_PREFIX = '[GeminiClinicalIntake]';

function validLibIds(): Set<string> {
  return new Set(getExerciseBank().map((e) => e.id));
}

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
  clinicalIntakeProfile?: unknown;
  /** @deprecated — קרא מ־clinicalIntakeProfile.medical_history */
  medicalProfileMetadata?: unknown;
  two_month_protocol?: unknown;
  twoMonthProtocol?: unknown;
  two_month_prognosis?: unknown;
  twoMonthPrognosis?: unknown;
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
  clinicalIntakeProfile: PatientClinicalIntakeProfile | null;
  /** mirror של medical_history לתאימות */
  medicalProfileMetadata: PatientMedicalProfileMetadata | null;
  treatmentProtocol: TreatmentProtocolWeek[] | string;
  prognosisHypothesis: string;
  protocolTrackingState: ProtocolTrackingState;
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

function normalizeMedicalHistory(raw: unknown): PatientClinicalIntakeMedicalHistory | undefined {
  if (raw === null || typeof raw !== 'object') return undefined;
  const o = raw as Record<string, unknown>;
  const backgroundDiseases = asTrimmedString(o.backgroundDiseases);
  const chronicMedications = asTrimmedString(o.chronicMedications);
  if (!backgroundDiseases && !chronicMedications) return undefined;
  return {
    ...(backgroundDiseases ? { backgroundDiseases } : {}),
    ...(chronicMedications ? { chronicMedications } : {}),
  };
}

function normalizeStringList(v: unknown, maxLen = 12): string[] {
  if (typeof v === 'string') {
    const trimmed = v.trim();
    if (!trimmed) return [];
    return trimmed
      .split(/\r?\n|[;,]/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, maxLen);
  }
  return asStringArray(v, maxLen);
}

function normalizeClinicalIntakeProfile(raw: unknown): PatientClinicalIntakeProfile | null {
  if (raw === null || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  const ranges = normalizeStringList(o.ranges, 16);
  const muscle_strength = asTrimmedString(o.muscle_strength) || asTrimmedString(o.strength);
  const special_tests = normalizeStringList(o.special_tests, 16);
  const goals = normalizeStringList(o.goals, 12);
  const medical_history = normalizeMedicalHistory(o.medical_history);

  const profile: PatientClinicalIntakeProfile = {
    ...(ranges.length > 0 ? { ranges } : {}),
    ...(muscle_strength ? { muscle_strength } : {}),
    ...(special_tests.length > 0 ? { special_tests } : {}),
    ...(medical_history ? { medical_history } : {}),
    ...(goals.length > 0 ? { goals } : {}),
  };

  const hasContent =
    (profile.ranges?.length ?? 0) > 0 ||
    !!profile.muscle_strength ||
    (profile.special_tests?.length ?? 0) > 0 ||
    !!profile.medical_history?.backgroundDiseases ||
    !!profile.medical_history?.chronicMedications ||
    (profile.goals?.length ?? 0) > 0;

  return hasContent ? profile : null;
}

function normalizeMedicalProfileMetadata(raw: unknown): PatientMedicalProfileMetadata | null {
  const history = normalizeMedicalHistory(raw);
  if (!history) return null;
  return history;
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
  const allowed = validLibIds();
  const exerciseLibraryIds = [
    ...new Set(rawIds.filter((id) => allowed.has(id))),
  ].slice(0, 5);

  const proposedExercises: Exercise[] = exerciseLibraryIds
    .map((id) => findExerciseInBank(id))
    .filter((e): e is Exercise => e != null);

  const redFlagDetected = inferRedFlagDetected(redFlags, redFlagAnalysis);

  let clinicalIntakeProfile = normalizeClinicalIntakeProfile(o.clinicalIntakeProfile);
  if (!clinicalIntakeProfile) {
    const legacyMedical = normalizeMedicalProfileMetadata(o.medicalProfileMetadata);
    if (legacyMedical) {
      clinicalIntakeProfile = { medical_history: legacyMedical };
    }
  }
  const medicalProfileMetadata =
    clinicalIntakeProfile?.medical_history ??
    normalizeMedicalProfileMetadata(o.medicalProfileMetadata);

  const protocolFields = mapInitialIntakeProtocolFromRaw(o as Record<string, unknown>);

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
    clinicalIntakeProfile,
    medicalProfileMetadata,
    treatmentProtocol: protocolFields.treatmentProtocol,
    prognosisHypothesis: protocolFields.prognosisHypothesis,
    protocolTrackingState: protocolFields.protocolTrackingState,
  };
}

export type AnalyzeIntakeStoryOptions = {
  followUp?: boolean;
  /** Display name / alias tokens to scrub (Hebrew + Latin). */
  patientName?: string | null;
  displayAlias?: string | null;
  portalUsername?: string | null;
  /** Extra explicit tokens (e.g. from intake header). */
  nameTokens?: string[];
};

/**
 * Sends the patient narrative to Gemini and returns a validated clinical case.
 */
export async function analyzeIntakeStoryWithGemini(
  patientStory: string,
  opts?: AnalyzeIntakeStoryOptions
): Promise<GeminiClinicalIntakeResult> {
  if (!getGeminiApiKey()) {
    logError('Supabase not configured or session missing — AI uses Edge Function gemini-proxy');
    throw new Error(
      'Missing Supabase AI setup: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY, deployed gemini-proxy, and GEMINI_API_KEY secret'
    );
  }

  const nameTokens = [
    ...collectPatientPhiTokens({
      name: opts?.patientName?.trim() || '',
      displayAlias: opts?.displayAlias ?? undefined,
      portalUsername: opts?.portalUsername ?? undefined,
    }),
    ...(opts?.nameTokens ?? []),
  ]
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .sort((a, b) => b.length - a.length)
    .slice(0, 32);
  const initials = patientInitialsFromName(opts?.patientName);
  const trimmedStory = scrubKnownPatientPhi(
    scrubPhiPatterns(patientStory.trim()),
    nameTokens,
    initials
  );
  // Ensure in-memory catalog is warm before building the prompt (single-flight prefetch).
  await ensureExerciseBankPrefetched();
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
משימות: נתח את תבנית האינטייק המובנית (אנמנזה, בדיקה פיזיקלית, תפקוד ומטרות); התאם למפת גוף תלת־ממדית (מפרק מוקד, שרשרת).

חובה: חלץ שדות מהטקסט ל־clinicalIntakeProfile בלבד — אל תערבב קטגוריות.
מיפוי קשיח (שדה בתבנית → שדה JSON):
| «טווחי תנועה (ROM…)» | clinicalIntakeProfile.ranges | מערך מחרוזות |
| «כוח שרירים (MMT…)» | clinicalIntakeProfile.muscle_strength | מחרוזת |
| «בדיקות מיוחדות (Special Tests…)» | clinicalIntakeProfile.special_tests | מערך |
| «מחלות רקע (…)» | clinicalIntakeProfile.medical_history.backgroundDiseases | מחרוזת — «ללא» אם ריק |
| «תרופות קבועות» | clinicalIntakeProfile.medical_history.chronicMedications | מחרוזת — «ללא» אם ריק |
| «מטרות המטופל מהשיקום» | clinicalIntakeProfile.goals | מערך |

אל תשים ROM ב־clinicalReasoningHe, כוח ב־redFlags, בדיקות ב־patientQuestions, או מטרות ב־differentialDiagnosis.

הנחיה: סכם דגלים אדומים (Red Flags), הצע אבחנה מבדלת והמלץ על דגשים לתוכנית הטיפול — כולל מיפוי מפרקים במפה התלת־ממדית.

הפלט שלך חייב להיות אך ורק JSON תקף, ללא טקסט לפני או אחרי, ללא Markdown.
השפה הקלינית בעברית חייבת להיות מקצועית, מדויקת ומתאימה לתיעוד קליני.

מבנה JSON נדרש (שמות השדות בדיוק):
{
  "primaryInjuryZoneJoint": "<BodyArea ID יחיד מתוך רשימת המפרקים המורשית>",
  "chainReactionZoneJoints": ["<BodyArea IDs>", "..."],
  "clinicalDiagnosis": "<שורת אבחנה/מצב אחת תמציתית בעברית — מצב, מנגנון, תאריך אם ידוע; ללא פסקאות>",
  "differentialDiagnosis": ["<חלופה 1 בעברית>", "<חלופה 2 בעברית>", "<חלופה 3 בעברית>"],
  "clinicalReasoningHe": ["<שורת נימוק 1>", "<שורת נימוק 2>", "..."],
  "redFlags": ["<דגלים שזוהו, אם אין — מערך ריק>"],
  "redFlagAnalysis": "<הסבר קליני קצר בעברית לגבי דגלים או 'אין דגלים חריגים' אם רלוונטי>",
  "patientQuestions": ["<שאלות/מטרות שהמטופל העלה בסיפור>"],
  "suggestedAnswers": ["<תשובות מקצועיות קצרות בעברית המתאימות לשאלות>"],
  "exerciseLibraryIds": ["<בדיוק 5 מזהי id מהקטלוג>"],
  "clinicalIntakeProfile": {
    "ranges": ["<רשומת ROM 1>", "<רשומת ROM 2>"],
    "muscle_strength": "<סיכום כוח שרירים MMT>",
    "special_tests": ["<בדיקה + תוצאה 1>", "..."],
    "medical_history": {
      "backgroundDiseases": "<מחלות רקע — «ללא» אם לא צוין>",
      "chronicMedications": "<תרופות קבועות — «ללא» אם לא צוין>"
    },
    "goals": ["<מטרת שיקום 1>", "<מטרת שיקום 2>"]
  },
  "two_month_protocol": [
    { "week": 1, "title": "שבוע 1 — …", "milestones": ["…", "…"] }
  ],
  "two_month_prognosis": "<תחזית מקצועית ומעודדת ל-2 חודשים בהנחת ציות — ללא התחייבות רפואית>"
}

כללים:
- primaryInjuryZoneJoint ו-chainReactionZoneJoints: רק ערכים מתוך רשימת המפרקים שסופקה למטה (מחרוזות מדויקות).
- אל תכלול אזורים שאינם מפרקים מהרשימה.
- exerciseLibraryIds: בדיוק 5 מזהים, כל אחד חייב להופיע בקטלוג התרגילים שסופק (שדה id בלבד).
- אם אין דגלים אדומים — redFlags: [] ו-redFlagAnalysis בעברית מקצועית שמסבירה שאין אזהרות מיידיות מהטקסט.
- patientQuestions ו-suggestedAnswers: אותו אורך מערך ככל האפשר (שאלה↔תשובה) לפי הסיפור.
- clinicalIntakeProfile: חובה. שדות ריקים — ranges/special_tests/goals: [] ; muscle_strength: "" ; medical_history: «ללא» לשני השדות.
- clinicalDiagnosis: משפט קליני אחד קצר (לא רשימה ולא כפילות של ROM/כוח/מטרות — אלה רק ב-clinicalIntakeProfile).
- clinicalReasoningHe: עד 3 שורות נימוק, ללא חזרה על אבחנה או ROM/כוח/מטרות.
- two_month_protocol: מערך שבועות (מספר גמיש לפי המקרה, לרוב ~8) עם milestones קונקרטיים — מותאם ל-ROM/MMT/מטרות.
- two_month_prognosis: תחזית מעודדת לציות — ללא התחייבות רפואית.${followUpBlock}`;

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
    nameTokenCount: nameTokens.length,
  });

  const responseText = await geminiGenerateText({
    systemInstruction,
    userText,
    temperature: 0.2,
    responseMimeType: 'application/json',
    logPrefix: LOG_PREFIX,
    logDetail: { storyChars: trimmedStory.length, catalogSize: catalog.length },
    patientInitials: initials,
    nameTokens,
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
