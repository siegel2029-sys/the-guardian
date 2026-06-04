import type { PatientClinicalIntakeProfile } from '../types';

/** JSON-safe clinical intake profile for Supabase patient payload. */
export function normalizeClinicalIntakeProfileForStorage(
  raw: PatientClinicalIntakeProfile | undefined | null
): PatientClinicalIntakeProfile | undefined {
  if (!raw) return undefined;

  const ranges = (raw.ranges ?? [])
    .map((s) => (typeof s === 'string' ? s.trim() : String(s).trim()))
    .filter(Boolean);

  const muscle_strength =
    typeof raw.muscle_strength === 'string'
      ? raw.muscle_strength.trim()
      : raw.muscle_strength != null
        ? String(raw.muscle_strength).trim()
        : '';

  const special_tests = (raw.special_tests ?? [])
    .map((s) => (typeof s === 'string' ? s.trim() : String(s).trim()))
    .filter(Boolean);

  const goals = (raw.goals ?? [])
    .map((s) => (typeof s === 'string' ? s.trim() : String(s).trim()))
    .filter(Boolean);

  const bg = raw.medical_history?.backgroundDiseases?.trim() ?? '';
  const meds = raw.medical_history?.chronicMedications?.trim() ?? '';

  const hasMedical = Boolean(bg || meds);
  const hasData =
    ranges.length > 0 ||
    Boolean(muscle_strength) ||
    special_tests.length > 0 ||
    goals.length > 0 ||
    hasMedical;

  if (!hasData) return undefined;

  const out: PatientClinicalIntakeProfile = {};
  if (ranges.length) out.ranges = ranges;
  if (muscle_strength) out.muscle_strength = muscle_strength;
  if (special_tests.length) out.special_tests = special_tests;
  if (goals.length) out.goals = goals;
  if (hasMedical) {
    out.medical_history = {
      ...(bg ? { backgroundDiseases: bg } : {}),
      ...(meds ? { chronicMedications: meds } : {}),
    };
  }
  return out;
}
