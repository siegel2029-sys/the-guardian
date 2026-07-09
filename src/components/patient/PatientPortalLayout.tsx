import type { ReactNode } from 'react';
import AccessibilityWidget from '../accessibility/AccessibilityWidget';

/** Patient portal shell — accessibility widget (patient-only). */
export default function PatientPortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <div className="flex-1 flex flex-col">{children}</div>
      <AccessibilityWidget />
    </div>
  );
}
