import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { hasAcceptedAllLegalTerms, type LegalConsentStatus } from './legalConsent';

export { hasAcceptedAllLegalTerms };
export type { LegalConsentStatus };

type PatientLegalConsentRow = {
  terms_accepted?: boolean | null;
  privacy_accepted?: boolean | null;
  medical_disclaimer_accepted?: boolean | null;
  legal_accepted_at?: string | null;
};

const PATIENT_LEGAL_CONSENT_COLUMNS =
  'terms_accepted, privacy_accepted, medical_disclaimer_accepted, legal_accepted_at';

function mapRow(data: PatientLegalConsentRow): LegalConsentStatus {
  return {
    termsAccepted: data.terms_accepted === true,
    privacyAccepted: data.privacy_accepted === true,
    medicalDisclaimerAccepted: data.medical_disclaimer_accepted === true,
    legalAcceptedAt: data.legal_accepted_at ?? null,
  };
}

function logSupabaseError(
  operation: string,
  patientId: string,
  error: { message?: string; code?: string; details?: string; hint?: string }
): void {
  console.error(`[patientLegalConsent] ${operation} failed`, {
    patientId,
    message: error.message,
    code: error.code,
    details: error.details,
    hint: error.hint,
  });
}

/**
 * Read the portal patient's legal-consent flags from `public.patients`.
 * Throws on Supabase/network errors so callers can surface them to the user.
 */
export async function fetchPatientLegalConsentStatus(
  patientId: string
): Promise<LegalConsentStatus | null> {
  if (!isSupabaseConfigured || !supabase) {
    const err = new Error('[patientLegalConsent] Supabase is not configured.');
    console.error('[patientLegalConsent] fetchPatientLegalConsentStatus failed', {
      patientId,
      message: err.message,
    });
    throw err;
  }

  const { data, error } = await supabase
    .from('patients')
    .select(PATIENT_LEGAL_CONSENT_COLUMNS)
    .eq('id', patientId)
    .maybeSingle<PatientLegalConsentRow>();

  if (error) {
    logSupabaseError('fetchPatientLegalConsentStatus', patientId, error);
    throw error;
  }
  if (!data) return null;

  return mapRow(data);
}

/**
 * Persist acceptance of all mandatory legal terms for the portal patient.
 */
export async function acceptPatientLegalTerms(patientId: string): Promise<LegalConsentStatus> {
  if (!isSupabaseConfigured || !supabase) {
    const err = new Error('[patientLegalConsent] Supabase is not configured.');
    console.error('[patientLegalConsent] acceptPatientLegalTerms failed', {
      patientId,
      message: err.message,
    });
    throw err;
  }

  const acceptedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('patients')
    .update({
      terms_accepted: true,
      privacy_accepted: true,
      medical_disclaimer_accepted: true,
      legal_accepted_at: acceptedAt,
    })
    .eq('id', patientId)
    .select(PATIENT_LEGAL_CONSENT_COLUMNS)
    .maybeSingle<PatientLegalConsentRow>();

  if (error) {
    logSupabaseError('acceptPatientLegalTerms', patientId, error);
    throw error;
  }
  if (!data) {
    const err = new Error(
      '[patientLegalConsent] Consent update matched no patient row (missing row or RLS mismatch).'
    );
    console.error('[patientLegalConsent] acceptPatientLegalTerms failed', {
      patientId,
      message: err.message,
    });
    throw err;
  }

  return mapRow(data);
}

export function isPatientLegallyAccepted(status: LegalConsentStatus | null): boolean {
  return status !== null && hasAcceptedAllLegalTerms(status) && status.legalAcceptedAt !== null;
}

export const PATIENT_LEGAL_NETWORK_ERROR =
  'שגיאת תקשורת: אנא בדוק את החיבור לאינטרנט ונסה שנית';
