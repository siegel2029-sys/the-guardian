import { useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import type { ModalPainLevel } from './ExerciseVideoTimerModal';
import type { EffortLevel } from '../../utils/effortScale';
import { SAFETY_EFFORT_THRESHOLD } from '../../utils/effortScale';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';

export interface ExerciseTrainingFeedbackPayload {
  effort: EffortLevel;
  painLevel: ModalPainLevel;
}

interface ExerciseTrainingFeedbackModalProps {
  open: boolean;
  submitError?: string | null;
  onClose: () => void;
  onSubmit: (payload: ExerciseTrainingFeedbackPayload) => boolean | Promise<boolean>;
}

const PAIN_TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const EFFORT_TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

function DiscreteScaleButtons<T extends number>({
  id,
  label,
  ticks,
  value,
  onSelect,
  highRiskFrom,
}: {
  id: string;
  label: string;
  ticks: readonly T[];
  value: T | null;
  onSelect: (n: T) => void;
  highRiskFrom?: number;
}) {
  return (
    <div className="space-y-2" role="group" aria-labelledby={`${id}-label`}>
      <div className="flex items-center justify-between gap-2">
        <span id={`${id}-label`} className="block text-sm font-semibold text-slate-800">
          {label}
        </span>
        <span
          className="text-sm font-bold tabular-nums min-w-[1.5rem] text-center"
          style={{
            color:
              value == null
                ? '#94a3b8'
                : highRiskFrom != null && value >= highRiskFrom
                  ? '#dc2626'
                  : '#0f766e',
          }}
          aria-live="polite"
        >
          {value != null ? value : '—'}
        </span>
      </div>
      <div className="grid grid-cols-10 gap-1">
        {ticks.map((n) => {
          const selected = value === n;
          const risky = highRiskFrom != null && n >= highRiskFrom;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={selected}
              aria-label={`${label}: ${n}`}
              onClick={() => onSelect(n)}
              className={`h-10 rounded-lg text-xs font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 focus-visible:ring-offset-1 ${
                selected
                  ? risky
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-teal-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-slate-200'
              }`}
            >
              {n}
            </button>
          );
        })}
      </div>
      {value == null && (
        <p className="text-[11px] text-slate-500">בחרו ערך בסולם כדי להמשיך</p>
      )}
    </div>
  );
}

export default function ExerciseTrainingFeedbackModal({
  open,
  submitError,
  onClose,
  onSubmit,
}: ExerciseTrainingFeedbackModalProps) {
  const [pain, setPain] = useState<ModalPainLevel | null>(null);
  const [effort, setEffort] = useState<EffortLevel | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useBodyScrollLock(open);

  useEffect(() => {
    if (open) {
      setPain(null);
      setEffort(null);
      setSubmitting(false);
    }
  }, [open]);

  const canSubmit = pain != null && effort != null && !submitting;

  const willTriggerSafetyAlert = useMemo(
    () =>
      pain != null &&
      effort != null &&
      (pain >= 6 || effort >= SAFETY_EFFORT_THRESHOLD),
    [pain, effort]
  );

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pain == null || effort == null || submitting) return;
    setSubmitting(true);
    try {
      const ok = await Promise.resolve(onSubmit({ painLevel: pain, effort }));
      if (!ok) return;
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.72)' }}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="training-feedback-title"
    >
      <div
        className="w-full max-w-md rounded-3xl shadow-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #f8fafc 0%, #ffffff 45%)',
          borderColor: '#cbd5e1',
          boxShadow: '0 25px 50px -12px rgba(15, 23, 42, 0.35)',
        }}
        data-scroll-lock-allow
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: '#e2e8f0', background: 'rgba(248, 250, 252, 0.95)' }}
        >
          <h2 id="training-feedback-title" className="text-lg font-semibold text-slate-900">
            משוב אחרי תרגול
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 transition-colors"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="px-5 pt-4 text-sm font-bold text-red-600 leading-snug">
          חשוב למלא למעקב ודיוק התרגול
        </p>

        {submitError ? (
          <p className="px-5 pt-2 text-sm font-semibold text-red-700 leading-snug" role="alert">
            {submitError}
          </p>
        ) : null}

        <form onSubmit={handleSubmit} className="px-5 pb-6 pt-4 space-y-6">
          <DiscreteScaleButtons
            id="training-pain"
            label="רמת כאב"
            ticks={PAIN_TICKS}
            value={pain}
            onSelect={setPain}
            highRiskFrom={6}
          />

          <DiscreteScaleButtons
            id="training-effort"
            label="מאמץ (RPE)"
            ticks={EFFORT_TICKS}
            value={effort}
            onSelect={setEffort}
            highRiskFrom={SAFETY_EFFORT_THRESHOLD}
          />

          {willTriggerSafetyAlert && (
            <div
              className="rounded-2xl border px-4 py-3 text-sm"
              style={{
                background: '#fff1f2',
                borderColor: '#fecdd3',
                color: '#9f1239',
              }}
            >
              <p className="font-semibold mb-1">התראת בטיחות קלינית</p>
              <p className="text-xs leading-relaxed opacity-95">
                דיווח עם כאב 6 ומעלה או מאמץ 8 ומעלה יסמן מיד דגל אדום אצל המטפל לבדיקה.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-base transition-transform active:scale-[0.99] disabled:opacity-45 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #0d9488, #059669)',
              boxShadow: '0 10px 25px -8px rgba(13, 148, 136, 0.5)',
            }}
          >
            {submitting ? 'שומר…' : 'שמירה וסיום'}
          </button>
        </form>
      </div>
    </div>
  );
}
