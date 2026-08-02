import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import type { PatientExercise } from '../../types';
import {
  SAFETY_EFFORT_THRESHOLD,
  type EffortLevel,
} from '../../utils/effortScale';

const PAIN_TICKS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;
const EFFORT_TICKS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

const EFFORT_LABELS: Record<number, string> = {
  1: 'קל מאוד',
  2: 'קל מאוד',
  3: 'קל',
  4: 'קל-בינוני',
  5: 'בינוני',
  6: 'בינוני-קשה',
  7: 'קשה',
  8: 'קשה מאוד',
  9: 'מקסימלי כמעט',
  10: 'מקסימלי',
};

interface ExerciseReportModalProps {
  exercise: PatientExercise | null;
  onClose: () => void;
  onSubmit: (painLevel: number, effortRating: number) => void | Promise<void>;
  /** Prefill from card effort (1–10) — unused; scales start empty by design */
  initialEffort?: EffortLevel;
}

function DiscreteScaleButtons<T extends number>({
  id,
  label,
  ticks,
  value,
  onSelect,
  highRiskFrom,
  cols = 10,
}: {
  id: string;
  label: string;
  ticks: readonly T[];
  value: T | null;
  onSelect: (n: T) => void;
  highRiskFrom?: number;
  cols?: number;
}) {
  return (
    <div className="space-y-2" role="group" aria-labelledby={`${id}-label`}>
      <div className="flex items-center justify-between gap-2">
        <span id={`${id}-label`} className="block text-sm font-medium text-slate-700">
          {label}
        </span>
        <span
          className="text-2xl font-bold tabular-nums min-w-[1.5rem] text-center"
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
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
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
              className={`h-9 rounded-lg text-[11px] font-bold tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50 ${
                selected
                  ? risky
                    ? 'bg-rose-600 text-white shadow-sm'
                    : 'bg-teal-600 text-white shadow-sm'
                  : 'bg-teal-50 text-teal-800 hover:bg-teal-100 border border-teal-100'
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

export default function ExerciseReportModal({
  exercise,
  onClose,
  onSubmit,
}: ExerciseReportModalProps) {
  const [pain, setPain] = useState<number | null>(null);
  const [effort, setEffort] = useState<EffortLevel | null>(null);

  useEffect(() => {
    if (exercise) {
      setPain(null);
      setEffort(null);
    }
  }, [exercise]);

  const canSubmit = pain != null && effort != null;

  const willTriggerSafetyAlert = useMemo(
    () =>
      pain != null &&
      effort != null &&
      (pain >= 6 || effort >= SAFETY_EFFORT_THRESHOLD),
    [pain, effort]
  );

  if (!exercise) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (pain == null || effort == null) return;
    await Promise.resolve(onSubmit(pain, effort));
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4"
      style={{ background: 'rgba(15, 118, 110, 0.25)' }}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="report-title"
    >
      <div
        className="w-full max-w-md rounded-3xl shadow-2xl border overflow-hidden"
        style={{
          background: 'linear-gradient(180deg, #f0fdfa 0%, #ffffff 45%)',
          borderColor: '#99f6e4',
          boxShadow: '0 25px 50px -12px rgba(13, 148, 136, 0.25)',
        }}
      >
        <div
          className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: '#ccfbf1', background: 'rgba(240, 253, 250, 0.8)' }}
        >
          <h2 id="report-title" className="text-lg font-semibold text-teal-900">
            דיווח מהיר (VAS)
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-teal-600 hover:bg-teal-100/80 transition-colors"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="px-5 pt-4 text-sm text-teal-800/90 font-medium">{exercise.name}</p>

        <form onSubmit={handleSubmit} className="px-5 pb-6 pt-3 space-y-6">
          <DiscreteScaleButtons
            id="report-pain"
            label="דרגת כאב בביצוע התרגיל (0–10)"
            ticks={PAIN_TICKS}
            value={pain}
            onSelect={setPain}
            highRiskFrom={6}
            cols={11}
          />

          <div className="space-y-1">
            <DiscreteScaleButtons
              id="report-effort"
              label="דרגת מאמץ (RPE 1–10)"
              ticks={EFFORT_TICKS}
              value={effort}
              onSelect={setEffort}
              highRiskFrom={SAFETY_EFFORT_THRESHOLD}
            />
            {effort != null && (
              <p className="text-center text-sm font-semibold text-teal-800">
                {EFFORT_LABELS[effort]}
              </p>
            )}
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
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-2xl text-white font-semibold text-base transition-transform active:scale-[0.99] disabled:opacity-45 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #0d9488, #059669)',
              boxShadow: '0 10px 25px -8px rgba(13, 148, 136, 0.5)',
            }}
          >
            שמירה וסיום
          </button>
        </form>
      </div>
    </div>
  );
}
