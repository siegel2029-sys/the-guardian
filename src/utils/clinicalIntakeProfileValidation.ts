import type { PatientClinicalIntakeProfile } from '../types';
import type { ClinicalIntakeProfileSlotId } from './clinicalIntakeProfileDisplay';
import {
  isClinicalIntakeNegativeAnswer,
  isClinicalIntakeTextFieldAnswered,
  lineContainsClinicalRomValue,
  lineContainsClinicalStrengthScore,
} from './clinicalIntakeFieldAnswers';

export type ClinicalIntakeProfileFieldKey =
  | 'backgroundDiseases'
  | 'chronicMedications'
  | 'ranges'
  | 'muscle_strength'
  | 'goals';

function hasValidRangeEntry(profile: PatientClinicalIntakeProfile): boolean {
  return (profile.ranges ?? []).some((raw) => {
    const base = raw.split('|')[0]?.trim() ?? '';
    if (!base) return false;
    if (isClinicalIntakeNegativeAnswer(base)) return true;
    if (lineContainsClinicalRomValue(base)) return true;
    const colon = base.indexOf(':');
    if (colon >= 0) {
      const movement = base.slice(0, colon).trim();
      const value = base.slice(colon + 1).trim();
      if (isClinicalIntakeNegativeAnswer(movement) || isClinicalIntakeNegativeAnswer(value)) {
        return true;
      }
      return movement.length > 0 || value.length > 0;
    }
    return base.length > 0;
  });
}

function hasValidStrengthEntry(profile: PatientClinicalIntakeProfile): boolean {
  const raw = profile.muscle_strength?.trim() ?? '';
  if (!raw) return false;
  if (isClinicalIntakeNegativeAnswer(raw)) return true;
  return raw.split(/\r?\n/).some((line) => {
    const t = line.trim();
    if (!t) return false;
    if (isClinicalIntakeNegativeAnswer(t)) return true;
    if (lineContainsClinicalStrengthScore(t)) return true;
    return /:\s*\d/.test(t) || /\d(?:\.\d)?\s*$/.test(t);
  });
}

function hasValidGoalEntry(profile: PatientClinicalIntakeProfile): boolean {
  return (profile.goals ?? []).some((g) => isClinicalIntakeTextFieldAnswered(g));
}

const FIELD_TO_TAB: Record<ClinicalIntakeProfileFieldKey, ClinicalIntakeProfileSlotId> = {
  backgroundDiseases: 'medical_history',
  chronicMedications: 'medical_history',
  ranges: 'ranges',
  muscle_strength: 'strength',
  goals: 'goals',
};

export type ClinicalIntakeProfileValidation = {
  missingFieldKeys: ClinicalIntakeProfileFieldKey[];
  missingTabIds: ClinicalIntakeProfileSlotId[];
  missingCount: number;
  isComplete: boolean;
};

export function getClinicalIntakeProfileValidation(
  profile: PatientClinicalIntakeProfile | undefined
): ClinicalIntakeProfileValidation {
  const p = profile ?? {};
  const missingFieldKeys: ClinicalIntakeProfileFieldKey[] = [];

  if (!isClinicalIntakeTextFieldAnswered(p.medical_history?.backgroundDiseases)) {
    missingFieldKeys.push('backgroundDiseases');
  }
  if (!isClinicalIntakeTextFieldAnswered(p.medical_history?.chronicMedications)) {
    missingFieldKeys.push('chronicMedications');
  }
  if (!hasValidRangeEntry(p)) missingFieldKeys.push('ranges');
  if (!hasValidStrengthEntry(p)) missingFieldKeys.push('muscle_strength');
  if (!hasValidGoalEntry(p)) missingFieldKeys.push('goals');

  const missingTabIds = [
    ...new Set(missingFieldKeys.map((k) => FIELD_TO_TAB[k])),
  ] as ClinicalIntakeProfileSlotId[];

  return {
    missingFieldKeys,
    missingTabIds,
    missingCount: missingFieldKeys.length,
    isComplete: missingFieldKeys.length === 0,
  };
}

export function isClinicalIntakeFieldMissing(
  validation: ClinicalIntakeProfileValidation,
  field: ClinicalIntakeProfileFieldKey
): boolean {
  return validation.missingFieldKeys.includes(field);
}

export function isClinicalIntakeTabMissing(
  validation: ClinicalIntakeProfileValidation,
  tabId: ClinicalIntakeProfileSlotId
): boolean {
  return validation.missingTabIds.includes(tabId);
}
