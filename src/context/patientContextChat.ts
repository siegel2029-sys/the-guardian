/**
 * PatientContext chat domain — PHI-safe operational logging for therapist/patient chat paths.
 * Narrow UI surface remains in `patientDomainHooks.usePatientChat`.
 */
import { devError, devLog, devWarn, redactId } from '../lib/safeLog';

export function logChatTherapistReplyInvoked(patientId: string, hasBody: boolean): void {
  devLog('[Chat] sendTherapistReply invoked', {
    patientId: redactId(patientId),
    hasBody,
  });
}

export function logChatAuthNotReady(): void {
  devWarn('[Chat] sendTherapistReply: auth session not ready');
}

export function logChatMissingTherapistUser(): void {
  devWarn('[Chat] sendTherapistReply: no authenticated therapist user');
}

export function logChatMissingTherapistIdOnPatient(patientId: string): void {
  devWarn('[Chat] sendTherapistReply: missing therapist_id on patient record', {
    patientId: redactId(patientId),
  });
}

export function logChatInsertFailed(role: 'therapist' | 'patient', message: string): void {
  devError(`[Chat] insert${role === 'therapist' ? 'Therapist' : 'Patient'}ChatMessage failed`, {
    reason: message,
  });
}
