import { useState, type ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import PatientLegalOnboardingModal from './PatientLegalOnboardingModal';

/**
 * Patient-only legal consent gate.
 * Delegates fetch/submit to PatientLegalOnboardingModal (direct Supabase, no offline cache).
 */
export default function PatientLegalGate({ children }: { children: ReactNode }) {
  const { sessionRole, patientSessionId } = useAuth();
  const isPatient = sessionRole === 'patient' && !!patientSessionId;
  const [consentGranted, setConsentGranted] = useState(false);

  if (!isPatient || !patientSessionId) {
    return <>{children}</>;
  }

  if (consentGranted) {
    return <>{children}</>;
  }

  return (
    <PatientLegalOnboardingModal
      patientId={patientSessionId}
      onAccepted={() => setConsentGranted(true)}
    />
  );
}
