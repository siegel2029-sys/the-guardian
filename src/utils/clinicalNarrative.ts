/** שורה קצרה לכותרת/תג — מתוך טקסט אבחנה ארוך */
export function deriveDiagnosisHeadline(fullText: string, maxLen = 160): string {
  const t = fullText.trim();
  if (!t) return '';
  const firstLine = t.split(/\n/)[0]?.trim() ?? t;
  if (firstLine.length <= maxLen) return firstLine;
  return `${firstLine.slice(0, Math.max(0, maxLen - 1))}…`;
}
