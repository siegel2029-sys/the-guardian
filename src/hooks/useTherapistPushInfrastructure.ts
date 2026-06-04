import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { registerAndPersistTherapistPush } from '../services/therapistPushNotifications';

/**
 * Refreshes the therapist's push subscription whenever they open the dashboard / establish a valid
 * Supabase session. Subscribes with the server-validated VAPID public key and upserts the
 * fully-qualified registration (token + device keys + `last_activity_timestamp`) into
 * `public.profiles` so a patient → therapist chat message can deliver a live notification.
 *
 * Symmetric to {@link import('./usePatientReminderInfrastructure').usePatientReminderInfrastructure}
 * on the patient side.
 */
export function useTherapistPushInfrastructure(): void {
  const { therapist, sessionRole, usesSupabaseSession, isLoading, isAuthenticated } = useAuth();
  const therapistId = therapist?.id ?? null;
  const authReady = !isLoading && isAuthenticated;
  const initDone = useRef(false);

  useEffect(() => {
    initDone.current = false;
  }, [therapistId, authReady]);

  useEffect(() => {
    if (
      !therapistId ||
      sessionRole !== 'therapist' ||
      !usesSupabaseSession ||
      !authReady ||
      !isSupabaseConfigured ||
      !supabase
    ) {
      return;
    }
    if (initDone.current) return;
    initDone.current = true;

    void (async () => {
      const result = await registerAndPersistTherapistPush(therapistId);
      if (!result.ok) {
        console.warn('[useTherapistPushInfrastructure] therapist push setup skipped:', result.message);
      }
    })();
  }, [therapistId, sessionRole, usesSupabaseSession, authReady]);
}
