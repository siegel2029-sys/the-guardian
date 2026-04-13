/**
 * דיבוג בלבד: הזחת «היום» בלוח השנה המקומי (נשמר ב-localStorage).
 * משמש את getClinicalDate, useLocalCalendarDayKey (הידעת), וכו׳.
 */

const STORAGE_KEY = 'guardian-dev-calendar-offset-days';

export const DEV_MOCK_DATE_CHANGED_EVENT = 'guardian-dev-mock-date-changed';

export function getDevCalendarOffsetDays(): number {
  if (typeof window === 'undefined') return 0;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const n = raw != null ? parseInt(raw, 10) : 0;
    return Number.isFinite(n) && n > 0 ? n : 0;
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

/** מוסיף יום קלנדרי אחד להזחה (דיבוג). מפיץ אירוע לריענון UI. */
export function bumpDevCalendarOffsetDays(): number {
  if (import.meta.env.PROD) return getDevCalendarOffsetDays();
  const next = getDevCalendarOffsetDays() + 1;
  try {
    window.localStorage.setItem(STORAGE_KEY, String(next));
  } catch {
    /* quota / private mode */
  }
  window.dispatchEvent(new CustomEvent(DEV_MOCK_DATE_CHANGED_EVENT));
  return next;
}
