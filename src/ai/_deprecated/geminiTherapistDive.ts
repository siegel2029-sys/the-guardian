// @ts-nocheck
import type { Patient } from '../types';
import { bodyAreaLabels } from '../types';
import {
  collectPatientPhiTokens,
  patientInitialsFromName,
  scrubKnownPatientPhi,
} from './clinicalConsultantContext';
import { geminiGenerateText, getGeminiApiKey } from './geminiClient';

const LOG_PREFIX = '[GeminiTherapistDive]';

function patientJsonForTherapist(patient: Patient, scrub: (s: string) => string): string {
  const pain = [...patient.analytics.painHistory]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-12);
  const sessions = [...patient.analytics.sessionHistory]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  return JSON.stringify(
    {
      age: patient.age,
      diagnosisField: scrub(patient.diagnosis ?? ''),
      primaryBodyArea: patient.primaryBodyArea,
      primaryBodyAreaLabel: bodyAreaLabels[patient.primaryBodyArea],
      injuryHighlightSegments: patient.injuryHighlightSegments,
      injuryHighlightLabels: patient.injuryHighlightSegments.map((a) => bodyAreaLabels[a]),
      secondaryClinicalBodyAreas: patient.secondaryClinicalBodyAreas,
      secondaryLabels: patient.secondaryClinicalBodyAreas.map((a) => bodyAreaLabels[a]),
      hasRedFlag: patient.hasRedFlag,
      levelGamification: patient.level,
      streak: patient.currentStreak,
      painHistoryRecent: pain,
      sessionHistoryRecent: sessions,
      therapistNotesSaved: patient.therapistNotes?.trim()
        ? scrub(patient.therapistNotes.trim())
        : null,
    },
    null,
    2
  );
}

const THERAPIST_BASE = `אתה עוזר קליני לפיזיותרפיסט בממשק ניהול.
טון: מקצועי, תמציתי, מבוסס נתונים.
אל תאבחן סופית; הצע רק רעיונות להמשך הערכה ותכנון טיפול.
השב בעברית בפסקאות קצרות עם כותרות משנה (ללא JSON).
אל תשלב שמות מטופלים או מזהים אישיים בפלט.`;

/** ניתוח הערות הערכה קלינית + נתוני מטופל ומפת 3D */
export async function summarizeTherapistAssessmentDraft(
  patient: Patient,
  draftNotes: string
): Promise<string> {
  if (!getGeminiApiKey()) throw new Error('Missing Supabase / gemini-proxy AI setup');

  const nameTokens = collectPatientPhiTokens(patient);
  const initials = patientInitialsFromName(patient.name);
  const scrub = (s: string) => scrubKnownPatientPhi(s, nameTokens, initials);

  const systemInstruction = `${THERAPIST_BASE}

משימות: נתח טווחי תנועה (ROM), מבחני כוח וכל תוצאה קלינית שמופיעה בטקסט המטפל.
הנחיה: סכם דגלים אדומים (Red Flags), הצע אבחנה מבדלת קצרה והמלץ על דגשים לתוכנית הטיפול — בהתאם לנתונים שהוזנו ולמפת הגוף התלת־ממדית (מוקד, הדגשות אדום/כתום) כפי שמופיעים ב-JSON.`;

  const userText = `נתוני מטופל ומפת גוף (JSON):
${patientJsonForTherapist(patient, scrub)}

טקסט הערכה / הערות המטפל (טיוטה):
${scrub(draftNotes.trim())}`;

  return geminiGenerateText({
    systemInstruction,
    userText,
    temperature: 0.25,
    responseMimeType: null,
    logPrefix: LOG_PREFIX,
    logDetail: { mode: 'assessment' },
    patientInitials: initials,
    nameTokens,
  });
}

/** ניתוח טקסט באינטייק חופשי (לשונית אינטייק) — ללא החלפת מנוע התרגילים המקומי */
export async function summarizeTherapistIntakeNote(
  patient: Patient,
  freeText: string,
  mode: 'initial' | 'follow_up'
): Promise<string> {
  if (!getGeminiApiKey()) throw new Error('Missing Supabase / gemini-proxy AI setup');

  const nameTokens = collectPatientPhiTokens(patient);
  const initials = patientInitialsFromName(patient.name);
  const scrub = (s: string) => scrubKnownPatientPhi(s, nameTokens, initials);

  const followBlock =
    mode === 'follow_up'
      ? `

מצב: אינטייק משכי (מטופל חוזר לטיפול).
הנחיות נוספות:
- אל תחזור על שאלות דמוגרפיות או היסטוריה כללית שלא השתנתה.
- התמקד בשינוי: האם הכאב השתנה? איך הייתה התגובה לטיפול האחרון? האם חזרה פעילות פונקציונלית?
- השווה במפורש למגמות בנתוני המעקב (כאב, סשנים) אם רלוונטי.`
      : '';

  const systemInstruction = `${THERAPIST_BASE}

משימות: נתח תוצאות אינטייק/הערכה חופשית; שלב ROM ומבחני כוח אם הוזכרו.
הנחיה: סכם דגלים אדומים, אבחנה מבדלת והדגשות לתוכנית — על בסיס הטקסט ומפת הגוף ב-JSON.${followBlock}`;

  const userText = `נתוני מטופל (JSON):
${patientJsonForTherapist(patient, scrub)}

טקסט אינטייק / הערכה:
${scrub(freeText.trim())}`;

  return geminiGenerateText({
    systemInstruction,
    userText,
    temperature: 0.25,
    responseMimeType: null,
    logPrefix: LOG_PREFIX,
    logDetail: { mode },
    patientInitials: initials,
    nameTokens,
  });
}
