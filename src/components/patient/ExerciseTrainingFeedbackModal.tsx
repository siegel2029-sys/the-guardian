import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { X } from 'lucide-react';
import type { ModalPainLevel } from './ExerciseVideoTimerModal';
import type { EffortLevel } from '../../utils/effortScale';
import { SAFETY_EFFORT_THRESHOLD } from '../../utils/effortScale';

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

function tealTrackFill(value: number, min: number, max: number): CSSProperties {
  const pct = ((value - min) / (max - min)) * 100;
  return {
    background: `linear-gradient(to left, #14b8a6 0%, #0d9488 ${pct}%, #e2e8f0 ${pct}%, #e2e8f0 100%)`,
  };
}

export default function ExerciseTrainingFeedbackModal({
  open,
  submitError,
  onClose,
  onSubmit,
}: ExerciseTrainingFeedbackModalProps) {
  const [pain, setPain] = useState<ModalPainLevel>(3);
  const [effort, setEffort] = useState<EffortLevel>(5);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setPain(3);
      setEffort(5);
      setSubmitting(false);
    }
  }, [open]);

  const willTriggerSafetyAlert = useMemo(
    () => pain >= 6 || effort >= SAFETY_EFFORT_THRESHOLD,
    [pain, effort]
  );

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
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
          <div className="space-y-2">
            <label htmlFor="training-pain-slider" className="block text-sm font-semibold text-slate-800">
              רמת כאב
            </label>
            <input
              id="training-pain-slider"
              type="range"
              min={1}
              max={10}
              step={1}
              value={pain}
              onChange={(e) => setPain(Number(e.target.value) as ModalPainLevel)}
              className="w-full h-2.5 rounded-full appearance-none cursor-pointer accent-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:ring-offset-2"
              style={tealTrackFill(pain, 1, 10)}
            />
            <div className="flex justify-between text-[11px] font-medium text-slate-500 tabular-nums px-0.5">
              {PAIN_TICKS.map((n) => (
                <span key={n} className="w-4 text-center">
                  {n}
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label htmlFor="training-effort-slider" className="block text-sm font-semibold text-slate-800">
              מאמץ (RPE)
            </label>
            <input
              id="training-effort-slider"
              type="range"
              min={1}
              max={10}
              step={1}
              value={effort}
              onChange={(e) => setEffort(Number(e.target.value) as EffortLevel)}
              className="w-full h-2.5 rounded-full appearance-none cursor-pointer accent-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/40 focus-visible:ring-offset-2"
              style={tealTrackFill(effort, 1, 10)}
            />
            <div className="flex justify-between text-[11px] font-medium text-slate-500 tabular-nums px-0.5">
              {EFFORT_TICKS.map((n) => (
                <span key={n} className="w-4 text-center">
                  {n}
                </span>
              ))}
            </div>
          </div>

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
            disabled={submitting}
            className="w-full py-3.5 rounded-2xl text-white font-bold text-base transition-transform active:scale-[0.99] disabled:opacity-60"
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
