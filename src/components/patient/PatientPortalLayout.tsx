import type { ReactNode } from 'react';
import LegalFooter from '../legal/LegalFooter';
import AccessibilityWidget from '../accessibility/AccessibilityWidget';

/** Patient portal shell — legal footer and accessibility widget (patient-only). */
export default function PatientPortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <div className="flex-1 flex flex-col pb-20">{children}</div>
      <LegalFooter />
      <AccessibilityWidget />
    </div>
  );
}
