import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { countExerciseLogsForPatient } from '../services/exerciseService';
import {
  persistPatientPushProfile,
  registerPatientPushForSupabase,
  syncWebPushDatabasePayloadIfStale,
  touchPatientLastLoginThrottled,
} from '../services/patientPushNotifications';
import { devWarn } from '../lib/safeLog';

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
    const result = await countExerciseLogsForPatient(supabase, patientId);
    if (!result.ok) {
      devWarn('[usePatientReminderInfrastructure] exercise_logs count', { message: result.message });
      setExerciseLogCount(null);
      return;
    }
    setExerciseLogCount(result.data);
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
        devWarn('[usePatientReminderInfrastructure] push register skipped:', { reason: reg.message });
        return;
      }
      const saved = await persistPatientPushProfile({
        patientId,
        token: reg.token,
        webPushSubscription: reg.webPushSubscription,
      });
      if (!saved.ok) {
        devWarn('[usePatientReminderInfrastructure] push persist', { message: saved.message });
      }
    })();
  }, [active, patientId, authReady]);

  return { exerciseLogCount, refetchExerciseLogCount };
}
