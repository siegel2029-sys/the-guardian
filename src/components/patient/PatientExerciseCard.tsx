import { useRef, useCallback } from 'react';
import { Play, CheckCircle2, Zap, Sparkles, PersonStanding, MessageSquare } from 'lucide-react';
import type { PatientExercise } from '../../types';
import { formatPatientRepsLabel } from '../../utils/patientExerciseRepsLabel';

const typeStyle: Record<string, { bg: string; text: string; label: string }> = {
  clinical: { bg: '#e0f2fe', text: '#0369a1', label: 'קליני' },
  standard: { bg: '#f3e8ff', text: '#6b21a8', label: 'סטנדרטי' },
  custom: { bg: '#fff7ed', text: '#c2410c', label: 'מותאם' },
};

interface PatientExerciseCardProps {
  exercise: PatientExercise;
  index: number;
  isCompleted: boolean;
  onOpen: () => void;
}

/** ממדים קבועים — גודל הכרטיס לא משתנה ב-hover */
const THUMB_W = 64;
const THUMB_H = 40;

export default function PatientExerciseCard({
  exercise,
  index,
  isCompleted,
  onOpen,
}: PatientExerciseCardProps) {
  const previewRef = useRef<HTMLVideoElement>(null);
  const type = exercise.isCustom ? typeStyle.custom : typeStyle[exercise.type] ?? typeStyle.standard;
  const displaySets = exercise.patientSets;
  const repsShort = formatPatientRepsLabel({
    reps: exercise.patientReps,
    holdSeconds: exercise.holdSeconds,
  });
  const hasVideo = Boolean(exercise.videoUrl);

  const playPreview = useCallback(() => {
    if (isCompleted || !hasVideo || !previewRef.current) return;
    const v = previewRef.current;
    v.muted = true;
    v.loop = true;
    v.play().catch(() => {});
  }, [isCompleted, hasVideo]);

  const stopPreview = useCallback(() => {
    if (!previewRef.current) return;
    const v = previewRef.current;
    v.pause();
    try {
      v.currentTime = 0;
    } catch {
      /* ignore */
    }
  }, []);

  const handleKeyOpen = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      e.stopPropagation();
      if (!isCompleted) onOpen();
    }
  };

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!isCompleted) onOpen();
  };

  return (
    <div
      role="button"
      tabIndex={isCompleted ? -1 : 0}
      onClick={handleCardClick}
      onKeyDown={handleKeyOpen}
      className={`rounded-xl border w-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-1 ${
        isCompleted ? 'cursor-default' : 'cursor-pointer hover:bg-teal-50/50 hover:border-teal-200'
      }`}
      style={{
        background: exercise.isCustom ? '#fffdf8' : '#ffffff',
        borderColor: isCompleted ? '#86efac' : exercise.isCustom ? '#fed7aa' : '#d1fae5',
        borderWidth: 1,
        boxShadow: '0 1px 2px rgba(13, 148, 136, 0.06)',
        opacity: isCompleted ? 0.88 : 1,
        minHeight: THUMB_H + 16,
      }}
      dir="rtl"
      aria-label={isCompleted ? `${exercise.name} — הושלם` : `פתח ${exercise.name}`}
    >
      <div className="flex items-center gap-2 py-2 pr-2 pl-2">
        {/* תמונה מקדימה — קבועה, וידאו רק בתוך המסגרת */}
        <div
          className="shrink-0 rounded-lg overflow-hidden border relative"
          style={{
            width: THUMB_W,
            height: THUMB_H,
            borderColor: '#99f6e4',
            background: '#ecfdf5',
          }}
          onMouseEnter={playPreview}
          onMouseLeave={stopPreview}
        >
          {hasVideo ? (
            <video
              ref={previewRef}
              className="absolute inset-0 w-full h-full object-cover"
              src={exercise.videoUrl}
              muted
              playsInline
              loop
              preload="metadata"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-teal-50 to-emerald-100 group/thumb">
              <PersonStanding
                className="w-5 h-5 text-teal-600/70 transition-opacity duration-300 group-hover/thumb:opacity-90"
                strokeWidth={1.75}
              />
            </div>
          )}
          <div
            className="absolute inset-0 flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.08)' }}
          >
            <Play className="w-3.5 h-3.5 text-white drop-shadow-sm" style={{ marginRight: '-1px' }} />
          </div>
        </div>

        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-black shrink-0"
          style={
            isCompleted
              ? { background: '#d1fae5', color: '#059669' }
              : { background: '#e0f7f9', color: '#0d9488' }
          }
        >
          {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : index}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <h4
              className="text-xs font-semibold leading-tight truncate"
              style={{
                color: isCompleted ? '#64748b' : '#0f172a',
                textDecoration: isCompleted ? 'line-through' : 'none',
              }}
            >
              {exercise.name}
            </h4>
            {exercise.customInstructions?.trim() ? (
              <MessageSquare
                className="w-3 h-3 shrink-0 text-teal-600"
                aria-label="הנחיות מהמטפל"
              />
            ) : null}
            {exercise.isCustom ? (
              <Sparkles className="w-3 h-3 shrink-0 text-orange-500" aria-label="מותאם" />
            ) : (
              <span
                className="text-[8px] font-bold px-1 py-0 rounded shrink-0 leading-none"
                style={{ background: type.bg, color: type.text }}
              >
                {type.label.length > 2 ? type.label.slice(0, 2) : type.label}
              </span>
            )}
          </div>
          <p className="text-[10px] text-slate-500 truncate mt-0.5 leading-tight">
            {displaySets}× {repsShort} ·{' '}
            {exercise.muscleGroups?.length
              ? exercise.muscleGroups.join(' · ')
              : exercise.muscleGroup}
          </p>
        </div>

        <div
          className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[9px] font-bold shrink-0"
          style={{ background: '#fef9c3', color: '#a16207' }}
        >
          <Zap className="w-2.5 h-2.5" />
          {exercise.xpReward}
        </div>
      </div>
    </div>
  );
}
