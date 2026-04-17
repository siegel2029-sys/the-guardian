import type { Patient } from '../types';

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  );
}

/**
 * שם תצוגה למטפל: עדיפות לכינוי/מזהה פורטל קצר על פני שם גנרי או UUID מהמסד.
 */
export function getPatientDisplayName(p: Patient): string {
  const alias = p.displayAlias?.trim();
  if (alias) return alias;

  const n = p.name?.trim() ?? '';
  const portal = p.portalUsername?.trim();

  const genericName =
    !n ||
    /^מטופל חדש$/i.test(n) ||
    /^patient[-_]/i.test(n) ||
    isUuidLike(n);

  if (genericName && portal) return portal;
  if (n && !genericName) return n;
  return portal || n || 'מטופל';
}
