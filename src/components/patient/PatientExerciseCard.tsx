import { Play, CheckCircle2, Clock, RotateCcw, Zap, Sparkles } from 'lucide-react';
import type { PatientExercise } from '../../types';
import { bodyAreaLabels } from '../../types';
import { formatTime } from '../dashboard/ManagePlanModal';

const difficultyDots = (level: number) =>
  Array.from({ length: 5 }, (_, i) => i < level);

const difficultyColors: Record<number, { dot: string; label: string }> = {
  1: { dot: '#10b981', label: 'קל מאוד' },
  2: { dot: '#34d399', label: 'קל' },
  3: { dot: '#f59e0b', label: 'בינוני' },
  4: { dot: '#f97316', label: 'קשה' },
  5: { dot: '#ef4444', label: 'קשה מאוד' },
};

const typeStyle: Record<string, { bg: string; text: string; label: string }> = {
  clinical: { bg: '#e0f2fe', text: '#0369a1', label: 'קליני' },
  standard: { bg: '#f3e8ff', text: '#6b21a8', label: 'סטנדרטי' },
  custom: { bg: '#fff7ed', text: '#c2410c', label: 'מותאם' },
};

interface PatientExerciseCardProps {
  exercise: PatientExercise;
  index: number;
  isCompleted: boolean;
  /** ירוק — פותח פירוט ומתחיל טיימר אוטומטית */
  onPlay: () => void;
  /** V — פותח פירוט בלי התחלה אוטומטית */
  onDone: () => void;
}

export default function PatientExerciseCard({
  exercise,
  index,
  isCompleted,
  onPlay,
  onDone,
}: PatientExerciseCardProps) {
  const diff = difficultyColors[exercise.difficulty];
  const type = exercise.isCustom ? typeStyle.custom : typeStyle[exercise.type] ?? typeStyle.standard;
  const displaySets = exercise.patientSets;
  const displayReps = exercise.patientReps;

  const repsDisplay =
    exercise.holdSeconds && displayReps === 0
      ? formatTime(exercise.holdSeconds)
      : exercise.holdSeconds && displayReps > 0
        ? `${displayReps} חז' + ${formatTime(exercise.holdSeconds)} החזקה`
        : `${displayReps} חזרות`;

  return (
    <div
      className="rounded-2xl border transition-all duration-300 overflow-hidden w-full"
      style={{
        background: exercise.isCustom ? '#fffbf5' : 'white',
        borderColor: isCompleted ? '#6ee7b7' : exercise.isCustom ? '#fdba74' : '#e0f2f1',
        borderWidth: isCompleted || exercise.isCustom ? 2 : 1,
        boxShadow: isCompleted
          ? '0 2px 12px rgba(16,185,129,0.12)'
          : exercise.isCustom
            ? '0 2px 8px rgba(251,146,60,0.10)'
            : '0 1px 4px rgba(0,0,0,0.06)',
        opacity: isCompleted ? 0.92 : 1,
      }}
      dir="rtl"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4">
        {/* Index / done */}
        <div className="flex items-center gap-3 sm:contents">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-black shrink-0"
            style={
              isCompleted
                ? { background: '#d1fae5', color: '#059669' }
                : { background: '#e0f7f9', color: '#0d9488' }
            }
          >
            {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : index}
          </div>

          <div className="flex-1 min-w-0 sm:order-none">
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
              {exercise.isCustom ? (
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

            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="flex items-center gap-1 text-xs text-slate-600 font-medium">
                <RotateCcw className="w-3 h-3 text-teal-500 shrink-0" />
                {displaySets} סטים × {repsDisplay}
              </span>
              {exercise.holdSeconds && displayReps === 0 && (
                <span className="flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="w-3 h-3 shrink-0" />
                  {formatTime(exercise.holdSeconds)}
                </span>
              )}
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                style={{ background: '#f0fffe', color: '#0d9488', border: '1px solid #99f6e4' }}
              >
                {bodyAreaLabels[exercise.targetArea]}
              </span>
              <span
                className="text-[10px] px-2 py-0.5 rounded-full font-medium text-slate-600"
                style={{ background: '#f1f5f9', border: '1px solid #e2e8f0' }}
              >
                {exercise.muscleGroup}
              </span>
            </div>
          </div>
        </div>

        {/* Actions — stacked on narrow screens */}
        <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-teal-100/80 sm:border-0">
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
            <span className="text-[9px] text-slate-400 hidden sm:block">{diff.label}</span>
          </div>

          <div
            className="flex items-center gap-0.5 px-2 py-1 rounded-lg text-[10px] font-bold shrink-0"
            style={{ background: '#fef9c3', color: '#b45309' }}
          >
            <Zap className="w-3 h-3" />+{exercise.xpReward}
          </div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!isCompleted) onPlay();
            }}
            disabled={isCompleted}
            className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center transition-all disabled:opacity-40 shrink-0"
            style={{
              background: isCompleted ? '#e2e8f0' : 'linear-gradient(135deg, #0d9488, #10b981)',
              color: isCompleted ? '#94a3b8' : 'white',
              boxShadow: isCompleted ? 'none' : '0 4px 12px -4px rgba(13, 148, 136, 0.45)',
            }}
            title={isCompleted ? 'הושלם' : 'התחל תרגול והנחיות'}
            aria-label="נגן והתחל מדד זמן"
          >
            <Play className="w-4 h-4" style={{ marginRight: '-1px' }} />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (!isCompleted) onDone();
            }}
            disabled={isCompleted}
            className="w-10 h-10 sm:w-9 sm:h-9 rounded-xl flex items-center justify-center text-base font-black transition-all shrink-0 disabled:cursor-default"
            style={
              isCompleted
                ? { background: '#d1fae5', color: '#059669' }
                : {
                    background: 'linear-gradient(180deg, #14b8a6, #0d9488)',
                    color: '#fff',
                    boxShadow: '0 4px 14px -4px rgba(13, 148, 136, 0.5)',
                  }
            }
            title={isCompleted ? 'בוצע' : 'סיום — פתיחת הנחיות ומדד זמן'}
            aria-label="סימון ביצוע"
          >
            {isCompleted ? <CheckCircle2 className="w-5 h-5" /> : 'V'}
          </button>
        </div>
      </div>
    </div>
  );
}
