/**
 * תווית קצרה למקור הקישור (דומיין), לתצוגה למטופל ולמטפל.
 */
export function getKnowledgeSourceBadgeText(url: string): string {
  const t = url.trim();
  if (!t) return 'מקור';
  try {
    const u = new URL(t);
    return u.hostname.replace(/^www\./i, '') || 'מקור';
  } catch {
    return 'מקור';
  }
}
