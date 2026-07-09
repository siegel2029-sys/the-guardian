/** Public legal document paths — excluded from consent-gate overlays. */
export const LEGAL_PAGE_PATHS = [
  '/legal/terms-of-use',
  '/legal/privacy-policy',
  '/legal/medical-disclaimer',
  '/legal/refund-policy',
  '/legal/accessibility',
] as const;

export type LegalPagePath = (typeof LEGAL_PAGE_PATHS)[number];

export function isLegalPagePath(pathname: string): boolean {
  return (LEGAL_PAGE_PATHS as readonly string[]).includes(pathname);
}
