import { supabase, isSupabaseConfigured } from '../lib/supabase';

/**
 * Legal-consent tracking on `public.profiles` (see migration
 * `20260707200000_profiles_legal_consent.sql`). Written once by the
 * Legal Onboarding Gate when the user accepts all mandatory terms.
 */
export type LegalConsentStatus = {
  termsAccepted: boolean;
  privacyAccepted: boolean;
  medicalDisclaimerAccepted: boolean;
  legalAcceptedAt: string | null;
};

/** True only when every mandatory consent flag is set. */
export function hasAcceptedAllLegalTerms(status: LegalConsentStatus): boolean {
  return status.termsAccepted && status.privacyAccepted && status.medicalDisclaimerAccepted;
}

type LegalConsentRow = {
  terms_accepted?: boolean | null;
  privacy_accepted?: boolean | null;
  medical_disclaimer_accepted?: boolean | null;
  legal_accepted_at?: string | null;
};

const LEGAL_CONSENT_COLUMNS =
  'terms_accepted, privacy_accepted, medical_disclaimer_accepted, legal_accepted_at';

/**
 * Read the current user's legal-consent flags from `profiles`.
 * Returns `null` when Supabase is not configured or no profile row exists yet
 * (callers decide whether that means "show the gate").
 */
export async function fetchLegalConsentStatus(userId: string): Promise<LegalConsentStatus | null> {
  if (!isSupabaseConfigured || !supabase) return null;

  const { data, error } = await supabase
    .from('profiles')
    .select(LEGAL_CONSENT_COLUMNS)
    .eq('id', userId)
    .maybeSingle<LegalConsentRow>();

  if (error) {
    throw new Error(`[legalConsent] Failed to load consent status: ${error.message}`);
  }
  if (!data) return null;

  return {
    termsAccepted: data.terms_accepted === true,
    privacyAccepted: data.privacy_accepted === true,
    medicalDisclaimerAccepted: data.medical_disclaimer_accepted === true,
    legalAcceptedAt: data.legal_accepted_at ?? null,
  };
}

/**
 * Persist acceptance of all mandatory legal terms for the current user.
 * Sets `terms_accepted`, `privacy_accepted`, `medical_disclaimer_accepted` to true
 * and stamps `legal_accepted_at` with the client time.
 *
 * Note: RLS (`profiles_update_own`) only lets a user update their own row, and an
 * UPDATE that matches no row returns 0 rows without an error — so we `.select()`
 * back and fail loudly if nothing was written.
 */
export async function acceptLegalTerms(userId: string): Promise<LegalConsentStatus> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('[legalConsent] Supabase is not configured — cannot persist legal consent.');
  }

  const acceptedAt = new Date().toISOString();
  const { data, error } = await supabase
    .from('profiles')
    .update({
      terms_accepted: true,
      privacy_accepted: true,
      medical_disclaimer_accepted: true,
      legal_accepted_at: acceptedAt,
    })
    .eq('id', userId)
    .select(LEGAL_CONSENT_COLUMNS)
    .maybeSingle<LegalConsentRow>();

  if (error) {
    throw new Error(`[legalConsent] Failed to save consent: ${error.message}`);
  }
  if (!data) {
    throw new Error(
      '[legalConsent] Consent update matched no profile row (missing row or RLS mismatch).'
    );
  }

  return {
    termsAccepted: data.terms_accepted === true,
    privacyAccepted: data.privacy_accepted === true,
    medicalDisclaimerAccepted: data.medical_disclaimer_accepted === true,
    legalAcceptedAt: data.legal_accepted_at ?? acceptedAt,
  };
}
