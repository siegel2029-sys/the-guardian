import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import {
  persistPatientPushProfile,
  registerPatientPushForSupabase,
  syncWebPushDatabasePayloadIfStale,
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
  const [authUserId, setAuthUserId] = useState<string | null>(null);
  const pushInitDone = useRef(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setAuthUserId(null);
      return;
    }
    void supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthUserId(session?.user?.id ?? null);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthUserId(session?.user?.id ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    pushInitDone.current = false;
  }, [patientId, authUserId]);

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
    console.log('[Push hook] effect', {
      active,
      patientId: patientId ?? null,
      authUserId: authUserId ?? null,
      pushInitAlreadyDone: pushInitDone.current,
    });

    if (!active || !patientId || !isSupabaseConfigured || !supabase) {
      console.log('[Push hook] skip — inactive or missing patientId/supabase');
      return;
    }
    if (!authUserId) {
      console.log('[Push hook] skip — waiting for Supabase auth session (authUserId empty)');
      return;
    }
    if (pushInitDone.current) {
      console.log('[Push hook] skip — pushInitDone already true');
      return;
    }
    pushInitDone.current = true;

    console.log('[Push hook] invoking registerPatientPushForSupabase', { patientId });

    void (async () => {
      await syncWebPushDatabasePayloadIfStale(patientId);
      const reg = await registerPatientPushForSupabase(patientId);
      console.log('[Push hook] registerPatientPushForSupabase result', reg);
      if (!reg.ok) {
        console.warn('[usePatientReminderInfrastructure] push register skipped:', reg.reason);
        return;
      }
      console.log('[Push hook] calling persistPatientPushProfile');
      const saved = await persistPatientPushProfile({
        patientId,
        token: reg.token,
        webPushSubscription: reg.webPushSubscription,
      });
      console.log('[Push hook] persistPatientPushProfile result', saved);
      if (!saved.ok) {
        console.warn('[usePatientReminderInfrastructure] push persist', saved.message);
      }
    })();
  }, [active, patientId, authUserId]);

  return { exerciseLogCount, refetchExerciseLogCount };
}
