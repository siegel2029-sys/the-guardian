import { Loader2, Sparkles } from 'lucide-react';
import type { ProgramReviewEnginePhase } from '../../services/programReviewService';

type Props = {
  phase: ProgramReviewEnginePhase;
  /** When false, renders nothing (idle). */
  active: boolean;
};

/**
 * Passive inline status chip for background plan-review engine.
 * Never a modal / overlay — purely decorative status next to the plan header.
 */
export default function PatientBackgroundReviewIndicator({ phase, active }: Props) {
  if (!active) return null;

  const label = 'ביקורת תוכנית אוטומטית רצה ברקע...';

  return (
    <div
      className="mt-1.5 mb-3 flex items-center justify-center gap-1.5 text-[11px] font-medium text-teal-800/90"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span
        className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50/70 px-2.5 py-1 shadow-sm"
        title={label}
      >
        <span className="relative flex h-2 w-2 shrink-0" aria-hidden>
          <span className="absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-60 animate-ping" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-600" />
        </span>
        {phase === 'analyzing' ? (
          <Loader2 className="h-3 w-3 shrink-0 text-teal-600 animate-spin" aria-hidden />
        ) : (
          <Sparkles className="h-3 w-3 shrink-0 text-teal-600 animate-pulse" aria-hidden />
        )}
        <span className="leading-none">{label}</span>
      </span>
    </div>
  );
}
