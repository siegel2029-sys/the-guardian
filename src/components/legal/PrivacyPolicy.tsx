import LegalPageLayout from './LegalPageLayout';
import { PrivacyPolicyBody } from './legalDocumentBodies';

export default function PrivacyPolicy() {
  return (
    <LegalPageLayout title="מדיניות פרטיות" subtitle="מדיניות פרטיות - PHYSIOSHIELD">
      <div className="p-6">
        <PrivacyPolicyBody />
      </div>
    </LegalPageLayout>
  );
}
