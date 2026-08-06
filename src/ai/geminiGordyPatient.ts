import type { Patient, PatientExercise } from '../types';
import { bodyAreaLabels } from '../types';
import {
  collectPatientPhiTokens,
  patientInitialsFromName,
  scrubKnownPatientPhi,
} from './clinicalConsultantContext';
import { geminiGenerateChat, getGeminiApiKey, type GeminiChatTurn } from './geminiClient';
import { addClinicalDays, getClinicalDate } from '../utils/clinicalCalendar';

const LOG_PREFIX = '[GeminiPatientRehab]';

export type PatientProgramReviewAiContext = {
  summaryHebrew: string;
};

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

function threeDayLogSummary(patient: Patient): string {
  const today = getClinicalDate();
  const days = [0, 1, 2].map((i) => addClinicalDays(today, -i));
  const daySet = new Set(days);
  const painInWindow = patient.analytics.painHistory.filter((r) =>
    daySet.has(r.date.slice(0, 10))
  );
  const sessionsInWindow = patient.analytics.sessionHistory.filter((s) =>
    daySet.has(s.date.slice(0, 10))
  );
  const avgPain =
    painInWindow.length > 0
      ? (
          painInWindow.reduce((s, r) => s + r.painLevel, 0) / painInWindow.length
        ).toFixed(1)
      : null;
  const sessionBits = sessionsInWindow
    .slice(-3)
    .map((s) => `${s.date}: ${s.exercisesCompleted}/${s.totalExercises}`)
    .join('; ');
  return [
    `סיכום 3 ימים קליניים אחרונים (${days[2]}–${days[0]}):`,
    avgPain != null
      ? `ממוצע דיווחי כאב בחלון: ${avgPain}/10 (${painInWindow.length} דיווחים).`
      : 'בחלון זה עדיין אין דיווחי כאב מפורטים — אפשר לתת הנחיה כללית ולעודד דיווח אחרי תרגול.',
    sessionBits
      ? `סשנים בחלון: ${sessionBits}.`
      : 'בחלון זה אין עדיין סשנים מדווחים — עודדו תרגול עדין ודיווח כנה.',
  ].join(' ');
}

function intakeGoalsLine(patient: Patient): string {
  const goals = patient.clinicalIntakeProfile?.goals?.filter(
    (g) => typeof g === 'string' && g.trim().length > 0
  );
  if (!goals || goals.length === 0) {
    return 'מטרות אינטייק: לא הוזנו במערכת — אפשר לשאול את המטופל על מטרותיו ולעודד שיחה עם המטפל.';
  }
  // Cap and scrub length — goals may be free text; keep short, no names expected.
  return `מטרות שיקום מהאינטייק (תמצית): ${goals
    .slice(0, 4)
    .map((g) => g.trim().slice(0, 80))
    .join(' · ')}`;
}

function buildPatientSnapshotBlock(
  patient: Patient,
  exerciseCount: number,
  exercises: PatientExercise[],
  programReview?: PatientProgramReviewAiContext | null
): string {
  const hist = patient.analytics.painHistory;
  const lastPain = hist.length > 0 ? hist[hist.length - 1] : null;
  const sessions = patient.analytics.sessionHistory.slice(-5);

  return [
    'ללא שמות פרטיים — נתוני תוכנית ומעקב בלבד.',
    `רמה במשחק: ${patient.level}, XP: ${patient.xp}`,
    `רצף ימים: ${patient.currentStreak}`,
    `מוקד גוף עיקרי בתוכנית: ${bodyAreaLabels[patient.primaryBodyArea]}`,
    `דגל אדום פעיל במערכת: ${patient.hasRedFlag ? 'כן' : 'לא'}`,
    `מספר תרגילים בתוכנית היום: ${exerciseCount}`,
    intakeGoalsLine(patient),
    threeDayLogSummary(patient),
    programReview?.summaryHebrew ??
      'ביקורת תוכנית תלת־יומית: סטטוס לא זמין כרגע — הסבירו את מחזור 3 הימים באופן כללי.',
    lastPain
      ? `דיווח כאב אחרון: ${lastPain.painLevel}/10 ב־${bodyAreaLabels[lastPain.bodyArea]} (${lastPain.date})`
      : 'עדיין אין דיווח כאב אחרון במערכת — תנו הנחיה קלינית כללית ועודדו לדווח אחרי תרגול.',
    `סשנים אחרונים (תאריך, הושלמו/סה״כ, מאמץ 1–10): ${JSON.stringify(
      sessions.map((s) => ({
        date: s.date,
        done: `${s.exercisesCompleted}/${s.totalExercises}`,
        difficulty: s.difficultyRating,
      }))
    )}`,
    'תרגילים בתוכנית:',
    exerciseListSummary(exercises) || '(ריק — ענו באופן כללי והפנו לכרטיס התרגיל / מטפל)',
  ].join('\n');
}

function patientRehabAssistantSystemInstruction(
  patient: Patient,
  exerciseCount: number,
  exercises: PatientExercise[],
  programReview?: PatientProgramReviewAiContext | null
): string {
  const snapshot = buildPatientSnapshotBlock(
    patient,
    exerciseCount,
    exercises,
    programReview
  );
  return `את/ה פיזיותרפיסט/ית מוסמכ/ת ומנוס/ה, הפועל/ת כעוזר/ת שיקום דיגיטלי באפליקציה.
קהל היעד: מטופל/ת ביומיום. דבר/י תמיד בעברית טבעית, חמה, אמפתית ומקצועית — לא רובוטית ולא יבשה.

יכולות היברידיות:
1) שאלות כלליות באנטומיה, כאב שריר-שלד, DOMS מול כאב חריג, עקרונות תרגול בטוח — ענה/י כמקצוענ/ית.
2) שאלות אישיות על התוכנית, ההתקדמות, הכאב או עדכוני תוכנית — שלב/י בעדינות את הקשר האישי מהמערכת (למטה), בלי לחשוף שמות או מזהים.

מחזור ביקורת 3 ימים (מנוע חוקים קליני — לא מודל שפה):
- בשבוע הראשון בתוכנית אין הצעות התאמה אוטומטיות (תקופת הסתגלות).
- אחרי השבוע הראשון המערכת בודקת ברקע דיווחים כל כ־3 ימים ומכינה הצעות התאמה למטפל (כולל החלפות מקטלוג התרגילים).
- אם המטפל דוחה הצעה — אין הצעות חוזרות למחרת; ממתינים מחזור מלא (לפחות 3 ימים) לפני בדיקה חוזרת.
- שינויי תוכנית לעולם לא נכנסים אוטומטית — רק אחרי אישור מפורש של המטפל.
- אם שואלים על התקדמות / מתי תתעדכן התוכנית — הסבר/י את המחזור בתמיכה ובעידוד, והפנה/י לשאלות למטפל כשצריך.

טון:
- חם, מעודד, מכבד; אפשר נגיעה קלה של מוטיבציה (רצף/רמות כמטאפורה בלבד).
- אל תשתמש/י בניסוחים נוקשים כמו «לא בטוח שהבנתי» או «אין נתונים».
- אם חסר מידע — תן/י ערך קליני כללי רלוונטי, הזמן/י לדווח אחרי תרגול, והצע/י לפנות למטפל כשמתאים.

הנחיית בטיחות (חובה):
- אם מדווחים על כאב חריג — מעל 7/10, כאב 7–10, כאב לילי שמחמיר, או חולשה/נימול חדשים — הנחה/י בבירור לפנות לפיזיותרפיסט המטפל; אל תחליף/י הערכה רפואית.
- אל תאבחנ/י מחלות; אל תמתח/י ביקורת על המטפל או על התוכנית שאושרה.
- אל תשנה/י עומסים בשם המערכת — רק הסבר/י והצע/י לפנות לאישור מטפל.

הקשר נוכחי מהמערכת (עדכני בכל הודעה):
${snapshot}

כללים נוספים:
- תשובות קצרות־בינוניות (עד כ־8–12 שורות) אלא אם מבקשים להרחיב.
- שמור/י על שפה ברורה ללא זargon מיותר; הסבר/י מונחים בקצרה כשצריך.`;
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
  programReview?: PatientProgramReviewAiContext | null;
}): Promise<string> {
  if (!getGeminiApiKey()) {
    throw new Error('Missing Supabase / gemini-proxy AI setup');
  }

  const nameTokens = collectPatientPhiTokens(params.patient);
  const initials = patientInitialsFromName(params.patient.name);
  const systemInstruction = patientRehabAssistantSystemInstruction(
    params.patient,
    params.exerciseCount,
    params.exercises,
    params.programReview
  );

  const history: GeminiChatTurn[] = params.history.map((m) => ({
    role: m.role,
    text: scrubKnownPatientPhi(m.text, nameTokens, initials),
  }));

  return geminiGenerateChat({
    systemInstruction,
    history,
    userMessage: scrubKnownPatientPhi(params.userMessage.trim(), nameTokens, initials),
    temperature: 0.65,
    logPrefix: LOG_PREFIX,
    logDetail: { historyTurns: history.length },
    patientInitials: initials,
    nameTokens,
  });
}
