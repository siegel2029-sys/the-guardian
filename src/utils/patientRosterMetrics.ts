import type { AiSuggestion, Patient, PatientStatus } from '../types';
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
  if (p.intakeStatus === 'pending') return false;
  if (p.intakeStatus === 'complete') return true;
  return p.initialIntakeArchive != null;
}

/**
 * Portal account exists (credentials issued and/or patient has opened the portal).
 * Intake completeness is intentionally unrelated.
 */
export function patientHasPortalAccess(
  p: Pick<Patient, 'portalUsername' | 'lastLoginAt'>
): boolean {
  return Boolean((p.portalUsername ?? '').trim() || (p.lastLoginAt ?? '').trim());
}

/**
 * Roster/clinical status for display and filters.
 * Pending patients with portal access are treated as active — incomplete intake
 * must not downgrade them to "ממתין".
 */
export function resolvePatientRosterStatus(
  p: Pick<Patient, 'status' | 'accountFrozen' | 'portalUsername' | 'lastLoginAt'>
): PatientStatus {
  if (p.accountFrozen === true) return 'frozen';
  if (p.status === 'paused' || p.status === 'frozen') return p.status;
  if (p.status === 'pending' && patientHasPortalAccess(p)) return 'active';
  return p.status;
}

/** Persistable promote: pending → active once a portal account exists. */
export function promotePendingPatientIfPortalAccess<T extends Patient>(p: T): T {
  if (p.status !== 'pending' || !patientHasPortalAccess(p)) return p;
  return { ...p, status: 'active' };
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

export function patientIsFrozenStatus(
  p: Pick<Patient, 'status' | 'accountFrozen'>
): boolean {
  if (p.accountFrozen === true) return true;
  /** Legacy roster statuses before `accountFrozen` flag. */
  return p.status === 'paused' || p.status === 'frozen';
}

/** Active roster — effective clinical status and portal not frozen by therapist. */
export function patientIsActive(
  p: Pick<Patient, 'status' | 'accountFrozen' | 'portalUsername' | 'lastLoginAt'>
): boolean {
  return resolvePatientRosterStatus(p) === 'active' && !patientIsFrozenStatus(p);
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
