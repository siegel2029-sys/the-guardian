import LegalPageLayout from './LegalPageLayout';
import { TermsOfUseBody } from './legalDocumentBodies';

/** Public page, or `embedded` body for in-modal accordions (no page chrome). */
export default function TermsOfUse({ embedded = false }: { embedded?: boolean }) {
  const body = (
    <div className={embedded ? undefined : 'p-6'}>
      <TermsOfUseBody />
    </div>
  );
  if (embedded) return body;
  return (
    <LegalPageLayout title="תנאי שימוש" subtitle="תנאי שימוש - PHYSIOSHIELD">
      {body}
    </LegalPageLayout>
  );
}
