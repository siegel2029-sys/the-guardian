import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import type { PatientExercise } from '../../types';

const EFFORT_LABELS: Record<number, string> = {
  1: 'קל מאוד',
  2: 'קל',
  3: 'בינוני',
  4: 'קשה',
  5: 'קשה מאוד',
};

interface ExerciseReportModalProps {
  exercise: PatientExercise | null;
  onClose: () => void;
  onSubmit: (painLevel: number, effortRating: number) => void;
}

export default function ExerciseReportModal({
  exercise,
  onClose,
  onSubmit,
}: ExerciseReportModalProps) {
  const [pain, setPain] = useState(3);
  const [effort, setEffort] = useState(3);

  useEffect(() => {
    if (exercise) {
      setPain(3);
      setEffort(3);
    }
  }, [exercise]);

  const willTriggerSafetyAlert = useMemo(() => pain >= 6 || effort >= 4, [pain, effort]);

  if (!exercise) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(pain, effort);
  };

  const effortClamped = Math.min(5, Math.max(1, Math.round(effort))) as 1 | 2 | 3 | 4 | 5;

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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              דרגת כאב בביצוע התרגיל (0–10)
            </label>
            <div className="flex items-center justify-between gap-3 mb-2">
              <span className="text-xs text-teal-600">0</span>
              <span
                className="text-2xl font-bold tabular-nums"
                style={{ color: pain >= 6 ? '#dc2626' : '#0f766e' }}
              >
                {pain}
              </span>
              <span className="text-xs text-teal-600">10</span>
            </div>
            <input
              type="range"
              min={0}
              max={10}
              step={1}
              value={pain}
              onChange={(e) => setPain(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer accent-teal-500"
              style={{
                background: `linear-gradient(to left, #14b8a6 0%, #14b8a6 ${(pain / 10) * 100}%, #ccfbf1 ${(pain / 10) * 100}%, #ccfbf1 100%)`,
              }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              דרגת קושי במאמץ (1–5)
            </label>
            <div className="flex items-center justify-between gap-2 mb-2 text-xs text-teal-700">
              <span className="font-medium">1 — קל מאוד</span>
              <span
                className="text-lg font-bold tabular-nums shrink-0 px-2"
                style={{ color: effort >= 4 ? '#b45309' : '#0f766e' }}
              >
                {effortClamped}
              </span>
              <span className="font-medium">5 — קשה מאוד</span>
            </div>
            <input
              type="range"
              min={1}
              max={5}
              step={1}
              value={effortClamped}
              onChange={(e) => setEffort(Number(e.target.value))}
              className="w-full h-2 rounded-full appearance-none cursor-pointer accent-teal-500"
              style={{
                background: `linear-gradient(to left, #14b8a6 0%, #14b8a6 ${((effortClamped - 1) / 4) * 100}%, #ccfbf1 ${((effortClamped - 1) / 4) * 100}%, #ccfbf1 100%)`,
              }}
            />
            <p className="mt-2 text-center text-sm font-semibold text-teal-800">
              {EFFORT_LABELS[effortClamped]}
            </p>
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
                דיווח עם כאב 6 ומעלה או קושי 4 ומעלה יסמן מיד דגל אדום אצל המטפל לבדיקה.
              </p>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3.5 rounded-2xl text-white font-semibold text-base transition-transform active:scale-[0.99]"
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
