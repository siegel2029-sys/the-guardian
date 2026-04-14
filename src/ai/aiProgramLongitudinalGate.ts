/**
 * שער להצעות שינוי תוכנית AI — חלון 4 ימים קליניים: חזרה מחוסר פעילות, מגמות כאב/ציות, או התקדמות חיובית.
 */

import type { BodyArea, DailyHistoryEntry, ExerciseSession, PainRecord, Patient } from '../types';
import { addClinicalDays } from '../utils/clinicalCalendar';

export const AI_PROGRAM_LONGITUDINAL_WINDOW_DAYS = 4;

/** הנחיה ל-Gemini כשמזוהה חזרה מחוסר פעילות / הפסקה ארוכה */
export const GEMINI_REENGAGEMENT_AFTER_INACTIVITY_INSTRUCTION =
  'The patient has been inactive for several days after a good streak. Suggest a "re-entry" plan that is slightly easier or more encouraging to help them rebuild their streak and prevent further drop-out.';

export type AiProgramLongitudinalTrigger =
  | 'pain_increasing_3_consecutive_days'
  /** ציות גבוה → הפסקה של 3–4 ימים → חזרה; או 4 ימים שקטים; או 4 ימים עם 0% השלמה בדיווח */
  | 'return_from_absence_reengagement'
  /** 3 ימים רצופים עם סשן מתוכנן אך השלמה מתחת ל־50% */
  | 'low_compliance_3_consecutive_days'
  | 'functional_decline_rom_proxy'
  /** 4 ימים של 100% השלמה + כאב נמוך או יורד — מותר להציע הארדת תוכנית */
  | 'positive_progression_level_up';

export type AiDevLongitudinalScenario =
  | 'rising_pain'
  | 'low_compliance'
  | 'functional_decline'
  | 'steady_clear';

export type AiLongitudinalGateResult = {
  shouldSuggest: boolean;
  /** מספיק נתונים בחלון — אפשר להציג «התקדמות יציבה» כשאין מגמה */
  showSteadyProgress: boolean;
  insufficientData: boolean;
  triggers: AiProgramLongitudinalTrigger[];
  /** לדיבוג / פרומפט */
  summaryHebrew: string;
  /** נוסח באנגלית לשילוב ב-system/user prompt של Gemini (חזרה מחוסר פעילות) */
  geminiExtraInstructionEnglish?: string;
};

function dayKeyFromIso(isoOrYmd: string): string {
  return isoOrYmd.slice(0, 10);
}

/** D-(n-1) … D0 כולל היום הקליני */
export function rollingClinicalDayKeys(clinicalToday: string, n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    out.push(addClinicalDays(clinicalToday, -i));
  }
  return out;
}

function meanPrimaryPainForDay(
  painHistory: PainRecord[],
  primary: BodyArea,
  ymd: string
): number | null {
  const rows = painHistory.filter(
    (r) => r.bodyArea === primary && dayKeyFromIso(r.date) === ymd
  );
  if (rows.length === 0) return null;
  return rows.reduce((s, r) => s + r.painLevel, 0) / rows.length;
}

function sessionForDay(sessions: ExerciseSession[], ymd: string): ExerciseSession | undefined {
  return sessions.find((s) => dayKeyFromIso(s.date) === ymd);
}

function completionRateForDay(session: ExerciseSession | undefined): number {
  if (!session || session.totalExercises <= 0) return 0;
  return session.exercisesCompleted / session.totalExercises;
}

function dayHasSignal(
  patient: Patient,
  ymd: string,
  sessionByDay: ExerciseSession | undefined,
  dayMap: Record<string, DailyHistoryEntry | undefined> | undefined
): boolean {
  if (meanPrimaryPainForDay(patient.analytics.painHistory, patient.primaryBodyArea, ymd) != null) {
    return true;
  }
  if (sessionByDay) return true;
  const h = dayMap?.[ymd];
  if (h && h.exercisesPlanned > 0) return true;
  return false;
}

/** ירידה בתפקוד (פרוקסי לטווח תנועה / יכולת תפקודית): ירידה מונוטונית בחזרות שהושלמו 3 ימים רצופים */
function detectFunctionalDecline(
  days: string[],
  dayMap: Record<string, DailyHistoryEntry | undefined> | undefined
): boolean {
  if (!dayMap) return false;
  const completed = days.map((d) => dayMap[d]?.exercisesCompleted ?? null);
  const planned = days.map((d) => dayMap[d]?.exercisesPlanned ?? 0);
  for (let i = 0; i <= days.length - 3; i++) {
    const c0 = completed[i];
    const c1 = completed[i + 1];
    const c2 = completed[i + 2];
    if (c0 == null || c1 == null || c2 == null) continue;
    const p0 = planned[i];
    const p1 = planned[i + 1];
    const p2 = planned[i + 2];
    if (p0 < 2 || p1 < 2 || p2 < 2) continue;
    if (c0 > c1 && c1 > c2) return true;
  }
  return false;
}

const LOOKBACK_SILENT_DAYS = 21;

function dayHasSignalForClinicalDay(
  patient: Patient,
  ymd: string,
  dayMap: Record<string, DailyHistoryEntry | undefined> | undefined
): boolean {
  const sess = sessionForDay(patient.analytics.sessionHistory, ymd);
  return dayHasSignal(patient, ymd, sess, dayMap);
}

/** מספר ימים קליניים רצופים ללא סיגנל, כולל clinicalToday */
function countTrailingSilentDaysInclusive(
  clinicalToday: string,
  patient: Patient,
  dayMap: Record<string, DailyHistoryEntry | undefined> | undefined
): number {
  let n = 0;
  for (let i = 0; i < LOOKBACK_SILENT_DAYS; i++) {
    const d = addClinicalDays(clinicalToday, -i);
    if (dayHasSignalForClinicalDay(patient, d, dayMap)) break;
    n++;
  }
  return n;
}

/** מספר ימים שקטים רצופים מיד לפני היום הקליני (לא כולל clinicalToday) */
function countSilentDaysBeforeToday(
  clinicalToday: string,
  patient: Patient,
  dayMap: Record<string, DailyHistoryEntry | undefined> | undefined
): number {
  let n = 0;
  for (let i = 1; i < LOOKBACK_SILENT_DAYS; i++) {
    const d = addClinicalDays(clinicalToday, -i);
    if (dayHasSignalForClinicalDay(patient, d, dayMap)) break;
    n++;
  }
  return n;
}

function isStrongComplianceExerciseDay(patient: Patient, ymd: string): boolean {
  const s = sessionForDay(patient.analytics.sessionHistory, ymd);
  if (!s || s.totalExercises <= 0) return false;
  return s.exercisesCompleted / s.totalExercises >= 0.75;
}

/** יומיים עם ציות גבוהה מיד לפני תחילת רצף השקט (ימים שלפני ה־gap) */
function hadStrongComplianceStreakBeforeSilentGap(
  patient: Patient,
  clinicalToday: string,
  silentDaysBeforeToday: number
): boolean {
  if (silentDaysBeforeToday < 3) return false;
  const d1 = addClinicalDays(clinicalToday, -(silentDaysBeforeToday + 1));
  const d2 = addClinicalDays(clinicalToday, -(silentDaysBeforeToday + 2));
  const a = isStrongComplianceExerciseDay(patient, d1);
  const b = isStrongComplianceExerciseDay(patient, d2);
  if (a && b) return true;
  const s1 = sessionForDay(patient.analytics.sessionHistory, d1);
  if (s1 && s1.totalExercises > 0 && s1.exercisesCompleted >= s1.totalExercises) return true;
  return false;
}

/** 4 ימים קליניים רצופים (חלון הגלילה) עם סשן שמדווח ו־0% השלמה */
function detectFourConsecutiveZeroComplianceWindow(
  rollingFourOldestToNewest: string[],
  sessions: ExerciseSession[]
): boolean {
  if (rollingFourOldestToNewest.length !== AI_PROGRAM_LONGITUDINAL_WINDOW_DAYS) return false;
  for (const d of rollingFourOldestToNewest) {
    const s = sessionForDay(sessions, d);
    if (!s || s.totalExercises <= 0) return false;
    if (s.exercisesCompleted !== 0) return false;
  }
  return true;
}

function evaluateReturnFromAbsenceReengagement(
  clinicalToday: string,
  patient: Patient,
  dayMap: Record<string, DailyHistoryEntry | undefined> | undefined,
  rollingDays: string[]
): { fire: boolean; detailHebrew: string } {
  const silentInc = countTrailingSilentDaysInclusive(clinicalToday, patient, dayMap);
  const silentBefore = countSilentDaysBeforeToday(clinicalToday, patient, dayMap);
  const todayHasSignal = dayHasSignalForClinicalDay(patient, clinicalToday, dayMap);
  const priorStreak = hadStrongComplianceStreakBeforeSilentGap(patient, clinicalToday, silentBefore);
  const fourSilent = silentInc >= 4;
  const returnedAfterGoodStreak = todayHasSignal && silentBefore >= 3 && priorStreak;
  const fourZero = detectFourConsecutiveZeroComplianceWindow(rollingDays, patient.analytics.sessionHistory);

  if (returnedAfterGoodStreak) {
    return {
      fire: true,
      detailHebrew:
        'חידוש מעורבות לאחר חוסר פעילות (Re-engagement after inactivity): חזרה לדיווח אחרי 3–4 ימים ללא מעקב, לאחר תקופה עם ציות טוב.',
    };
  }
  if (fourSilent) {
    return {
      fire: true,
      detailHebrew:
        'חידוש מעורבות לאחר חוסר פעילות: 4 ימים קליניים רצופים ללא אימון או דיווח — מספיק כדי להציע תוכנית כניסה חוזרת נגישה.',
    };
  }
  if (fourZero) {
    return {
      fire: true,
      detailHebrew:
        'חידוש מעורבות לאחר חוסר פעילות: 4 ימים רצופים עם דיווח אימון ו־0% השלמה — מומלץ להקל ולעודד חזרה לשגרה.',
    };
  }
  return { fire: false, detailHebrew: '' };
}

/** 3 ימים רצופים עם סשן שמדווח (totalExercises > 0) והשלמה מתחת ל־50% */
function detectThreeConsecutiveLowCompliance(days: string[], sessions: ExerciseSession[]): boolean {
  for (let i = 0; i <= days.length - 3; i++) {
    let chain = true;
    for (let j = 0; j < 3; j++) {
      const sess = sessionForDay(sessions, days[i + j]);
      if (!sess || sess.totalExercises <= 0) {
        chain = false;
        break;
      }
      if (completionRateForDay(sess) >= 0.5) {
        chain = false;
        break;
      }
    }
    if (chain) return true;
  }
  return false;
}

/**
 * 4 ימים של 100% השלמה, דיווח כאב בכל יום, וכאב נמוך או מגמה יורדת — לא מצב קבוע בכאב בינוני (4+).
 */
function detectPositiveProgressionLevelUp(
  days: string[],
  painByDay: (number | null)[],
  sessions: ExerciseSession[]
): boolean {
  for (let i = 0; i < days.length; i++) {
    const sess = sessionForDay(sessions, days[i]);
    if (!sess || sess.totalExercises <= 0) return false;
    if (sess.exercisesCompleted < sess.totalExercises) return false;
    if (painByDay[i] == null) return false;
  }
  const vals = painByDay as number[];
  const minP = Math.min(...vals);
  const maxP = Math.max(...vals);
  if (minP === maxP && minP >= 4) return false;
  return maxP <= 3 || vals[0] > vals[3];
}

export type AiLongitudinalGateInput = {
  patient: Patient;
  clinicalToday: string;
  dayMap: Record<string, DailyHistoryEntry | undefined> | undefined;
  /** מספר תרגילי שיקום בפוקוס — אם 0 אין שער AI */
  rehabExerciseCount: number;
};

/**
 * מחזיר האם להפעיל את מנוע הצעת ה-AI (Gemini/יוריסטיקה) — אחרי זיהוי מגמה, שקט שלילי, או התקדמות מתאימה בחלון 4 הימים.
 */
export function evaluateAiProgramLongitudinalGate(input: AiLongitudinalGateInput): AiLongitudinalGateResult {
  const { patient, clinicalToday, dayMap, rehabExerciseCount } = input;
  const triggers: AiProgramLongitudinalTrigger[] = [];

  if (rehabExerciseCount <= 0) {
    return {
      shouldSuggest: false,
      showSteadyProgress: false,
      insufficientData: false,
      triggers: [],
      summaryHebrew: 'אין תרגילי שיקום בפוקוס — לא מפעילים הצעת AI.',
    };
  }

  const days = rollingClinicalDayKeys(clinicalToday, AI_PROGRAM_LONGITUDINAL_WINDOW_DAYS);

  const reengagement = evaluateReturnFromAbsenceReengagement(clinicalToday, patient, dayMap, days);
  if (reengagement.fire) {
    triggers.push('return_from_absence_reengagement');
    return {
      shouldSuggest: true,
      showSteadyProgress: false,
      insufficientData: false,
      triggers: [...new Set(triggers)],
      summaryHebrew: reengagement.detailHebrew,
      geminiExtraInstructionEnglish: GEMINI_REENGAGEMENT_AFTER_INACTIVITY_INSTRUCTION,
    };
  }

  let signalDays = 0;
  for (const d of days) {
    const sess = sessionForDay(patient.analytics.sessionHistory, d);
    if (dayHasSignal(patient, d, sess, dayMap)) signalDays++;
  }

  if (signalDays < 3) {
    return {
      shouldSuggest: false,
      showSteadyProgress: false,
      insufficientData: true,
      triggers: [],
      summaryHebrew:
        'פחות מ־3 ימים עם נתוני מעקב בחלון האחרון — לא מציגים שינוי תוכנית (מצב שקט).',
    };
  }

  const painByDay = days.map((d) =>
    meanPrimaryPainForDay(patient.analytics.painHistory, patient.primaryBodyArea, d)
  );
  const sessions = patient.analytics.sessionHistory;

  for (let i = 0; i <= days.length - 3; i++) {
    const p0 = painByDay[i];
    const p1 = painByDay[i + 1];
    const p2 = painByDay[i + 2];
    if (p0 != null && p1 != null && p2 != null && p0 < p1 && p1 < p2) {
      triggers.push('pain_increasing_3_consecutive_days');
      break;
    }
  }

  if (detectThreeConsecutiveLowCompliance(days, sessions)) {
    triggers.push('low_compliance_3_consecutive_days');
  }

  if (detectFunctionalDecline(days, dayMap)) {
    triggers.push('functional_decline_rom_proxy');
  }

  if (detectPositiveProgressionLevelUp(days, painByDay, sessions)) {
    triggers.push('positive_progression_level_up');
  }

  const unique = [...new Set(triggers)];
  const shouldSuggest = unique.length > 0;
  const summaryParts: string[] = [];
  if (unique.includes('pain_increasing_3_consecutive_days')) {
    summaryParts.push('עליית כאב בעקביות לאורך 3 ימים קליניים רצופים.');
  }
  if (unique.includes('low_compliance_3_consecutive_days')) {
    summaryParts.push('ציות נמוך: השלמת תרגילים מתחת ל־50% ב־3 ימים קליניים רצופים.');
  }
  if (unique.includes('functional_decline_rom_proxy')) {
    summaryParts.push('ירידה עקבית במספר התרגילים שהושלמו (אינדיקציה לתפקוד / טווח תנועה).');
  }
  if (unique.includes('positive_progression_level_up')) {
    summaryParts.push(
      'התקדמות חיובית: 4 ימים עם השלמה מלאה וכאב נמוך או בירידה — אפשר להציע אתגר מתאים (בהסכמת מטפל).'
    );
  }

  return {
    shouldSuggest,
    showSteadyProgress: !shouldSuggest,
    insufficientData: false,
    triggers: unique,
    summaryHebrew:
      summaryParts.join(' ') ||
      'אין מגמה משמעותית בחלון הניטור — ממשיכים במעקב ללא שינוי אוטומטי.',
  };
}
