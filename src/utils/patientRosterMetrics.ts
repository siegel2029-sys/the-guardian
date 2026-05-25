import type { AiSuggestion, Patient } from '../types';

const MIN_PHONE_DIGITS = 9;

export function patientHasValidContactPhone(p: Patient): boolean {
  const digits = (p.contactWhatsappE164 ?? '').replace(/\D/g, '');
  return digits.length >= MIN_PHONE_DIGITS;
}

export function patientHasBirthDate(p: Patient): boolean {
  return (p.birthDate?.trim() ?? '').length > 0;
}

/** Initial intake archive is written once clinical intake is saved. */
export function patientHasCompletedIntake(p: Patient): boolean {
  return p.initialIntakeArchive != null;
}

/** Missing core demographics or incomplete intake. */
export function patientNeedsDataUpdate(p: Patient): boolean {
  return (
    !patientHasValidContactPhone(p) ||
    !patientHasBirthDate(p) ||
    !patientHasCompletedIntake(p)
  );
}

export function isUnhandledAiSuggestion(s: AiSuggestion): boolean {
  return s.status === 'pending' || s.status === 'awaiting_therapist';
}

export function patientHasPendingAiAdjustments(
  patientId: string,
  aiSuggestions: AiSuggestion[]
): boolean {
  return aiSuggestions.some(
    (s) => s.patientId === patientId && isUnhandledAiSuggestion(s)
  );
}

export type RosterClinicalStats = {
  total: number;
  needsDataUpdate: number;
  pendingAiAdjustments: number;
  redFlags: number;
};

export function computeRosterClinicalStats(
  patients: Patient[],
  aiSuggestions: AiSuggestion[]
): RosterClinicalStats {
  let needsDataUpdate = 0;
  let pendingAiAdjustments = 0;
  let redFlags = 0;

  for (const p of patients) {
    if (patientNeedsDataUpdate(p)) needsDataUpdate += 1;
    if (patientHasPendingAiAdjustments(p.id, aiSuggestions)) pendingAiAdjustments += 1;
    if (p.hasRedFlag) redFlags += 1;
  }

  return {
    total: patients.length,
    needsDataUpdate,
    pendingAiAdjustments,
    redFlags,
  };
}
