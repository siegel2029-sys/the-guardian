import LegalPageLayout from './LegalPageLayout';
import { MedicalDisclaimerBody } from './legalDocumentBodies';

/** Public page, or `embedded` body for in-modal accordions (no page chrome). */
export default function MedicalDisclaimer({ embedded = false }: { embedded?: boolean }) {
  const body = (
    <div className={embedded ? undefined : 'p-6'}>
      <MedicalDisclaimerBody />
    </div>
  );
  if (embedded) return body;
  return (
    <LegalPageLayout title="הצהרה רפואית" subtitle="הצהרה רפואית - PHYSIOSHIELD">
      {body}
    </LegalPageLayout>
  );
}
