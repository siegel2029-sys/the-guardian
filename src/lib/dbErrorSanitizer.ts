/**
 * PostgREST / Supabase error messages can reveal table names, column names and
 * RLS policy details — useful for attacker reconnaissance. In production builds
 * the raw message goes to the console only; the UI gets a generic Hebrew message.
 * Dev builds keep the full detail inline for debugging.
 */
export function sanitizeDbErrorMessage(
  rawMessage: string | null | undefined,
  fallback = 'שגיאת שרת בגישה לנתונים. נסו שוב או פנו לתמיכה.'
): string {
  const raw = rawMessage?.trim() ?? '';
  if (raw) {
    console.error('[db-error]', raw);
  }
  if (import.meta.env.DEV) {
    return raw || fallback;
  }
  if (/row-level security|violates row-level|permission denied|42501/i.test(raw)) {
    return 'אין הרשאה לשמירת המטופל. התחברו מחדש כמטפל ונסו שוב.';
  }
  return fallback;
}
