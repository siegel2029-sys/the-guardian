import { Play, CheckCircle2, Circle, Clock, RotateCcw, Zap, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { Exercise } from '../../types';
import { bodyAreaLabels } from '../../types';
import { formatTime } from './ManagePlanModal';

interface ExerciseCardProps {
  exercise: Exercise;
  index: number;
  isCompleted: boolean;
  onToggle: () => void;
  onVideoClick: () => void;
}

const difficultyDots = (level: number) =>
  Array.from({ length: 5 }, (_, i) => i < level);

const difficultyColors: Record<number, { dot: string; bg: string; text: string; label: string }> = {
  1: { dot: '#10b981', bg: '#dcfce7', text: '#166534', label: 'קל מאוד' },
  2: { dot: '#34d399', bg: '#d1fae5', text: '#065f46', label: 'קל' },
  3: { dot: '#f59e0b', bg: '#fef9c3', text: '#713f12', label: 'בינוני' },
  4: { dot: '#f97316', bg: '#ffedd5', text: '#7c2d12', label: 'קשה' },
  5: { dot: '#ef4444', bg: '#fee2e2', text: '#7f1d1d', label: 'קשה מאוד' },
};

const typeStyle: Record<string, { bg: string; text: string; label: string }> = {
  clinical: { bg: '#e0f2fe', text: '#0369a1', label: 'קליני' },
  standard: { bg: '#f3e8ff', text: '#6b21a8', label: 'סטנדרטי' },
};

export default function ExerciseCard({
  exercise,
  index,
  isCompleted,
  onToggle,
  onVideoClick,
}: ExerciseCardProps) {
  const [expanded, setExpanded] = useState(false);
  const diff = difficultyColors[exercise.difficulty];
  const type = typeStyle[exercise.type];
  const isCustom = !!exercise.isCustom;

  // Prefer patient-specific overrides when available (PatientExercise)
  const displaySets = 'patientSets' in exercise ? (exercise as { patientSets: number }).patientSets : exercise.sets;
  const displayReps = 'patientReps' in exercise ? (exercise as { patientReps: number }).patientReps : (exercise.reps ?? 0);

  const repsDisplay = exercise.holdSeconds && displayReps === 0
    ? formatTime(exercise.holdSeconds)
    : exercise.holdSeconds && displayReps > 0
    ? `${displayReps} חז' + ${formatTime(exercise.holdSeconds)} החזקה`
    : `${displayReps} חזרות`;

  return (
    <div
      className="rounded-2xl border transition-all duration-300 overflow-hidden"
      style={{
        background: isCustom ? '#fffbf5' : 'white',
        borderColor: isCompleted ? '#6ee7b7' : isCustom ? '#fdba74' : '#e0f2f1',
        borderWidth: isCompleted || isCustom ? 2 : 1,
        boxShadow: isCompleted
          ? '0 2px 12px rgba(16,185,129,0.12)'
          : isCustom
          ? '0 2px 8px rgba(251,146,60,0.10)'
          : '0 1px 4px rgba(0,0,0,0.06)',
        opacity: isCompleted ? 0.88 : 1,
      }}
      dir="rtl"
    >
      {/* Main row */}
      <div className="flex items-center gap-3 p-4">
        {/* Index badge */}
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-sm font-black shrink-0"
          style={
            isCompleted
              ? { background: '#d1fae5', color: '#059669' }
              : { background: '#e0f7f9', color: '#0d9488' }
          }
        >
          {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : index}
        </div>

        {/* Name + meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h4
              className="text-sm font-semibold leading-tight"
              style={{
                color: isCompleted ? '#6b7280' : '#1e293b',
                textDecoration: isCompleted ? 'line-through' : 'none',
              }}
            >
              {exercise.name}
            </h4>
            {/* Custom badge (shows instead of type chip for custom exercises) */}
            {isCustom ? (
              <span
                className="text-[10px] font-bold px-2 py-0.5 rounded-full flex items-center gap-0.5"
                style={{ background: '#fff7ed', color: '#c2410c', border: '1px solid #fdba74' }}
              >
                <Sparkles className="w-2.5 h-2.5" />
                מותאם
              </span>
            ) : (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{ background: type.bg, color: type.text }}
              >
                {type.label}
              </span>
            )}
          </div>

          {/* Sets × Reps */}
          <div className="flex items-center gap-3 mt-1 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-slate-600 font-medium">
              <RotateCcw className="w-3 h-3 text-teal-500" />
              {displaySets} סטים × {repsDisplay}
            </span>
            {exercise.holdSeconds && displayReps === 0 && (
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <Clock className="w-3 h-3" />
                {formatTime(exercise.holdSeconds)}
              </span>
            )}
            {/* Area chip */}
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: '#f0fffe', color: '#0d9488', border: '1px solid #99f6e4' }}
            >
              {bodyAreaLabels[exercise.targetArea]}
            </span>
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Difficulty dots */}
          <div className="hidden sm:flex flex-col items-center gap-0.5">
            <div className="flex gap-0.5">
              {difficultyDots(exercise.difficulty).map((filled, i) => (
                <span
                  key={i}
                  className="w-2 h-2 rounded-full"
                  style={{ background: filled ? diff.dot : '#e2e8f0' }}
                />
              ))}
            </div>
            <span className="text-[9px] text-slate-400">{diff.label}</span>
          </div>

          {/* XP badge */}
          <div
            className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold"
            style={{ background: '#fef9c3', color: '#b45309' }}
          >
            <Zap className="w-3 h-3" />
            +{exercise.xpReward}
          </div>

          {/* Play / Video button */}
          <button
            onClick={onVideoClick}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
            style={{ background: '#e0f7f9' }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                'linear-gradient(135deg, #0d9488, #10b981)';
              (e.currentTarget as HTMLButtonElement).style.color = 'white';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#e0f7f9';
              (e.currentTarget as HTMLButtonElement).style.color = '';
            }}
            title={exercise.videoPlaceholder ?? 'הדגמת וידאו'}
          >
            <Play className="w-4 h-4 text-teal-600" style={{ marginRight: '-1px' }} />
          </button>

          {/* Complete toggle */}
          <button
            onClick={onToggle}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all"
            style={
              isCompleted
                ? { background: '#d1fae5' }
                : { background: '#f1f5f9' }
            }
            title={isCompleted ? 'בטל סימון' : 'סמן כהושלם'}
          >
            {isCompleted ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            ) : (
              <Circle className="w-5 h-5 text-slate-400" />
            )}
          </button>

          {/* Expand instructions */}
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-teal-600 hover:bg-teal-50 transition-colors"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Expanded instructions */}
      {expanded && (
        <div
          className="px-4 pb-4 border-t pt-3"
          style={{ borderColor: '#e0f2f1', background: '#f8fffe' }}
        >
          {/* Video placeholder */}
          <div
            className="w-full h-24 rounded-xl flex flex-col items-center justify-center mb-3 border-2 border-dashed cursor-pointer hover:border-teal-400 hover:bg-teal-50 transition-colors group"
            style={{ borderColor: '#b2e4ec', background: '#f0fffe' }}
            onClick={onVideoClick}
          >
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center mb-1.5 transition-all group-hover:scale-110"
              style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
            >
              <Play className="w-5 h-5 text-white" style={{ marginRight: '-2px' }} />
            </div>
            <span className="text-xs text-teal-700 font-medium">
              {exercise.videoPlaceholder ?? 'לחץ לצפייה בהדגמת הוידאו'}
            </span>
            <span className="text-[10px] text-slate-400 mt-0.5">סרטון הדגמה יתווסף בקרוב</span>
          </div>

          {/* Instructions text */}
          <div className="flex items-start gap-2">
            <div
              className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
              style={{ background: '#e0f7f9' }}
            >
              <span className="text-[10px] font-bold text-teal-700">?</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">{exercise.instructions}</p>
          </div>
        </div>
      )}
    </div>
  );
}
