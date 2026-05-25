import type { AiSuggestion, Patient } from '../types';
import { filterTherapistPendingAiSuggestions } from './clinicalAiQueueMerge';

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
  aiSuggestions: AiSuggestion[],
  extraDismissedSignatures: Iterable<string> = []
): boolean {
  return (
    filterTherapistPendingAiSuggestions(aiSuggestions, patientId, {
      extraDismissedSignatures,
    }).length > 0
  );
}

export function patientIsActive(p: Pick<Patient, 'status'>): boolean {
  return p.status === 'active';
}

/** Roster «מוקפא» — legacy `paused` or explicit `frozen` status. */
export function patientIsFrozenStatus(p: Pick<Patient, 'status'>): boolean {
  return p.status === 'paused' || p.status === 'frozen';
}

export type RosterClinicalStats = {
  active: number;
  frozen: number;
  needsDataUpdate: number;
  pendingAiAdjustments: number;
  redFlags: number;
};

export function computeRosterClinicalStats(
  patients: Patient[],
  aiSuggestions: AiSuggestion[]
): RosterClinicalStats {
  let active = 0;
  let frozen = 0;
  let needsDataUpdate = 0;
  let pendingAiAdjustments = 0;
  let redFlags = 0;

  for (const p of patients) {
    if (patientIsActive(p)) active += 1;
    if (patientIsFrozenStatus(p)) frozen += 1;
    if (patientNeedsDataUpdate(p)) needsDataUpdate += 1;
    if (patientHasPendingAiAdjustments(
      p.id,
      aiSuggestions,
      p.clinicalInsightsQueue?.dismissedRecommendationSignatures ?? []
    )) pendingAiAdjustments += 1;
    if (p.hasRedFlag) redFlags += 1;
  }

  return {
    active,
    frozen,
    needsDataUpdate,
    pendingAiAdjustments,
    redFlags,
  };
}
