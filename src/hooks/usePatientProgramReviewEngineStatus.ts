import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchProgramReviewEngineStatus,
  type ProgramReviewEnginePhase,
} from '../services/programReviewService';

/**
 * Passive portal: light poll of background review-engine phase.
 * Passive-only — never opens UI chrome; consumers render a tiny inline indicator.
 */
export function usePatientProgramReviewEngineStatus(enabled: boolean) {
  const [phase, setPhase] = useState<ProgramReviewEnginePhase>('idle');
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    const result = await fetchProgramReviewEngineStatus();
    if (!mountedRef.current || !result.ok) return;
    setPhase(result.data.phase);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setPhase('idle');
      return;
    }
    void refresh();
  }, [enabled, refresh]);

  useEffect(() => {
    if (!enabled) return;
    const active = phase === 'scanning' || phase === 'analyzing';
    const ms = active ? 5000 : 25000;
    const id = window.setInterval(() => {
      void refresh();
    }, ms);
    return () => window.clearInterval(id);
  }, [enabled, phase, refresh]);

  const isActive = phase === 'scanning' || phase === 'analyzing';

  return { phase, isActive, refresh };
}
