import type { Patient, PatientClinicalIntakeProfile } from '../types';
import {
  isClinicalIntakeProfileEmpty,
  parseClinicalIntakeProfileFromStory,
} from './clinicalIntakeTemplate';

/** מיזוג פרופילים — ערכים מאוחרים גוברים. */
function mergeProfiles(
  ...sources: (PatientClinicalIntakeProfile | undefined | null)[]
): PatientClinicalIntakeProfile {
  const out: PatientClinicalIntakeProfile = {};
  for (const src of sources) {
    if (!src) continue;
    if (src.ranges?.length) out.ranges = [...src.ranges];
    if (src.muscle_strength?.trim()) out.muscle_strength = src.muscle_strength.trim();
    if (src.special_tests?.length) out.special_tests = [...src.special_tests];
    if (src.goals?.length) out.goals = [...src.goals];
    out.medical_history = {
      ...(out.medical_history ?? {}),
      ...(src.medical_history ?? {}),
    };
  }
  return out;
}

/**
 * מקור אמת לתצוגה: `patient.clinicalIntakeProfile` → ארכיון אינטייק → parsing מהערות → legacy metadata.
 */
export function resolvePatientClinicalIntakeProfile(
  patient: Patient
): PatientClinicalIntakeProfile | undefined {
  const fromPatient = patient.clinicalIntakeProfile;
  const fromArchive =
    patient.initialIntakeArchive?.extras?.clinicalIntakeProfile ??
    undefined;
  const notes =
    patient.therapistNotes?.trim() ||
    patient.initialIntakeArchive?.therapistNotes?.trim() ||
    patient.initialIntakeArchive?.extras?.intakeStory?.trim() ||
    '';
  const fromNotes = notes ? parseClinicalIntakeProfileFromStory(notes) : undefined;

  const legacyMedical = patient.medicalProfileMetadata;
  const fromLegacy: PatientClinicalIntakeProfile | undefined = legacyMedical
    ? { medical_history: { ...legacyMedical } }
    : undefined;

  const merged = mergeProfiles(fromLegacy, fromNotes, fromArchive, fromPatient);
  return isClinicalIntakeProfileEmpty(merged) ? undefined : merged;
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

const PLACEHOLDER_NONE = new Set(['ללא', '—', '-', 'none', 'n/a']);

function isPlaceholderValue(v: string): boolean {
  const t = v.trim().toLowerCase();
  return !t || PLACEHOLDER_NONE.has(t);
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
