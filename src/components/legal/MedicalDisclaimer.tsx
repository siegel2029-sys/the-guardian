import LegalPageLayout from './LegalPageLayout';
import { MedicalDisclaimerBody } from './legalDocumentBodies';

export default function MedicalDisclaimer() {
  return (
    <LegalPageLayout title="הצהרה רפואית" subtitle="הצהרה רפואית - PHYSIOSHIELD">
      <div className="p-6">
        <MedicalDisclaimerBody />
      </div>
    </LegalPageLayout>
  );
}
