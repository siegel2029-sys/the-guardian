import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  persistPatientPushProfile,
  registerPatientPushForSupabase,
  touchPatientLastActivityThrottled,
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
  const [exerciseLogCount, setExerciseLogCount] = useState<number | null>(null);
  const pushInitDone = useRef(false);

  useEffect(() => {
    pushInitDone.current = false;
  }, [patientId]);

  const refetchExerciseLogCount = useCallback(async () => {
    if (!patientId || !isSupabaseConfigured || !supabase) {
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
  }, [patientId]);

  useEffect(() => {
    void refetchExerciseLogCount();
  }, [refetchExerciseLogCount, portalTab]);

  useEffect(() => {
    if (!active || !patientId || !isSupabaseConfigured || !supabase) return;

    const onVis = () => {
      if (document.visibilityState === 'visible') {
        void touchPatientLastActivityThrottled(patientId);
      }
    };
    const onPointer = () => {
      void touchPatientLastActivityThrottled(patientId);
    };

    void touchPatientLastActivityThrottled(patientId, 0);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pointerdown', onPointer, { passive: true });

    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [active, patientId]);

  useEffect(() => {
    if (!active || !patientId || !isSupabaseConfigured || !supabase) return;
    if (pushInitDone.current) return;
    pushInitDone.current = true;

    void (async () => {
      const reg = await registerPatientPushForSupabase(patientId);
      if (!reg.ok) {
        if (import.meta.env.DEV) {
          console.info('[usePatientReminderInfrastructure] push register skipped:', reg.reason);
        }
        return;
      }
      const saved = await persistPatientPushProfile({
        patientId,
        token: reg.token,
        webPushSubscription: reg.webPushSubscription,
      });
      if (!saved.ok && import.meta.env.DEV) {
        console.warn('[usePatientReminderInfrastructure] push persist', saved.message);
      }
    })();
  }, [active, patientId]);

  return { exerciseLogCount, refetchExerciseLogCount };
}
