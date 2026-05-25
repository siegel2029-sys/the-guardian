/**
 * Proactive absence detection — card styling only (no sidebar / queue injects).
 * Uses sessionHistory + painHistory as the single source of truth.
 */

import type { AiSuggestion, Patient, SafetyAlert } from '../types';
import { getClinicalDate, clinicalDateToLocalMidnight } from '../utils/clinicalCalendar';
import {
  getLatestPatientClinicalActivityDay,
} from '../utils/patientPortalMeta';

export const PROLONGED_ABSENCE_THRESHOLD_DAYS = 5;

export const PROLONGED_ABSENCE_ALERT_ID = (patientId: string) => `absence-alert-${patientId}`;
export const PROLONGED_ABSENCE_SUGGESTION_ID = (patientId: string) => `absence-sug-${patientId}`;

function clinicalDaysBetween(earlierYmd: string, laterYmd: string): number {
  const diffMs =
    clinicalDateToLocalMidnight(laterYmd).getTime() -
    clinicalDateToLocalMidnight(earlierYmd).getTime();
  return Math.max(0, Math.round(diffMs / (24 * 60 * 60 * 1000)));
}

/** Whole clinical days since the latest logged session or pain report. */
export function computeDaysSinceLastPatientActivity(
  patient: Patient,
  clinicalToday: string = getClinicalDate()
): number | null {
  const mostRecent = getLatestPatientClinicalActivityDay(patient);
  if (!mostRecent) {
    const join = patient.joinDate?.slice(0, 10);
    if (!join) return null;
    return clinicalDaysBetween(join, clinicalToday);
  }
  return clinicalDaysBetween(mostRecent, clinicalToday);
}

export function isProlongedAbsence(
  patient: Patient,
  clinicalToday: string,
  thresholdDays = PROLONGED_ABSENCE_THRESHOLD_DAYS
): boolean {
  const days = computeDaysSinceLastPatientActivity(patient, clinicalToday);
  return days != null && days > thresholdDays;
}

export function isProlongedAbsenceSafetyAlert(alert: SafetyAlert): boolean {
  return (
    alert.reasonCode === 'PROLONGED_ABSENCE_SUPPORT' ||
    alert.id.startsWith('absence-alert-')
  );
}

export function isProlongedAbsenceSuggestion(suggestion: AiSuggestion): boolean {
  return suggestion.id.startsWith('absence-sug-');
}

export type ProactiveAbsencePurgeResult = {
  safetyAlerts: SafetyAlert[];
  aiSuggestions: AiSuggestion[];
  changed: boolean;
};

/** Strip legacy prolonged-absence queue items — absence is signaled on roster cards only. */
export function purgeProactiveAbsenceFromClinicalQueue(
  existingAlerts: SafetyAlert[],
  existingSuggestions: AiSuggestion[]
): ProactiveAbsencePurgeResult {
  const safetyAlerts = existingAlerts.filter((a) => !isProlongedAbsenceSafetyAlert(a));
  const aiSuggestions = existingSuggestions.filter((s) => !isProlongedAbsenceSuggestion(s));
  const changed =
    safetyAlerts.length !== existingAlerts.length ||
    aiSuggestions.length !== existingSuggestions.length;
  return { safetyAlerts, aiSuggestions, changed };
}
