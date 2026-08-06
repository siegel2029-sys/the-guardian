import { useCallback, useEffect, useRef, useState } from 'react';
import {
  approveProgramReviewProposal,
  declineProgramReviewProposal,
  fetchPendingProgramReviewProposals,
  fetchProgramReviewEngineStatus,
  forceRunProgramReviewForPatient,
  type ProgramReviewEngineStatus,
  type ProgramReviewProposalRow,
} from '../services/programReviewService';

/**
 * Therapist portal: pending 3-day program review proposals + engine phase badges.
 * Prefetches on mount; approve/decline go through the service layer only.
 */
export function useProgramReviewProposals() {
  const [proposals, setProposals] = useState<ProgramReviewProposalRow[]>([]);
  const [engineStatus, setEngineStatus] = useState<ProgramReviewEngineStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);
  const [forceBusy, setForceBusy] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    const [proposalsResult, statusResult] = await Promise.all([
      fetchPendingProgramReviewProposals(),
      fetchProgramReviewEngineStatus(),
    ]);
    if (!mountedRef.current) return;
    if (!proposalsResult.ok) {
      setProposals([]);
      setError(proposalsResult.message);
    } else {
      setProposals(proposalsResult.data);
    }
    if (statusResult.ok) {
      setEngineStatus(statusResult.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [proposalsResult, statusResult] = await Promise.all([
        fetchPendingProgramReviewProposals(),
        fetchProgramReviewEngineStatus(),
      ]);
      if (cancelled || !mountedRef.current) return;
      if (!proposalsResult.ok) {
        setProposals([]);
        setError(proposalsResult.message);
      } else {
        setProposals(proposalsResult.data);
        setError(null);
      }
      if (statusResult.ok) setEngineStatus(statusResult.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Light poll while engine is active so therapist badges update without blocking patients.
  useEffect(() => {
    const phase = engineStatus?.phase;
    if (phase !== 'scanning' && phase !== 'analyzing') return;
    const id = window.setInterval(() => {
      void fetchProgramReviewEngineStatus().then((result) => {
        if (!mountedRef.current || !result.ok) return;
        setEngineStatus(result.data);
      });
    }, 8000);
    return () => window.clearInterval(id);
  }, [engineStatus?.phase]);

  const approve = useCallback(
    async (proposalId: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      // Lock immediately to prevent double-submit while RPC runs.
      if (actionBusyId) return { ok: false, message: 'פעולה כבר בתהליך.' };
      setActionBusyId(proposalId);
      try {
        const result = await approveProgramReviewProposal(proposalId);
        if (!result.ok) return { ok: false, message: result.message };
        await refresh();
        return { ok: true };
      } finally {
        if (mountedRef.current) setActionBusyId(null);
      }
    },
    [refresh, actionBusyId]
  );

  const decline = useCallback(
    async (proposalId: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (actionBusyId) return { ok: false, message: 'פעולה כבר בתהליך.' };
      setActionBusyId(proposalId);
      try {
        const result = await declineProgramReviewProposal(proposalId);
        if (!result.ok) return { ok: false, message: result.message };
        await refresh();
        return { ok: true };
      } finally {
        if (mountedRef.current) setActionBusyId(null);
      }
    },
    [refresh, actionBusyId]
  );

  const forceReviewNow = useCallback(
    async (
      patientId: string
    ): Promise<
      | { ok: true; decision: string; status: string; catalogDrivenSwaps: number }
      | { ok: false; message: string }
    > => {
      setForceBusy(true);
      try {
        // Optimistic engine phase so patient/therapist indicators light up immediately.
        setEngineStatus((prev) =>
          prev
            ? { ...prev, phase: 'scanning', startedAt: new Date().toISOString() }
            : {
                phase: 'scanning',
                startedAt: new Date().toISOString(),
                finishedAt: null,
                updatedAt: new Date().toISOString(),
                lastSummary: { forceDebug: true },
              }
        );
        const result = await forceRunProgramReviewForPatient(patientId);
        if (!result.ok) {
          await refresh();
          return { ok: false, message: result.message };
        }
        await refresh();
        return {
          ok: true,
          decision: result.data.decision,
          status: result.data.status,
          catalogDrivenSwaps: result.data.catalogDrivenSwaps,
        };
      } finally {
        if (mountedRef.current) setForceBusy(false);
      }
    },
    [refresh]
  );

  const engineActive =
    engineStatus?.phase === 'scanning' ||
    engineStatus?.phase === 'analyzing' ||
    forceBusy;

  return {
    proposals,
    pendingCount: proposals.length,
    pendingPatientIds: proposals.map((p) => p.patient_id),
    engineStatus,
    engineActive,
    loading,
    error,
    actionBusyId,
    forceBusy,
    refresh,
    approve,
    decline,
    forceReviewNow,
  };
}
