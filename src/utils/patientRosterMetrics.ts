import type { AiSuggestion, Patient } from '../types';

/** Placeholder copy shown in the demographics free-text field when empty. */
export const DEMOGRAPHICS_FREE_TEXT_PLACEHOLDER = 'מגדר, גיל, עבודה…';

export function patientHasDemographicsFreeText(
  p: Pick<Patient, 'demographicsFreeText'>
): boolean {
  const trimmed = (p.demographicsFreeText ?? '').trim();
  if (!trimmed) return false;
  if (trimmed === DEMOGRAPHICS_FREE_TEXT_PLACEHOLDER) return false;
  return true;
}

/** Initial intake archive is written once clinical intake is saved. */
export function patientHasCompletedIntake(p: Patient): boolean {
  return p.initialIntakeArchive != null;
}

export type PatientDataUpdateGap = 'demographics' | 'intake';

export function getPatientDataUpdateGaps(p: Patient): PatientDataUpdateGap[] {
  const gaps: PatientDataUpdateGap[] = [];
  if (!patientHasDemographicsFreeText(p)) gaps.push('demographics');
  if (!patientHasCompletedIntake(p)) gaps.push('intake');
  return gaps;
}

/** Missing demographics free text or incomplete intake questionnaire. */
export function patientNeedsDataUpdate(p: Patient): boolean {
  return getPatientDataUpdateGaps(p).length > 0;
}

export function patientDataUpdateGapSet(p: Patient): Set<PatientDataUpdateGap> {
  return new Set(getPatientDataUpdateGaps(p));
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
