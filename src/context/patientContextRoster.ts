/**
 * Patient roster normalize / therapist-scope helpers for PatientContext.
 * Keeps Iron Rule 4 promotion + progress field normalization out of the provider body.
 */
import type { Patient } from '../types';
import { normalizePatientProgressFields } from '../body/patientLevelXp';
import { promotePendingPatientIfPortalAccess } from '../utils/patientRosterMetrics';

/** Must satisfy Supabase password policy: min 8 chars, letters + digits. */
export function randomPatientPassword(): string {
  const letters = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const chars = letters + digits;
  let s = letters[Math.floor(Math.random() * letters.length)];
  s += digits[Math.floor(Math.random() * digits.length)];
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export function normalizePatientsTherapistIds(
  list: Patient[],
  options?: { fallbackTherapistId?: string | null }
): Patient[] {
  const fallback = options?.fallbackTherapistId ?? '';
  return list.map((p) => {
    const wa = (p.contactWhatsappE164 ?? '').replace(/\D/g, '');
    const withTherapist = normalizePatientProgressFields({
      ...p,
      therapistId: p.therapistId ?? fallback,
      injuryHighlightSegments: Array.isArray(p.injuryHighlightSegments)
        ? p.injuryHighlightSegments
        : [],
      secondaryClinicalBodyAreas: Array.isArray(p.secondaryClinicalBodyAreas)
        ? p.secondaryClinicalBodyAreas
        : [],
      contactWhatsappE164: wa.length >= 9 ? wa : undefined,
      redFlagActive: p.redFlagActive === true,
    });
    // Portal account ⇒ active; never keep "pending" solely for incomplete intake.
    return promotePendingPatientIfPortalAccess(withTherapist);
  });
}

export function patientMatchesTherapistScope(
  p: Patient,
  scopeIds: string[] | null | undefined,
): boolean {
  if (!scopeIds || scopeIds.length === 0) return true;
  return scopeIds.includes(p.therapistId);
}
