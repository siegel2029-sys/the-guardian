import type { Patient } from '../types';
import { bodyAreaLabels } from '../types';
import { geminiGenerateText, getGeminiApiKey } from './geminiClient';
import type { ClinicalTimelineEntry, TreatmentAiInsights } from '../types';

const LOG_PREFIX = '[GeminiTreatmentAiInsights]';

function intakeContextJson(patient: Patient): string {
  const arch = patient.initialIntakeArchive;
  if (arch) {
    return JSON.stringify(
      {
        capturedAt: arch.capturedAt,
        primaryBodyArea: bodyAreaLabels[arch.primaryBodyArea],
        diagnosis: arch.diagnosis,
        therapistNotes: arch.therapistNotes,
        geminiClinicalNarrative: arch.geminiClinicalNarrative,
        extras: arch.extras,
        libraryExerciseIds: arch.libraryExerciseIds,
      },
      null,
      2
    );
  }
  return JSON.stringify(
    {
      note: 'אין צילום אינטייק שמור — מוצג מצב נוכחי כקשר ראשוני',
      primaryBodyArea: bodyAreaLabels[patient.primaryBodyArea],
      diagnosis: patient.diagnosis,
      therapistNotes: patient.therapistNotes,
      geminiClinicalNarrative: patient.geminiClinicalNarrative,
      injuryHighlightSegments: (patient.injuryHighlightSegments ?? []).map((a) => bodyAreaLabels[a]),
    },
    null,
    2
  );
}

function pastTreatmentsText(entries: ClinicalTimelineEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return sorted
    .map((e, i) => {
      const d = new Date(e.createdAt).toLocaleString('he-IL', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
      return `--- סשן ${i + 1} (${d}) ---\n${e.text.trim()}`;
    })
    .join('\n\n');
}

function parseInsights(raw: string, generatedAt: string): TreatmentAiInsights | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const o = JSON.parse(trimmed) as Record<string, unknown>;
    const patientProgress = String(o.patientProgress ?? '').trim();
    const recommendations = String(o.recommendations ?? '').trim();
    const exerciseModifications = String(o.exerciseModifications ?? '').trim();
    if (!patientProgress && !recommendations && !exerciseModifications) return null;
    return { patientProgress, recommendations, exerciseModifications, generatedAt };
  } catch {
    return null;
  }
}

/**
 * ניתוח אינטייק, עמידה בתוכנית / ביצועים (מ־Supabase), ותיעודי טיפול קודמים — פלט מובנה למטפל.
 */
export async function analyzeTreatmentAiInsights(
  patient: Patient,
  currentSessionNote: string,
  supabaseDatastoreJson: string
): Promise<TreatmentAiInsights> {
  if (!getGeminiApiKey()) {
    throw new Error('נדרש חיבור ל־Supabase ופרסום gemini-proxy + GEMINI_API_KEY');
  }

  const timeline = patient.clinicalTimeline ?? [];
  const generatedAt = new Date().toISOString();
  const draft = currentSessionNote.trim();
  const pastBlock = pastTreatmentsText(timeline);

  const systemInstruction = `אתה עוזר קליני לפיזיותרפיסט (השלמה, לא פסיכולוג ולא רופא מחליף).

חוקים:
- עברית מקצועית ותמציתית.
- אין אבחנה רפואית סופית ואין התחייבות — רק פרשנות קלינית והמלצות לשיקול המטפל.
- התבסס על: (1) נתוני אינטייק ב־JSON, (2) נתוני תוכנית אימונים והשלמות מ־Supabase, (3) רשימת תיעודי טיפול קודמים, (4) אם סופק — טקסט תיעוד לסשן הנוכחי (טיוטה).
- שדה patientProgress: פרשנות התקדמות/מגמות קליניות מהנתונים.
- שדה recommendations: המלצות להמשך או שינוי כללי בתכנית הטיפול.
- שדה exerciseModifications: התאמות קונקרטיות לתרגילים (נפח, תדר, חלופות) — בהתאם לנתונים; אם אין מספיק בסיס — ציין זאת בקצרה.

החזר רק JSON תקין במבנה:
{"patientProgress":"...","recommendations":"...","exerciseModifications":"..."}`;

  const userText = `מזהה מטופל פנימי (לא שם): ${patient.id}
גיל: ${patient.age}
מוקד גוף עיקרי (תווית): ${bodyAreaLabels[patient.primaryBodyArea]}

=== אינטייק (JSON) ===
${intakeContextJson(patient)}

=== תוכניות / סשנים אחרונים (Supabase JSON) ===
${supabaseDatastoreJson}

=== תיעודי טיפול קודמים (כרונולוגי) ===
${pastBlock.trim() ? pastBlock : '(אין עדיין תיעוד טיפול שמור במערכת)'}

=== תיעוד סשן נוכחי (טיוטה, עשוי להיות ריק) ===
${draft || '(ריק — נתח לפי אינטייק, תרגול והיסטוריה בלבד)'}`;

  const raw = await geminiGenerateText({
    systemInstruction,
    userText,
    temperature: 0.25,
    responseMimeType: 'application/json',
    logPrefix: LOG_PREFIX,
    logDetail: { mode: 'treatment_ai_insights', patientId: patient.id },
  });

  const parsed = parseInsights(raw, generatedAt);
  if (parsed) return parsed;

  return {
    patientProgress: 'לא ניתן לפרש את תשובת ה־AI כ־JSON. טקסט גולמי:',
    recommendations: raw.trim().slice(0, 2000) || '(ריק)',
    exerciseModifications: 'נסו שוב או פנו לתמיכה אם החוסר חוזר.',
    generatedAt,
  };
}
