import type { Patient } from '../types';

function isUuidLike(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim()
  );
}

/** מזהים טכניים שלא מתאימים לתצוגה כשם */
function looksLikeTechnicalId(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (isUuidLike(t)) return true;
  if (/^patient[-_]/i.test(t)) return true;
  if (/^[a-f0-9]{24,}$/i.test(t)) return true;
  if (/^user_[a-z0-9]{8,}$/i.test(t)) return true;
  return false;
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

  const portalOk = portal && !looksLikeTechnicalId(portal);

  if (genericName && portalOk) return portal;
  if (n && !genericName) return n;
  if (portalOk) return portal;
  if (n && !looksLikeTechnicalId(n)) return n;
  return 'מטופל';
}
