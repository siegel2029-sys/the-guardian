import type { Patient } from '../types';
import { resolvePatientSubscriptionTier } from './patientSubscriptionTier';

/**
 * Human therapist chat is allowed only for Premium care mode.
 * Generic (questionnaire / AI-led) must not unlock chat via a stale allowChat flag.
 */
export function isPatientChatAllowed(
  patient: Pick<Patient, 'allowChat' | 'subscriptionTier'> | null | undefined
): boolean {
  if (!patient) return true;
  if (resolvePatientSubscriptionTier(patient) === 'generic') return false;
  return patient.allowChat !== false;
}
