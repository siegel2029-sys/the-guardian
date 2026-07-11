import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../../context/AuthContext';
import { readLocalTermsAccepted } from '../../services/legalConsent';
import PatientLegalOnboardingModal from './PatientLegalOnboardingModal';

/**
 * Patient-only legal consent gate.
 * Honors the local terms-accepted cache first so offline / poor connectivity
 * never re-blocks a patient who already approved on this device.
 */
export default function PatientLegalGate({ children }: { children: ReactNode }) {
  const { sessionRole, patientSessionId } = useAuth();
  const isPatient = sessionRole === 'patient' && !!patientSessionId;
  const [consentGranted, setConsentGranted] = useState(() =>
    Boolean(patientSessionId && readLocalTermsAccepted(patientSessionId))
  );

  useEffect(() => {
    if (!patientSessionId) {
      setConsentGranted(false);
      return;
    }
    if (readLocalTermsAccepted(patientSessionId)) {
      setConsentGranted(true);
    } else {
      setConsentGranted(false);
    }
  }, [patientSessionId]);

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
