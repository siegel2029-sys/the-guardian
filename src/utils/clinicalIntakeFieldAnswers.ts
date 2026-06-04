/**
 * תשובות שליליות מפורשות באינטייק (ללא / אין / N/A) — נחשבות מילוי תקף, לא «חסר».
 * שדה ריק בלבד נחשב חסר.
 */

const NEGATIVE_ANSWER_NORMALIZED = new Set([
  'ללא',
  'אין',
  'אפס',
  'none',
  'n/a',
  'na',
  '—',
  '-',
  'לא',
  'אין ממצא',
  'ללא ממצא',
  'ללא רלוונטי',
  'לא רלוונטי',
  'אין רלוונטי',
  'no',
  'nil',
]);

export function normalizeClinicalAnswerText(v: string): string {
  return v.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** תשובה שלילית מפורשת (למשל «ללא», «אין», «N/A») */
export function isClinicalIntakeNegativeAnswer(v: string | undefined): boolean {
  const norm = normalizeClinicalAnswerText(v ?? '');
  if (!norm) return false;
  if (NEGATIVE_ANSWER_NORMALIZED.has(norm)) return true;
  return /^(ללא|אין|no|none)\b/.test(norm);
}

/** השדה מולא — כולל תשובה שלילית מפורשת; ריק = לא מולא */
export function isClinicalIntakeTextFieldAnswered(v: string | undefined): boolean {
  return (v ?? '').trim().length > 0;
}

/** MMT / כוח: ציון בתוך טקסט חופשי (4/5, 5/+4, : 4, סיום בשורה במספר וכו׳) */
export function lineContainsClinicalStrengthScore(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/\d\s*\/\s*\d/.test(t)) return true;
  if (/\d\s*\/\s*\+\s*\d/.test(t)) return true;
  if (/\+\s*\d(?:\.\d)?/.test(t)) return true;
  if (/[:\s–-]\s*\d(?:\.\d)?(?:\s*\+)?\s*$/.test(t)) return true;
  if (/[:\s–-]\s*\d(?:\.\d)?\s*$/.test(t)) return true;
  if (/\b\d(?:\.\d)?\s*\+?\s*$/.test(t)) return true;
  if (/\(\s*\d/.test(t)) return true;
  return false;
}

/** ROM: מעלה / מעלות או ציון מספרי בשורה */
export function lineContainsClinicalRomValue(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/\d+\s*°/.test(t) || /\d+\s*מעלות/.test(t)) return true;
  if (/[:\s–-]\s*\d/.test(t)) return true;
  if (/\d\s*\/\s*\d/.test(t)) return true;
  return lineContainsClinicalStrengthScore(t);
}
