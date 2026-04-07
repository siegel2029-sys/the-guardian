import type { ExerciseSession, PainRecord, Patient } from '../types';
import { addClinicalDays } from '../utils/clinicalCalendar';

export type ProgressInsightCategory = 'load_increase' | 'load_decrease' | 'maintain' | 'escalate_care';

export type ClinicalProgressInsight = {
  category: ProgressInsightCategory;
  titleHe: string;
  summaryHe: string;
  nextStepHe: string;
  basisHe: string;
  /** מספרים לתצוגה בכרטיס סיכום */
  avgPain7d: number | null;
  currentPain: number | null;
  compliance3d: number | null;
};

function sortByDate<T extends { date: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => a.date.localeCompare(b.date));
}

/** ממוצע כאב ברשומות שתאריכן בטווח [startYmd, endYmd] כולל */
export function averagePainInRange(
  painHistory: PainRecord[],
  startYmd: string,
  endYmd: string
): number | null {
  const inRange = painHistory.filter((r) => r.date >= startYmd && r.date <= endYmd);
  if (inRange.length === 0) return null;
  return inRange.reduce((s, r) => s + r.painLevel, 0) / inRange.length;
}

/** ממוצע השלמה (0–1) ל־N הסשנים האחרונים */
export function averageComplianceLastSessions(
  sessionHistory: ExerciseSession[],
  count: number
): number | null {
  const sorted = sortByDate(sessionHistory);
  const last = sorted.slice(-count);
  if (last.length === 0) return null;
  const ratios = last.map((s) =>
    s.totalExercises > 0 ? s.exercisesCompleted / s.totalExercises : 0
  );
  return ratios.reduce((a, b) => a + b, 0) / ratios.length;
}

/** מגמת כאב: ממוצע 3 האחרונות לעומת 3 שקדמו */
export function painTrendDelta(sortedPain: PainRecord[]): number | null {
  if (sortedPain.length < 4) return null;
  const last3 = sortedPain.slice(-3);
  const prev3 = sortedPain.slice(-6, -3);
  if (prev3.length < 3) return null;
  const avgLast = last3.reduce((s, r) => s + r.painLevel, 0) / 3;
  const avgPrev = prev3.reduce((s, r) => s + r.painLevel, 0) / 3;
  return avgLast - avgPrev;
}

/**
 * המלצת מערכת להתקדמות — לוגיקה דטרמיניסטית לפי כאב ועמידה בתוכנית (דמו).
 */
export function computeClinicalProgressInsight(
  patient: Patient,
  clinicalToday: string
): ClinicalProgressInsight {
  const painSorted = sortByDate(patient.analytics.painHistory);
  const start7 = addClinicalDays(clinicalToday, -6);
  const avgPain7d = averagePainInRange(patient.analytics.painHistory, start7, clinicalToday);

  const currentPain =
    painSorted.length > 0 ? painSorted[painSorted.length - 1].painLevel : null;

  const compliance3d = averageComplianceLastSessions(patient.analytics.sessionHistory, 3);
  const delta = painTrendDelta(painSorted);

  const painHigh =
    currentPain != null && currentPain >= 6;
  const painRising = delta != null && delta >= 0.6;
  const painLow =
    avgPain7d != null && avgPain7d < 3 && (currentPain == null || currentPain < 4);
  const complianceHigh = compliance3d != null && compliance3d >= 0.85;
  const complianceLow = compliance3d != null && compliance3d < 0.5;

  let category: ProgressInsightCategory = 'maintain';
  let titleHe = 'מגמת יציבות';
  let summaryHe =
    'הנתונים אינם מצביעים על שינוי חד בשלב זה. מומלץ להמשיך במעקב שגרתי ולעדכן הערכה קלינית.';
  let nextStepHe =
    'שמרו על פרוטוקול נוכחי, עקבו אחרי דיווחי כאב אחרי אימון ועדכנו הערות קליניות.';
  let basisHe = 'מבוסס על היסטוריית כאב וסשנים אחרונים במערכת.';

  if (painHigh || painRising) {
    category = painHigh ? 'escalate_care' : 'load_decrease';
    titleHe = painHigh ? 'נדרש ניטור קליני הדוק' : 'מגמת החמרה בכאב';
    summaryHe = painHigh
      ? 'רמת כאב נוכחית גבוהה או מגמת עלייה — יש לשקול התאמת עומס, חלופת תרגיל או הפניה להערכה פנים-מול-פנים.'
      : 'נרשמת עלייה בכאב ביחס לתקופה הקודמת. מומלץ להפחית עומס או לשנות מרכיב בתוכנית.';
    nextStepHe =
      'הפחיתו חזרות/משקל או החליפו תרגיל מעמיס; תעדו בהערכה הקלינית; במידת הצורך שלחו הודעה למטופל דרך צ׳אט מהיר.';
    basisHe = `מגמת כאב: ${delta != null ? (delta >= 0 ? '+' : '') + delta.toFixed(1) : '—'} נק׳ ממוצע בין תקופות; כאב נוכחי: ${currentPain ?? '—'}/10.`;
  } else if (painLow && complianceHigh) {
    category = 'load_increase';
    titleHe = 'מגמת שיפור';
    summaryHe =
      'כאב נמוך יחסית ועמידה גבוהה בימים האחרונים — ניתן לשקול התקדמות זהירה בתוכנית.';
    nextStepHe =
      'הגבירו בהדרגה חזרות או עומס (כ־10–15%), או הוסיפו תרגיל תומך — לאחר אישור קליני ובמעקב צמוד לכאב.';
    basisHe = `ממוצע כאב 7 ימים: ${avgPain7d != null ? avgPain7d.toFixed(1) : '—'}; עמידה ממוצעת (3 סשנים): ${compliance3d != null ? Math.round(compliance3d * 100) + '%' : '—'}.`;
  } else if (complianceLow && !painHigh) {
    category = 'maintain';
    titleHe = 'עמידה נמוכה בתוכנית';
    summaryHe =
      'השלמת אימונים נמוכה יחסית — ייתכן שחסמים התנהגותיים או עומס מוגזם. כדאי לבחון מחדש יעדים.';
    nextStepHe =
      'שלחו הודעה תומכת דרך הצ׳אט המהיר, הפחיתו זמנית נפח או פצלו את התוכנית ליחידות קטנות יותר.';
    basisHe = `שיעור השלמה הממוצע ב־3 הסשנים האחרונים: ${compliance3d != null ? Math.round(compliance3d * 100) + '%' : '—'}.`;
  } else if (avgPain7d != null && avgPain7d >= 5 && !painLow) {
    category = 'load_decrease';
    titleHe = 'כאב בינוני־גבוה בממוצע';
    summaryHe = 'ממוצע הכאב בשבוע האחרון מעל הסף הבינוני — עדיף לא לעלות בעומס לפני ייצוב.';
    nextStepHe = 'שמרו על עומס נוכחי או הפחיתו מעט; הדגישו טכניקה והתאמות לפי אזור המוקד.';
    basisHe = `ממוצע 7 ימים: ${avgPain7d.toFixed(1)}/10.`;
  }

  return {
    category,
    titleHe,
    summaryHe,
    nextStepHe,
    basisHe,
    avgPain7d,
    currentPain,
    compliance3d,
  };
}
