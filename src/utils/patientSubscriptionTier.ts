import type { Patient } from '../types';

/** Clinic care mode on `patients.subscription_tier` / payload.subscriptionTier. */
export type PatientSubscriptionTier = 'premium' | 'generic';

export const PATIENT_SUBSCRIPTION_TIERS = ['premium', 'generic'] as const;

export function normalizePatientSubscriptionTier(
  value: unknown
): PatientSubscriptionTier {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'generic') {
    return 'generic';
  }
  return 'premium';
}

/** Resolve tier from Patient model (payload field or missing → premium). */
export function resolvePatientSubscriptionTier(
  patient: Pick<Patient, 'subscriptionTier'> | null | undefined
): PatientSubscriptionTier {
  return normalizePatientSubscriptionTier(patient?.subscriptionTier);
}

/** Automated Program Review + patient-facing plan proposals — Generic only. */
export function isAiLedPlanReviewAllowed(
  tier: PatientSubscriptionTier | unknown
): boolean {
  return normalizePatientSubscriptionTier(tier) === 'generic';
}

/** Therapist Smart Clinical Approve/Decline remains available for Premium (and Generic clinic rows). */
export function isTherapistAiPlanAssistantAllowed(
  _tier: PatientSubscriptionTier | unknown
): boolean {
  return true;
}
