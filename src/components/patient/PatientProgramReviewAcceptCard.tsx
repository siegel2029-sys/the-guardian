import { Check, Loader2, X } from 'lucide-react';
import {
  isActionableProgramReviewChange,
  programReviewChangeKey,
} from '../../ai/applyProgramReviewChanges';
import type { Patient } from '../../types';
import { usePatientProgramReviewAccept } from '../../hooks/usePatientProgramReviewAccept';
import type { ProgramReviewProposedChange } from '../../services/programReviewService';

type Props = {
  patient: Patient;
};

function changeTitle(change: ProgramReviewProposedChange): string {
  if (change.action === 'swap' || change.action === 'progress_swap') {
    return `החלפת «${change.exerciseName}» ב־«${change.swapToExerciseName ?? 'תרגיל חלופי'}»`;
  }
  if (change.action === 'reduce_reps' || change.action === 'progress_reps') {
    return `«${change.exerciseName}»: חזרות ${change.fromReps} → ${change.toReps}`;
  }
  if (change.action === 'reduce_sets' || change.action === 'progress_sets') {
    return `«${change.exerciseName}»: סטים ${change.fromSets} → ${change.toSets}`;
  }
  return change.noteHebrew?.trim() || `${change.exerciseName}: ${change.action}`;
}

/**
 * Generic patients only: per-item Accept/Decline for AI program-review changes.
 * Premium patients render nothing (therapist-led care mode).
 */
export default function PatientProgramReviewAcceptCard({ patient }: Props) {
  const {
    enabled,
    proposal,
    actionableChanges,
    decisions,
    setItemDecision,
    acceptedCount,
    status,
    error,
    info,
    applyAccepted,
    declineAll,
  } = usePatientProgramReviewAccept(patient);

  if (!enabled) return null;

  if (!proposal && !error && !info) return null;

  const acting = status === 'acting';
  const items =
    actionableChanges.length > 0
      ? actionableChanges
      : (proposal?.proposed_changes ?? []).filter(isActionableProgramReviewChange);

  return (
    <section
      className="mb-4 rounded-2xl border border-teal-200/90 bg-gradient-to-br from-teal-50/95 to-white px-4 py-3.5 shadow-sm"
      dir="rtl"
      aria-labelledby="patient-ai-plan-proposal-title"
    >
      <h2
        id="patient-ai-plan-proposal-title"
        className="text-sm font-bold text-teal-950"
      >
        המלצות התאמת תוכנית
      </h2>
      {proposal ? (
        <>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            אשרו או דחו כל שינוי בנפרד. רק השינויים שתאשרו ייכנסו לתוכנית הפעילה.
          </p>
          {proposal.rationale.trim() ? (
            <p className="mt-2 text-xs text-slate-600 leading-relaxed">{proposal.rationale}</p>
          ) : null}
          <ul className="mt-3 space-y-2">
            {items.map((change) => {
              const key = programReviewChangeKey(change);
              const decision = decisions[key] ?? 'pending';
              return (
                <li
                  key={key}
                  className={`rounded-xl border px-3 py-2.5 ${
                    decision === 'accepted'
                      ? 'border-teal-300 bg-teal-50/90'
                      : decision === 'declined'
                        ? 'border-slate-200 bg-slate-50/90 opacity-80'
                        : 'border-teal-100 bg-white/90'
                  }`}
                >
                  <p className="text-xs font-semibold text-slate-800 leading-snug">
                    {changeTitle(change)}
                  </p>
                  {change.noteHebrew?.trim() ? (
                    <p className="mt-1 text-[11px] text-slate-600 leading-relaxed">
                      {change.noteHebrew}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={acting}
                      aria-pressed={decision === 'accepted'}
                      onClick={() => setItemDecision(key, 'accepted')}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold disabled:opacity-60 ${
                        decision === 'accepted'
                          ? 'bg-teal-700 text-white'
                          : 'border border-teal-200 bg-white text-teal-800'
                      }`}
                    >
                      <Check className="w-3 h-3" aria-hidden />
                      אשר
                    </button>
                    <button
                      type="button"
                      disabled={acting}
                      aria-pressed={decision === 'declined'}
                      onClick={() => setItemDecision(key, 'declined')}
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold disabled:opacity-60 ${
                        decision === 'declined'
                          ? 'bg-slate-600 text-white'
                          : 'border border-slate-200 bg-white text-slate-700'
                      }`}
                    >
                      <X className="w-3 h-3" aria-hidden />
                      דחה
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void applyAccepted()}
              disabled={acting || acceptedCount === 0}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-bold text-white disabled:opacity-60"
            >
              {acting ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden /> : null}
              עדכן תוכנית ({acceptedCount})
            </button>
            <button
              type="button"
              onClick={() => void declineAll()}
              disabled={acting}
              className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 disabled:opacity-60"
            >
              דחה הכל
            </button>
          </div>
        </>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="mt-2 text-xs text-teal-800" role="status">
          {info}
        </p>
      ) : null}
    </section>
  );
}
