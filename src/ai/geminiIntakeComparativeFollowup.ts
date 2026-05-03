import type { Patient, PatientIntakeArchive } from '../types';
import { bodyAreaLabels } from '../types';
import { geminiGenerateText, getGeminiApiKey } from './geminiClient';

const LOG_PREFIX = '[GeminiIntakeComparative]';

export type IntakeComparativeAiResult = {
  discrepancies: string[];
  reevaluation: {
    needed: boolean;
    rationaleHe: string;
  };
  comparativeNoteDraft: string;
};

function parseIntakeComparative(raw: string): IntakeComparativeAiResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const o = JSON.parse(trimmed) as Record<string, unknown>;
    const discrepancies = Array.isArray(o.discrepancies)
      ? (o.discrepancies as unknown[]).map((x) => String(x).trim()).filter(Boolean)
      : [];
    const re = o.reevaluation as Record<string, unknown> | undefined;
    const needed = Boolean(re?.needed);
    const rationaleHe =
      typeof re?.rationaleHe === 'string' ? re.rationaleHe.trim() : '';
    const comparativeNoteDraft =
      typeof o.comparativeNoteDraft === 'string' ? o.comparativeNoteDraft.trim() : '';
    if (!comparativeNoteDraft) return null;
    return {
      discrepancies,
      reevaluation: { needed, rationaleHe: rationaleHe || '—' },
      comparativeNoteDraft,
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
      secondaryAreasNow: (p.secondaryClinicalBodyAreas ?? []).map((a) => bodyAreaLabels[a]),
      injuryHighlightsNow: (p.injuryHighlightSegments ?? []).map((a) => bodyAreaLabels[a]),
      geminiClinicalNarrativeNow: p.geminiClinicalNarrative ?? null,
      therapistNotesNow: p.therapistNotes,
      painHistoryRecent: pain,
      sessionHistoryRecent: sessions,
      streak: p.currentStreak,
      hasRedFlag: p.hasRedFlag,
    },
    null,
    2
  );
}

/**
 * השוואת בסיס אינטייק (ארכיון) מול מצב נוכחי + נתוני תוכנית/סשנים מ־Supabase (מחרוזת JSON).
 */
export async function analyzeIntakeVersusCurrentCare(
  patient: Patient,
  intakeArchive: PatientIntakeArchive,
  supabaseDatastoreJson: string
): Promise<IntakeComparativeAiResult> {
  if (!getGeminiApiKey()) {
    throw new Error('נדרש חיבור ל־Supabase ופרסום gemini-proxy + GEMINI_API_KEY');
  }

  const intakeJson = JSON.stringify(intakeArchive, null, 2);

  const systemInstruction = `אתה עוזר קליני לפיזיותרפיסט (מטא־ניתוח בלבד).
חוקים:
- עברית מקצועית, תמציתית.
- אין אבחנה סופית ואין התחייבות רפואית — רק השוואה, פערים, והמלצות לשיקול מטפל.
- השווה בין שדות האינטייק המקוריים (JSON) לבין המצב הנוכחי של המטופל ולנתוני exercise_plans / session_history מהמחרוזת הנוספת.
- discrepancies: רשימת מחרוזות קצרות — סתירות או פערים (למשל «באינטייק הוצע מוקד X; בכאב האחרון דווח Y»).
- reevaluation: needed (boolean) + rationaleHe (1–3 משפטים) — האם מומלץ הערכה מחדש נוכחתית.
- comparativeNoteDraft: טקסט מלא לעריכה ידנית לפני שמירה לציר זמן — כולל סיכום פערים והמלצה.

החזר **רק** JSON תקין:
{"discrepancies":["…"],"reevaluation":{"needed":false,"rationaleHe":"…"},"comparativeNoteDraft":"…"}`;

  const userText = `אינטייק ראשוני (ארכיון, JSON):
${intakeJson}

מצב נוכחי (מקומי, JSON):
${patientCurrentContextLite(patient)}

נתוני Supabase (תוכניות / סשנים):
${supabaseDatastoreJson}`;

  const raw = await geminiGenerateText({
    systemInstruction,
    userText,
    temperature: 0.25,
    responseMimeType: 'application/json',
    logPrefix: LOG_PREFIX,
    logDetail: { mode: 'intake_comparative', patientId: patient.id },
  });

  const parsed = parseIntakeComparative(raw);
  if (parsed) return parsed;

  return {
    discrepancies: ['לא ניתן לפרש את תשובת ה־AI כ־JSON — ערכו את הטיוטה ידנית.'],
    reevaluation: { needed: false, rationaleHe: '—' },
    comparativeNoteDraft: raw.trim() || 'ערכו כאן סיכום השוואתי לפני אישור.',
  };
}
