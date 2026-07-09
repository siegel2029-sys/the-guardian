import LegalPageLayout from './LegalPageLayout';
import { PrivacyPolicyBody } from './legalDocumentBodies';

/** Public page, or `embedded` body for in-modal accordions (no page chrome). */
export default function PrivacyPolicy({ embedded = false }: { embedded?: boolean }) {
  const body = (
    <div className={embedded ? undefined : 'p-6'}>
      <PrivacyPolicyBody />
    </div>
  );
  if (embedded) return body;
  return (
    <LegalPageLayout title="מדיניות פרטיות" subtitle="מדיניות פרטיות - PHYSIOSHIELD">
      {body}
    </LegalPageLayout>
  );
}
