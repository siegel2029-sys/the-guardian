/**
 * יום קליני: מתחלף ב־04:00 (שעון מקומי של הדפדפן).
 */

import { getAppDate } from './debugMockDate';

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** YYYY-MM-DD בשעון מקומי */
export function toLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * תאריך היום הקליני הנוכחי.
 * לפני 04:00 נחשבים עדיין ליום הקלנדרי הקודם.
 */
export function getClinicalDate(now?: Date): string {
  const d = new Date(now ?? getAppDate());
  if (d.getHours() < 4) {
    d.setDate(d.getDate() - 1);
  }
  return toLocalYmd(d);
}

/** מחזיר Date בחצות (00:00) של תאריך קליני YYYY-MM-DD במקומי */
export function clinicalDateToLocalMidnight(ymd: string): Date {
  const [y, m, day] = ymd.split('-').map((x) => parseInt(x, 10));
  return new Date(y, m - 1, day, 0, 0, 0, 0);
}

/** הוספה/חיסור ימים לתאריך קליני (מחרוזת YYYY-MM-DD) */
export function addClinicalDays(ymd: string, deltaDays: number): string {
  const d = clinicalDateToLocalMidnight(ymd);
  d.setDate(d.getDate() + deltaDays);
  return toLocalYmd(d);
}

/** היום הקליני שקדם ל־ymd */
export function getPreviousClinicalDate(ymd: string): string {
  return addClinicalDays(ymd, -1);
}

/** אתמול ביחס ליום קליני "היום" (ברירת מחדל: עכשיו) */
export function getClinicalYesterday(now?: Date): string {
  const base = now ?? getAppDate();
  return getPreviousClinicalDate(getClinicalDate(base));
}
