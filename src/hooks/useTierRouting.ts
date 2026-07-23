import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  getClinicPatientIdFromUser,
  getPatientProductTier,
  type PatientProductTier,
} from '../lib/mapSupabaseUser';
import type { User } from '@supabase/supabase-js';

export type TierRoutingState = {
  /** Resolved product tier for portal / dashboard routing. */
  tier: PatientProductTier | 'anonymous';
  /** Clinic-linked patient id when tier is `pro`; null for freemium / therapist. */
  clinicPatientId: string | null;
  isProPatient: boolean;
  isFreePatient: boolean;
  isTherapist: boolean;
  isLoading: boolean;
};

/**
 * Reads secure clinic `patient_id` / freemium claims (via AuthContext, which prefers
 * `app_metadata`) to route Store (free) vs Clinic invite (pro) users.
 * Foundational for B2C freemium — does not invent billing beyond JWT metadata.
 */
export function useTierRouting(): TierRoutingState {
  const { session, sessionRole, patientSessionId, isLoading } = useAuth();

  return useMemo(() => {
    if (isLoading) {
      return {
        tier: 'anonymous',
        clinicPatientId: null,
        isProPatient: false,
        isFreePatient: false,
        isTherapist: false,
        isLoading: true,
      };
    }

    if (sessionRole === 'therapist' || session?.role === 'therapist') {
      return {
        tier: 'therapist',
        clinicPatientId: null,
        isProPatient: false,
        isFreePatient: false,
        isTherapist: true,
        isLoading: false,
      };
    }

    if (patientSessionId) {
      return {
        tier: 'pro',
        clinicPatientId: patientSessionId,
        isProPatient: true,
        isFreePatient: false,
        isTherapist: false,
        isLoading: false,
      };
    }

    if (sessionRole === 'patient') {
      // Freemium / App Store — patient role without clinic patient_id.
      return {
        tier: 'free',
        clinicPatientId: null,
        isProPatient: false,
        isFreePatient: true,
        isTherapist: false,
        isLoading: false,
      };
    }

    return {
      tier: 'anonymous',
      clinicPatientId: null,
      isProPatient: false,
      isFreePatient: false,
      isTherapist: false,
      isLoading: false,
    };
  }, [isLoading, session, sessionRole, patientSessionId]);
}

/** Pure helper for tests / non-hook callers with a Supabase User. */
export function resolveTierFromUser(user: User): {
  tier: PatientProductTier;
  clinicPatientId: string | null;
} {
  return {
    tier: getPatientProductTier(user),
    clinicPatientId: getClinicPatientIdFromUser(user) ?? null,
  };
}
