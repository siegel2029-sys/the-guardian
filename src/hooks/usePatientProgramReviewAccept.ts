import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Patient } from '../types';
import {
  isActionableProgramReviewChange,
  programReviewChangeKey,
} from '../ai/applyProgramReviewChanges';
import { isAiLedPlanReviewAllowed } from '../utils/patientSubscriptionTier';
import {
  fetchPendingProgramReviewForPatient,
  patientApplyProgramReviewItems,
  patientDeclineProgramReviewProposal,
  type ProgramReviewProposalRow,
  type ProgramReviewProposedChange,
} from '../services/programReviewService';

type Status = 'idle' | 'loading' | 'acting';
export type ItemDecision = 'pending' | 'accepted' | 'declined';

/**
 * Generic-tier portal: load pending AI program-review proposal and
 * accept/decline each change independently before applying.
 */
export function usePatientProgramReviewAccept(patient: Patient | null | undefined) {
  const patientId = patient?.id?.trim() ?? '';
  const aiLed = isAiLedPlanReviewAllowed(patient?.subscriptionTier);
  const [proposal, setProposal] = useState<ProgramReviewProposalRow | null>(null);
  const [decisions, setDecisions] = useState<Record<string, ItemDecision>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const actionableChanges = useMemo(() => {
    if (!proposal) return [] as ProgramReviewProposedChange[];
    return proposal.proposed_changes.filter(isActionableProgramReviewChange);
  }, [proposal]);

  const refresh = useCallback(async () => {
    if (!patientId || !aiLed) {
      setProposal(null);
      setDecisions({});
      return;
    }
    setStatus('loading');
    setError(null);
    const result = await fetchPendingProgramReviewForPatient(patientId);
    if (!result.ok) {
      setError(result.message);
      setProposal(null);
      setDecisions({});
      setStatus('idle');
      return;
    }
    setProposal(result.data);
    const initial: Record<string, ItemDecision> = {};
    for (const c of result.data?.proposed_changes ?? []) {
      if (!isActionableProgramReviewChange(c)) continue;
      initial[programReviewChangeKey(c)] = 'pending';
    }
    setDecisions(initial);
    setStatus('idle');
  }, [patientId, aiLed]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setItemDecision = useCallback((changeKey: string, decision: ItemDecision) => {
    setDecisions((prev) => ({ ...prev, [changeKey]: decision }));
  }, []);

  const acceptedKeys = useMemo(
    () =>
      Object.entries(decisions)
        .filter(([, d]) => d === 'accepted')
        .map(([k]) => k),
    [decisions]
  );

  const applyAccepted = useCallback(async () => {
    if (!proposal || status === 'acting') return;
    if (acceptedKeys.length === 0) {
      setError('יש לאשר לפחות שינוי אחד לפני עדכון התוכנית.');
      return;
    }
    setStatus('acting');
    setError(null);
    setInfo(null);
    const result = await patientApplyProgramReviewItems(proposal.id, acceptedKeys);
    if (!result.ok) {
      setError(result.message);
      setStatus('idle');
      return;
    }
    setProposal(null);
    setDecisions({});
    setInfo(
      `התוכנית עודכנה: אושרו ${result.data.acceptedCount} שינויים` +
        (result.data.declinedCount > 0 ? ` (נדחו ${result.data.declinedCount}).` : '.')
    );
    setStatus('idle');
  }, [proposal, status, acceptedKeys]);

  const declineAll = useCallback(async () => {
    if (!proposal || status === 'acting') return;
    setStatus('acting');
    setError(null);
    setInfo(null);
    const result = await patientDeclineProgramReviewProposal(proposal.id);
    if (!result.ok) {
      setError(result.message);
      setStatus('idle');
      return;
    }
    setProposal(null);
    setDecisions({});
    setInfo('כל ההצעות נדחו. התוכנית הנוכחית נשארה ללא שינוי.');
    setStatus('idle');
  }, [proposal, status]);

  return {
    enabled: aiLed,
    proposal,
    actionableChanges,
    decisions,
    setItemDecision,
    acceptedCount: acceptedKeys.length,
    status,
    error,
    info,
    refresh,
    applyAccepted,
    declineAll,
  };
}
