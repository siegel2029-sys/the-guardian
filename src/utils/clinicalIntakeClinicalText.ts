/** הסרת מזהי תרגילים מהספרייה מטקסט קליני לתצוגה (למשל lib-sh-01). */
const LIBRARY_EXERCISE_ID_RE = /\blib-[a-z]{2}-\d{2}\b/gi;
const EMBEDDED_LIBRARY_ID_RE = /[\w-]*lib-[a-z]{2}-\d{2}[\w-]*/gi;

export function stripLibraryExerciseIdsFromClinicalText(text: string): string {
  if (!text.trim()) return '';
  return text
    .replace(EMBEDDED_LIBRARY_ID_RE, '')
    .replace(LIBRARY_EXERCISE_ID_RE, '')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/,\s*,+/g, ',')
    .replace(/[;،]\s*[;،]+/g, ';')
    .replace(/^\s*[,;·]\s*/gm, '')
    .replace(/\s+([,;])/g, '$1')
    .trim();
}
