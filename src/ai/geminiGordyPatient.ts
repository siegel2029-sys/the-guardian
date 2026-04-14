import type { Patient, PatientExercise } from '../types';
import { bodyAreaLabels } from '../types';
import { geminiGenerateChat, getGeminiApiKey, type GeminiChatTurn } from './geminiClient';

const LOG_PREFIX = '[GeminiPatientRehab]';

function exerciseListSummary(exercises: PatientExercise[]): string {
  return exercises
    .slice(0, 24)
    .map(
      (e) =>
        `${e.name} (id: ${e.id}, חזרות: ${e.patientReps ?? e.reps ?? '—'}${
          e.holdSeconds ? `, החזקה ${e.holdSeconds}ש׳` : ''
        })`
    )
    .join('\n');
}

function buildPatientSnapshotBlock(
  patient: Patient,
  exerciseCount: number,
  exercises: PatientExercise[]
): string {
  const hist = patient.analytics.painHistory;
  const lastPain = hist.length > 0 ? hist[hist.length - 1] : null;
  const sessions = patient.analytics.sessionHistory.slice(-5);

  return [
    `שם: ${patient.name}`,
    `רמה במשחק: ${patient.level}, XP: ${patient.xp}`,
    `רצף ימים: ${patient.currentStreak}`,
    `מוקד גוף עיקרי בתוכנית: ${bodyAreaLabels[patient.primaryBodyArea]}`,
    `דגל אדום פעיל במערכת: ${patient.hasRedFlag ? 'כן' : 'לא'}`,
    `מספר תרגילים בתוכנית היום: ${exerciseCount}`,
    lastPain
      ? `דיווח כאב אחרון: ${lastPain.painLevel}/10 ב־${bodyAreaLabels[lastPain.bodyArea]} (${lastPain.date})`
      : 'אין עדיין דיווח כאב אחרון',
    `סשנים אחרונים (תאריך, הושלמו/סה״כ, קושי 1–5): ${JSON.stringify(
      sessions.map((s) => ({
        date: s.date,
        done: `${s.exercisesCompleted}/${s.totalExercises}`,
        difficulty: s.difficultyRating,
      }))
    )}`,
    'תרגילים בתוכנית:',
    exerciseListSummary(exercises) || '(ריק)',
  ].join('\n');
}

function patientRehabAssistantSystemInstruction(
  patient: Patient,
  exerciseCount: number,
  exercises: PatientExercise[]
): string {
  const snapshot = buildPatientSnapshotBlock(patient, exerciseCount, exercises);
  return `אתה עוזר שיקום דיגיטלי בתוך אפליקציה. אל תציג את עצמך כדמות בעלת שם או כינוי. קהל היעד: מטופל ביומיום (לא צוות רפואי).

טון: מעודד, ידידותי, מניע לפעולה, עם נגיעה של גיימיפיקציה (רמות, רצף, "נקודות" כעידוד — אין לך גישה לשמירת נקודות אמיתית; השתמש בזה כמטאפורה חיובית בלבד).

משימות עיקריות:
- מענה על שאלות לגבי התרגילים בתוכנית (בהתאם לנתונים שסופקו).
- הסבר פשוט על כאב פוסט־אימון (DOMS) כשזה רלוונטי — הדגש הבדל מכאב חריג.
- עידוד לביצוע עקבי ולדיווח כנה.

הנחיית בטיחות (חובה):
- השתמש בשפה פשוטה.
- אם המטופל מדווח על כאב חריג — מעל 7/10, או כאב 7–10, או כאב לילי שמחמיר, או חולשה/נימול חדשים — הנחה אותו בבירור לפנות לפיזיותרפיסט המטפל (ולא להחליף הערכה רפואית).
- אל תאבחן מחלות; אל תמתח ביקורת למטפל.

הקשר נוכחי מהמערכת (עדכני בכל הודעה):
${snapshot}

כללים נוספים:
- אם אין מידע על תרגיל ספציפי — אמור שאין לך פרט מלא והמלץ לעקוב אחרי ההנחיות בכרטיס התרגיל או לשאול את המטפל.
- שמור על תשובות קצרות־בינוניות (עד כ־8–12 שורות) אלא אם המטופל מבקש להרחיב.`;
}

/**
 * תשובת צ'אט עוזר שיקום למטופל (מול Gemini). history ללא ההודעה הנוכחית.
 */
export async function guardiPatientChatWithGemini(params: {
  patient: Patient;
  exerciseCount: number;
  exercises: PatientExercise[];
  history: { role: 'user' | 'assistant'; text: string }[];
  userMessage: string;
}): Promise<string> {
  if (!getGeminiApiKey()) {
    throw new Error('Missing Supabase / gemini-proxy AI setup');
  }

  const systemInstruction = patientRehabAssistantSystemInstruction(
    params.patient,
    params.exerciseCount,
    params.exercises
  );

  const history: GeminiChatTurn[] = params.history.map((m) => ({
    role: m.role,
    text: m.text,
  }));

  return geminiGenerateChat({
    systemInstruction,
    history,
    userMessage: params.userMessage.trim(),
    temperature: 0.65,
    logPrefix: LOG_PREFIX,
    logDetail: { historyTurns: history.length },
  });
}
