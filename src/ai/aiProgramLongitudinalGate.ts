/**
 * שער שמרני להצעות שינוי תוכנית AI — דורש מגמה עקבית בחלון גלילה של 4 ימים קליניים.
 */

import type { BodyArea, DailyHistoryEntry, ExerciseSession, PainRecord, Patient } from '../types';
import { addClinicalDays } from '../utils/clinicalCalendar';

export const AI_PROGRAM_LONGITUDINAL_WINDOW_DAYS = 4;

export type AiProgramLongitudinalTrigger =
  | 'pain_increasing_3_consecutive_days'
  | 'low_compliance_3_of_4'
  | 'functional_decline_rom_proxy';

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

export type AiLongitudinalGateInput = {
  patient: Patient;
  clinicalToday: string;
  dayMap: Record<string, DailyHistoryEntry | undefined> | undefined;
  /** מספר תרגילי שיקום בפוקוס — אם 0 אין שער AI */
  rehabExerciseCount: number;
};

/**
 * מחזיר האם להפעיל את מנוע הצעת ה-AI (Gemini/יוריסטיקה) — רק אחרי זיהוי מגמה בחלון 4 הימים.
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
  const completionByDay = days.map((d) =>
    completionRateForDay(sessionForDay(patient.analytics.sessionHistory, d))
  );

  for (let i = 0; i <= days.length - 3; i++) {
    const p0 = painByDay[i];
    const p1 = painByDay[i + 1];
    const p2 = painByDay[i + 2];
    if (p0 != null && p1 != null && p2 != null && p0 < p1 && p1 < p2) {
      triggers.push('pain_increasing_3_consecutive_days');
      break;
    }
  }

  const lowComplianceDays = completionByDay.filter((r) => r < 0.5).length;
  if (lowComplianceDays >= 3) {
    triggers.push('low_compliance_3_of_4');
  }

  if (detectFunctionalDecline(days, dayMap)) {
    triggers.push('functional_decline_rom_proxy');
  }

  const unique = [...new Set(triggers)];
  const shouldSuggest = unique.length > 0;
  const summaryParts: string[] = [];
  if (unique.includes('pain_increasing_3_consecutive_days')) {
    summaryParts.push('עליית כאב בעקביות לאורך 3 ימים קליניים רצופים.');
  }
  if (unique.includes('low_compliance_3_of_4')) {
    summaryParts.push('השלמת תרגילים מתחת ל־50% ב־3 מתוך 4 הימים האחרונים.');
  }
  if (unique.includes('functional_decline_rom_proxy')) {
    summaryParts.push('ירידה עקבית במספר התרגילים שהושלמו (אינדיקציה לתפקוד / טווח תנועה).');
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
