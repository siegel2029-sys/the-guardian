import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  persistPatientPushProfile,
  registerPatientPushForSupabase,
  syncWebPushDatabasePayloadIfStale,
  touchPatientLastLoginThrottled,
} from '../services/patientPushNotifications';

export function usePatientReminderInfrastructure(opts: {
  patientId: string | null;
  active: boolean;
  portalTab: string;
}): {
  exerciseLogCount: number | null;
  refetchExerciseLogCount: () => Promise<void>;
} {
  const { patientId, active, portalTab } = opts;
  const { isLoading: authLoading, isAuthenticated } = useAuth();
  const [exerciseLogCount, setExerciseLogCount] = useState<number | null>(null);
  const pushInitDone = useRef(false);

  const authReady = !authLoading && isAuthenticated;

  useEffect(() => {
    pushInitDone.current = false;
  }, [patientId, authReady]);

  const refetchExerciseLogCount = useCallback(async () => {
    if (!patientId || !isSupabaseConfigured || !supabase || !authReady) {
      setExerciseLogCount(null);
      return;
    }
    const { count, error } = await supabase
      .from('exercise_logs')
      .select('*', { count: 'exact', head: true })
      .eq('patient_id', patientId);
    if (error) {
      console.warn('[usePatientReminderInfrastructure] exercise_logs count', error.message);
      setExerciseLogCount(null);
      return;
    }
    setExerciseLogCount(count ?? 0);
  }, [patientId, authReady]);

  useEffect(() => {
    void refetchExerciseLogCount();
  }, [refetchExerciseLogCount, portalTab]);

  useEffect(() => {
    if (!active || !patientId || !isSupabaseConfigured || !supabase || !authReady) return;

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void touchPatientLastLoginThrottled(patientId);
      }
    };
    const onPointer = () => {
      void touchPatientLastLoginThrottled(patientId);
    };

    void touchPatientLastLoginThrottled(patientId, 0);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pointerdown', onPointer, { passive: true });

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [active, patientId, authReady]);

  useEffect(() => {
    if (!active || !patientId || !isSupabaseConfigured || !supabase || !authReady) {
      return;
    }
    if (pushInitDone.current) {
      return;
    }
    pushInitDone.current = true;

    void (async () => {
      await syncWebPushDatabasePayloadIfStale(patientId);
      const reg = await registerPatientPushForSupabase(patientId);
      if (!reg.ok) {
        console.warn('[usePatientReminderInfrastructure] push register skipped:', reg.reason);
        return;
      }
      const saved = await persistPatientPushProfile({
        patientId,
        token: reg.token,
        webPushSubscription: reg.webPushSubscription,
      });
      if (!saved.ok) {
        console.warn('[usePatientReminderInfrastructure] push persist', saved.message);
      }
    })();
  }, [active, patientId, authReady]);

  return { exerciseLogCount, refetchExerciseLogCount };
}
