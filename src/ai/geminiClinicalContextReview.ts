import type { Patient } from '../types';
import { bodyAreaLabels } from '../types';
import { geminiGenerateText, getGeminiApiKey } from './geminiClient';

const LOG_PREFIX = '[GeminiClinicalContextReview]';

export type ClinicalContextReviewResult = {
  trends: string[];
  aiSuggestion: string | null;
  evaluationDraft: string;
};

function patientJsonLite(patient: Patient): string {
  const pain = [...patient.analytics.painHistory]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-8);
  const sessions = [...patient.analytics.sessionHistory]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 8);

  return JSON.stringify(
    {
      age: patient.age,
      diagnosisField: patient.diagnosis,
      primaryBodyAreaLabel: bodyAreaLabels[patient.primaryBodyArea],
      hasRedFlag: patient.hasRedFlag,
      streak: patient.currentStreak,
      painHistoryRecent: pain,
      sessionHistoryRecent: sessions,
    },
    null,
    2
  );
}

function parseJsonResult(raw: string): ClinicalContextReviewResult | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const o = JSON.parse(trimmed) as Record<string, unknown>;
    const trends = Array.isArray(o.trends)
      ? (o.trends as unknown[]).map((x) => String(x).trim()).filter(Boolean)
      : [];
    const aiSuggestion =
      o.aiSuggestion === null || o.aiSuggestion === undefined
        ? null
        : String(o.aiSuggestion).trim() || null;
    const evaluationDraft =
      typeof o.evaluationDraft === 'string' ? o.evaluationDraft.trim() : '';
    if (!evaluationDraft) return null;
    return { trends, aiSuggestion, evaluationDraft };
  } catch {
    return null;
  }
}

/**
 * ניתוח טקסט תיעוד מול נתוני exercise_plans ו־session_history (טקסט מובנה) + אגרגטים מקומיים.
 */
export async function analyzeClinicalNoteWithSupabaseContext(
  patient: Patient,
  therapistDraft: string,
  supabaseDatastoreJson: string
): Promise<ClinicalContextReviewResult> {
  if (!getGeminiApiKey()) {
    throw new Error('נדרש חיבור ל־Supabase ופרסום gemini-proxy + GEMINI_API_KEY');
  }

  const draft = therapistDraft.trim();
  if (!draft) {
    throw new Error('הזינו טקסט לפני ניתוח');
  }

  const systemInstruction = `אתה עוזר תיעוד קליני לפיזיותרפיסט.
חוקים:
- עברית מקצועית, תמציתית.
- אין אבחנה סופית ואין התחייבות רפואית — הצעות והערות לשיקול מטפל בלבד.
- נתח את נתוני exercise_plans ו־session_history ב־JSON (Supabase) לעומת הטקסט שהמטפל כותב עכשיו.
- זהה מגמות (למשל עלייה בכאב בשלושת הסשנים האחרונים, ירידה בהשלמת תרגילים, קושי מול העלאת נפח).
- אם הטקסט החדש סותר במפורש את המגמה האחרונה, כתוב הצעה פרואקטיבית קצרה בשדה aiSuggestion (משפט אחד או שניים). אחרת null.
- evaluationDraft: טיוטת סיכום קליני מובנית (פסקאות קצרות עם כותרות משנה), שניתן לעריכה לפני שמירה — משלב את מה שכתב המטפל עם הנתונים.

החזר **רק** JSON תקין. דוגמה למבנה:
{"trends":["מגמה 1"],"aiSuggestion":null,"evaluationDraft":"טקסט מלא"}

כאשר aiSuggestion הוא מחרוזת קצרה או null.`;

  const userText = `פרופיל מטופל (מקומי, משלים):
${patientJsonLite(patient)}

נתוני exercise_plans ו־session_history (Supabase, כפי שנמשכו מהשירות):
${supabaseDatastoreJson}

טקסט תיעוד / תוכנית שהמטפל מקליד כעת:
${draft}`;

  const raw = await geminiGenerateText({
    systemInstruction,
    userText,
    temperature: 0.2,
    responseMimeType: 'application/json',
    logPrefix: LOG_PREFIX,
    logDetail: { mode: 'clinical_context_review', patientId: patient.id },
  });

  const parsed = parseJsonResult(raw);
  if (parsed) return parsed;

  return {
    trends: ['לא ניתן לפרש את תשובת ה־AI במבנה JSON — ערכו ידנית את הטיוטה למטה.'],
    aiSuggestion: null,
    evaluationDraft: raw.trim() || draft,
  };
}
