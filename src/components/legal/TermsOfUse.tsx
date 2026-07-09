import LegalPageLayout from './LegalPageLayout';
import { TermsOfUseBody } from './legalDocumentBodies';

export default function TermsOfUse() {
  return (
    <LegalPageLayout title="תנאי שימוש" subtitle="תנאי שימוש - PHYSIOSHIELD">
      <div className="p-6">
        <TermsOfUseBody />
      </div>
    </LegalPageLayout>
  );
}
