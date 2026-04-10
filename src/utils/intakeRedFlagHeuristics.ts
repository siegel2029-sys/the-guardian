/** זיהוי גס של דגלים אדומים בטקסט חופשי (גיבוי כשאין Gemini) */
export function extractHeuristicIntakeRedFlags(text: string): string[] {
  const t = text.toLowerCase();
  const out: string[] = [];
  if (/\bnight\b|nocturnal|לילה|בלילה|קם בלילה/i.test(t)) {
    out.push('כאב לילי / הפרעת שינה');
  }
  if (/\bweight\s*loss\b|אובדן משקל|ירידה במשקל/i.test(t)) {
    out.push('אובדן משקל לא מוסבר');
  }
  if (/\bbilateral\b|דו[\s-]?צדדי|משני הצדדים|שתי (ה)?רגליים|שתי (ה)?ידיים/i.test(t)) {
    out.push('ממצאים דו-צדדיים (נדרשת הבחנה)');
  }
  if (/\bnumbness\b|\btingling\b|חוסר תחושה|עקצוץ|נימול|חולשה מתקדמת/i.test(t)) {
    out.push('סימנים נוירולוגיים (תחושה/חולשה)');
  }
  if (/\bfever\b|חום|צמרמורות/i.test(t)) {
    out.push('חום / ממצאים מדבקתיים אפשריים');
  }
  return [...new Set(out)];
}

export function heuristicIntakeRedFlagDetected(flags: string[]): boolean {
  return flags.length > 0;
}
