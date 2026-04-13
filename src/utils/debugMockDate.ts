/**
 * דיבוג בלבד: הזחת «היום» בלוח השנה המקומי (נשמר ב-localStorage).
 * משמש את getClinicalDate, useLocalCalendarDayKey (הידעת), וכו׳.
 */

const STORAGE_KEY = 'guardian-dev-calendar-offset-days';

/** גבולות סבירים לבדיקות לונגיטודינליות (מניעת ערכי localStorage קיצוניים). */
const MIN_OFFSET_DAYS = -3650;
const MAX_OFFSET_DAYS = 3650;

export const DEV_MOCK_DATE_CHANGED_EVENT = 'guardian-dev-mock-date-changed';

function clampOffsetDays(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(MIN_OFFSET_DAYS, Math.min(MAX_OFFSET_DAYS, Math.trunc(n)));
}

export function getDevCalendarOffsetDays(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = raw != null ? parseInt(raw, 10) : 0;
    return clampOffsetDays(n);
  } catch {
    return 0;
  }
}

/** «עכשיו» לצורך לוגיקה יומית — כולל הזחת דיבוג בימים. */
export function getAppDate(): Date {
  const d = new Date();
  const offset = getDevCalendarOffsetDays();
  if (offset === 0) return d;
  const out = new Date(d.getTime());
  out.setDate(out.getDate() + offset);
  return out;
}

/**
 * מוסיף/מחסיר ימים קלנדריים להזחת «עכשיו» (דיבוג). מפיץ אירוע לריענון UI.
 * ערך שלילי = «מכונת זמן» אחורה.
 */
export function addDevCalendarOffsetDays(deltaDays: number): number {
  if (import.meta.env.PROD) return getDevCalendarOffsetDays();
  const cur = getDevCalendarOffsetDays();
  const next = clampOffsetDays(cur + Math.trunc(deltaDays));
  if (next === cur) return cur;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    /* quota / private mode */
  }
  window.dispatchEvent(new CustomEvent(DEV_MOCK_DATE_CHANGED_EVENT));
  return next;
}

/** מוסיף יום קלנדרי אחד להזחה (דיבוג). */
export function bumpDevCalendarOffsetDays(): number {
  return addDevCalendarOffsetDays(1);
}
