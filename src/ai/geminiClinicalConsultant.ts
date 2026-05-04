import type { Patient, SafetyAlert } from '../types';
import { buildAnonymizedClinicalContextSnapshot } from './clinicalConsultantContext';
import { geminiGenerateChat, getGeminiApiKey, type GeminiChatTurn } from './geminiClient';

const LOG_PREFIX = '[ClinicalConsultant]';

function clinicalConsultantSystemInstruction(anonymizedSnapshot: string): string {
  const personaAndRules = `אתה «יועץ קליני AI» עם דמות מקצועית: ספקליסט בכיר באורתופדיה, בנוירולוגיה ובפיזיותרפיה קלינית, עם עשרות שנות ניסיון.

תפקידך: לספק הערכה מקצועית, השלמות קליניות והיגיון מקצועי למטפלים, בעברית, במונחים רפואיים מדויקים ובגובה דיון קליני.

כללים חובה:
- השב תמיד בעברית.
- אינך מחליף בדיקה פיזית, הדמיה, אבחנה רשמית או החלטה טיפולית סופית — הדגש זאת כשיש ספק קליני.
- הנתונים שלהלן מנותקי מזהים; אל תנחש שמות, תארים או מזהים שלא סופקו, ואל תבקש מהמטפל לשלוח כאלה.
- אל תחזור על מזהים כלשהם גם אם המטפל יזרק אותם בשאלה — הנחה להשתמש במערכת המטפל ולא לשלבם בתשובתך.
- אם עולה חשד למצב דחוף — הפנה לדאגה רפואית דחופה והמשך טיפול לפי פרוטוקול מוסדי.`;

  return `${personaAndRules}

---
הקשר אנונימי למטופל שבו נדון כעת (עדכני לסשן זה; ללא שם/מזהה):
${anonymizedSnapshot}`;
}

export async function therapistClinicalConsultantChatWithGemini(params: {
  patient: Patient;
  safetyAlertsForPatient: SafetyAlert[];
  exerciseSafetyLocked?: boolean;
  history: { role: 'user' | 'assistant'; text: string }[];
  userMessage: string;
}): Promise<string> {
  if (!getGeminiApiKey()) {
    throw new Error('Missing Supabase / gemini-proxy AI setup');
  }

  const snapshot = buildAnonymizedClinicalContextSnapshot(
    params.patient,
    params.safetyAlertsForPatient,
    { exerciseSafetyLocked: params.exerciseSafetyLocked }
  );
  const systemInstruction = clinicalConsultantSystemInstruction(snapshot);

  const history: GeminiChatTurn[] = params.history.map((m) => ({
    role: m.role,
    text: m.text,
  }));

  return geminiGenerateChat({
    systemInstruction,
    history,
    userMessage: params.userMessage.trim(),
    temperature: 0.35,
    logPrefix: LOG_PREFIX,
    logDetail: { historyTurns: history.length },
  });
}
