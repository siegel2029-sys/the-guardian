import { useState, useEffect, useRef } from 'react';
import { X, ClipboardList, Timer, PersonStanding } from 'lucide-react';
import type { PatientExercise } from '../../types';
import { formatTime } from '../dashboard/ManagePlanModal';

const QUALITY_CHECK_SECONDS = 10;

interface ExerciseDetailModalProps {
  exercise: PatientExercise | null;
  onClose: () => void;
  onRequestComplete: (ex: PatientExercise) => void;
  isCompleted: boolean;
}

function formatCountdown(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function isHoldTimed(ex: PatientExercise): boolean {
  return ex.holdSeconds != null && ex.holdSeconds > 0;
}

function getTargetDurationSeconds(ex: PatientExercise): number {
  if (isHoldTimed(ex)) return ex.holdSeconds as number;
  return QUALITY_CHECK_SECONDS;
}

export default function ExerciseDetailModal({
  exercise,
  onClose,
  onRequestComplete,
  isCompleted,
}: ExerciseDetailModalProps) {
  const [remaining, setRemaining] = useState(0);
  const [phase, setPhase] = useState<'idle' | 'running' | 'done'>('idle');
  const mainVideoRef = useRef<HTMLVideoElement>(null);

  const holdMode = exercise ? isHoldTimed(exercise) : false;
  const targetDuration = exercise ? getTargetDurationSeconds(exercise) : 0;
  const workFinished = phase === 'done';

  useEffect(() => {
    const el = mainVideoRef.current;
    if (!el || !exercise?.videoUrl) return;
    el.muted = true;
    const p = el.play();
    if (p) p.catch(() => {});
  }, [exercise?.id, exercise?.videoUrl]);

  useEffect(() => {
    if (!exercise || isCompleted) return;
    setPhase('idle');
    setRemaining(0);
  }, [exercise?.id, isCompleted]);

  useEffect(() => {
    if (phase !== 'running') return;
    if (remaining <= 0) {
      setPhase('done');
      return;
    }
    const id = window.setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [phase, remaining]);

  if (!exercise) return null;

  const startExercise = () => {
    setRemaining(targetDuration);
    setPhase('running');
  };

  const resetTimer = () => {
    setPhase('idle');
    setRemaining(0);
  };

  const handleComplete = () => {
    if (!workFinished || isCompleted) return;
    onRequestComplete(exercise);
  };

  return (
    <div
      className="fixed inset-0 z-[85] flex flex-col"
      style={{ background: '#ecfdf5' }}
      dir="rtl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ex-detail-title"
    >
      <div
        className="shrink-0 flex items-center justify-between px-4 py-3 border-b"
        style={{
          borderColor: '#99f6e4',
          background: 'rgba(255,255,255,0.95)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="p-2 rounded-xl text-teal-700 hover:bg-teal-100/80 transition-colors"
          aria-label="סגור"
        >
          <X className="w-6 h-6" />
        </button>
        <h2 id="ex-detail-title" className="text-base font-bold text-slate-800 text-center flex-1 px-2 truncate">
          {exercise.name}
        </h2>
        <div className="w-10" />
      </div>

      <div className="flex-1 overflow-y-auto overscroll-contain">
        <div className="max-w-lg mx-auto w-full px-4 py-4 space-y-5 pb-40">
          <section
            className="w-full rounded-3xl overflow-hidden border-2 shadow-sm"
            style={{ borderColor: '#7dd3c0', background: '#f0fdfa' }}
            onClick={(e) => e.stopPropagation()}
          >
            {exercise.videoUrl ? (
              <video
                ref={mainVideoRef}
                className="w-full aspect-video object-cover bg-black"
                controls
                playsInline
                muted
                preload="auto"
                src={exercise.videoUrl}
              >
                הדפדפן שלך אינו תומך בנגן וידאו.
              </video>
            ) : (
              <div
                className="w-full aspect-video flex flex-col items-center justify-center px-6 py-10"
                style={{
                  background: 'linear-gradient(165deg, #ecfdf5 0%, #ccfbf1 45%, #f0fdfa 100%)',
                }}
              >
                <div
                  className="w-24 h-24 rounded-3xl flex items-center justify-center mb-4 shadow-md"
                  style={{
                    background: 'linear-gradient(145deg, #14b8a6, #0d9488)',
                    boxShadow: '0 12px 32px -10px rgba(13, 148, 136, 0.55)',
                  }}
                >
                  <PersonStanding className="w-12 h-12 text-white opacity-95" strokeWidth={2} />
                </div>
                <p className="text-base font-bold text-teal-900 text-center leading-snug">
                  כאן יופיע סרטון ההסבר
                </p>
                <p className="text-xs text-teal-700/75 text-center mt-2 max-w-xs">
                  {holdMode
                    ? 'לחצו «התחל תרגול» כדי להתחיל מדד זמן ההחזקה'
                    : `לחצו «התחל תרגול» לבדיקת איכות (${QUALITY_CHECK_SECONDS} שנ׳)`}
                </p>
              </div>
            )}
          </section>

          {!isCompleted && (
            <section
              className="rounded-3xl border-2 p-5"
              style={{
                borderColor: workFinished ? '#6ee7b7' : '#5eead4',
                background: workFinished
                  ? 'linear-gradient(135deg, #ecfdf5, #ffffff)'
                  : 'linear-gradient(135deg, #f0fdfa, #ffffff)',
                boxShadow: '0 8px 28px -12px rgba(13, 148, 136, 0.25)',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 mb-1">
                <Timer className="w-5 h-5 text-teal-600" />
                <h3 className="text-base font-bold text-teal-900">
                  {holdMode ? 'מדד זמן עבודה (החזקה)' : 'בדיקת איכות וטכניקה'}
                </h3>
              </div>
              <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                {holdMode ? (
                  <>
                    משך ההחזקה בתוכנית:{' '}
                    <span className="font-semibold text-teal-800">{formatTime(targetDuration)}</span>
                    . יש ללחוץ «התחל תרגול» כדי להתחיל את הספירה לאחור.
                  </>
                ) : (
                  <>
                    נדרשות <strong>{QUALITY_CHECK_SECONDS} שניות</strong> לעיון בהנחיות ובטכניקה לפני
                    סימון ביצוע. לחצו «התחל תרגול» להפעלה.
                  </>
                )}
              </p>

              <div className="flex items-center justify-center mb-4">
                <div
                  className="text-4xl sm:text-5xl font-mono font-black tabular-nums tracking-tight"
                  style={{ color: workFinished ? '#059669' : '#0f766e' }}
                >
                  {phase === 'done'
                    ? '0:00'
                    : phase === 'running'
                      ? formatCountdown(remaining)
                      : formatTime(targetDuration)}
                </div>
              </div>

              {workFinished && (
                <p className="text-center text-sm font-semibold text-emerald-700 mb-3">
                  המדד הושלם — ניתן לסמן כבוצע
                </p>
              )}

              <button
                type="button"
                onClick={startExercise}
                disabled={phase === 'running'}
                className="w-full py-4 rounded-2xl font-bold text-lg text-white disabled:opacity-55 transition-all mb-3"
                style={{
                  background: 'linear-gradient(135deg, #0d9488, #059669)',
                  boxShadow: '0 12px 28px -8px rgba(13, 148, 136, 0.5)',
                }}
              >
                {phase === 'running' ? 'ספירה לאחור…' : 'התחל תרגול'}
              </button>

              <button
                type="button"
                onClick={resetTimer}
                disabled={phase === 'idle'}
                className="w-full py-2.5 rounded-xl text-sm font-semibold border-2 text-teal-800 disabled:opacity-40"
                style={{ borderColor: '#99f6e4', background: '#ffffff' }}
              >
                איפוס מדד זמן
              </button>
            </section>
          )}

          <section
            className="rounded-2xl border p-4 space-y-2 text-sm"
            style={{ borderColor: '#99f6e4', background: '#f0fdfa' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-xs font-bold text-teal-800 mb-2">פרמטרים קליניים</h3>
            <div className="flex justify-between gap-4 border-b border-teal-100/80 pb-2">
              <span className="text-slate-600">סטים</span>
              <span className="font-semibold text-teal-900 tabular-nums">{exercise.patientSets}</span>
            </div>
            <div className="flex justify-between gap-4 border-b border-teal-100/80 pb-2">
              <span className="text-slate-600">חזרות לסט</span>
              <span className="font-semibold text-teal-900 tabular-nums">
                {exercise.patientReps > 0 ? exercise.patientReps : '—'}
              </span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-slate-600">זמן החזקה</span>
              <span className="font-semibold text-teal-900 text-end">
                {exercise.holdSeconds != null && exercise.holdSeconds > 0
                  ? `${exercise.holdSeconds} שנ׳ (${formatTime(exercise.holdSeconds)})`
                  : '—'}
              </span>
            </div>
          </section>

          <section
            className="rounded-2xl border p-4"
            style={{ borderColor: '#a7f3d0', background: 'rgba(255,255,255,0.92)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-2">
              <ClipboardList className="w-4 h-4 text-teal-600" />
              <h3 className="text-sm font-bold text-teal-900">הנחיות ביצוע</h3>
            </div>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
              {exercise.instructions}
            </p>
          </section>
        </div>
      </div>

      {!isCompleted && (
        <div
          className="shrink-0 p-4 border-t pb-6"
          style={{
            borderColor: '#99f6e4',
            background: 'rgba(255,255,255,0.96)',
            backdropFilter: 'blur(8px)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="max-w-lg mx-auto w-full flex gap-3">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onClose();
              }}
              className="flex-1 py-3 rounded-2xl font-semibold border-2 text-teal-800 text-sm"
              style={{ borderColor: '#5eead4', background: '#f0fdfa' }}
            >
              חזרה לרשימה
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleComplete();
              }}
              disabled={!workFinished}
              className="flex-1 py-3 px-2 rounded-2xl font-bold text-sm sm:text-base leading-tight transition-all min-h-[3rem]"
              style={
                workFinished
                  ? {
                      background: 'linear-gradient(180deg, #34d399, #10b981)',
                      color: '#fff',
                      boxShadow: '0 8px 24px -6px rgba(16, 185, 129, 0.55)',
                    }
                  : {
                      background: '#e2e8f0',
                      color: '#64748b',
                      cursor: 'not-allowed',
                      boxShadow: 'none',
                    }
              }
            >
              {workFinished ? 'סמן כבוצע' : 'המתן לסיום מדד הזמן'}
            </button>
          </div>
        </div>
      )}

      {isCompleted && (
        <div
          className="shrink-0 p-4 border-t"
          style={{ borderColor: '#99f6e4', background: 'rgba(255,255,255,0.96)' }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="w-full max-w-lg mx-auto block py-3.5 rounded-2xl font-semibold text-teal-800 border-2"
            style={{ borderColor: '#6ee7b7', background: '#ecfdf5' }}
          >
            סגור
          </button>
        </div>
      )}
    </div>
  );
}
