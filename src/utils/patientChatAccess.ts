import type { Patient } from '../types';

/**
 * Self-guided / unassisted clinic patients have `allowChat: false`.
 * Missing flag defaults to allowed (legacy patients + assisted Zoom track).
 */
export function isPatientChatAllowed(
  patient: Pick<Patient, 'allowChat'> | null | undefined
): boolean {
  if (!patient) return true;
  return patient.allowChat !== false;
}
