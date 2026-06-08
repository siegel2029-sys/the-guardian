import type { Patient, PatientClinicalIntakeProfile } from '../types';
import { isClinicalIntakeTextFieldAnswered } from './clinicalIntakeFieldAnswers';
import { isClinicalIntakeProfileEmpty } from './clinicalIntakeTemplate';
import { resolveClinicalIntakeProfileForDisplay } from './clinicalIntakeProfileMigration';
import { loadLatestIntakeFields } from './clinicalIntakeVersions';

/**
 * מקור אמת לתצוגה: גרסת אינטייק אחרונה → `patient.clinicalIntakeProfile` → ארכיון → legacy.
 */
export function resolvePatientClinicalIntakeProfile(
  patient: Patient
): PatientClinicalIntakeProfile | undefined {
  const latestFields = loadLatestIntakeFields(patient, { skipLegacyRestore: true });
  if (!isClinicalIntakeProfileEmpty(latestFields.clinicalIntakeProfile)) {
    return latestFields.clinicalIntakeProfile;
  }
  return resolveClinicalIntakeProfileForDisplay(patient);
}

export type ClinicalIntakeProfileSlotId =
  | 'ranges'
  | 'strength'
  | 'special_tests'
  | 'medical_history'
  | 'goals';

export type ClinicalIntakeProfileSlot = {
  id: ClinicalIntakeProfileSlotId;
  titleHe: string;
  emptyHe: string;
  hasData: boolean;
  /** שורות לתצוגה — רשימה או טקסט בודד */
  lines: string[];
};

function isPlaceholderValue(v: string): boolean {
  return !isClinicalIntakeTextFieldAnswered(v);
}

export function buildClinicalIntakeProfileSlots(
  profile: PatientClinicalIntakeProfile | undefined
): ClinicalIntakeProfileSlot[] {
  const p = profile ?? {};
  const bg = p.medical_history?.backgroundDiseases?.trim() ?? '';
  const meds = p.medical_history?.chronicMedications?.trim() ?? '';
  const strength = p.muscle_strength?.trim() ?? '';
  const ranges = (p.ranges ?? []).map((s) => s.trim()).filter(Boolean);
  const tests = (p.special_tests ?? []).map((s) => s.trim()).filter(Boolean);
  const goals = (p.goals ?? []).map((s) => s.trim()).filter(Boolean);

  const medicalLines: string[] = [];
  if (bg && !isPlaceholderValue(bg)) medicalLines.push(`מחלות רקע: ${bg}`);
  if (meds && !isPlaceholderValue(meds)) medicalLines.push(`תרופות קבועות: ${meds}`);
  if (medicalLines.length === 0 && (bg || meds)) {
    if (bg) medicalLines.push(`מחלות רקע: ${bg}`);
    if (meds) medicalLines.push(`תרופות קבועות: ${meds}`);
  }

  return [
    {
      id: 'ranges',
      titleHe: 'טווחי תנועה (ROM)',
      emptyHe: 'טרם הוזנו נתוני ROM באינטייק',
      hasData: ranges.length > 0,
      lines: ranges,
    },
    {
      id: 'strength',
      titleHe: 'כוח שרירים (MMT)',
      emptyHe: 'טרם הוזן סיכום כוח שרירים',
      hasData: strength.length > 0 && !isPlaceholderValue(strength),
      lines: strength ? [strength] : [],
    },
    {
      id: 'special_tests',
      titleHe: 'בדיקות מיוחדות',
      emptyHe: 'טרם הוזנו בדיקות מיוחדות',
      hasData: tests.length > 0,
      lines: tests,
    },
    {
      id: 'medical_history',
      titleHe: 'רקע רפואי',
      emptyHe: 'טרם הוזנו מחלות רקע / תרופות',
      hasData: medicalLines.length > 0,
      lines: medicalLines,
    },
    {
      id: 'goals',
      titleHe: 'מטרות שיקום',
      emptyHe: 'טרם הוגדרו מטרות תפקודיות',
      hasData: goals.length > 0,
      lines: goals,
    },
  ];
}
