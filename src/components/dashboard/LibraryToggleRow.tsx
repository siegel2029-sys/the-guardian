import { useState } from 'react';
import { Clock, RotateCcw, ChevronDown, ChevronUp } from 'lucide-react';
import type { Exercise } from '../../types';
import {
  formatExerciseBodyAreaLabels,
  formatExerciseMuscleGroups,
} from '../../utils/exerciseTargeting';
import {
  difficultyColor,
  difficultyLabel,
  typeBg,
  typeLabel,
  typeText,
} from './planBuilderShared';

export default function LibraryToggleRow({
  exercise,
  isAdded,
  onAdd,
  onRemove,
}: {
  exercise: Exercise;
  isAdded: boolean;
  onAdd: (isOptional: boolean) => void;
  onRemove: () => void;
}) {
  const [showDetail, setShowDetail] = useState(false);
  const [addAsOptional, setAddAsOptional] = useState(false);
  return (
    <div
      className={`rounded-xl border transition-colors ${isAdded ? 'border-emerald-300 bg-emerald-50/50' : 'border-slate-200 bg-white'}`}
      dir="rtl"
    >
      <div className="flex items-center gap-3 p-3">
        <button
          type="button"
          role="switch"
          aria-checked={isAdded}
          onClick={() => (isAdded ? onRemove() : onAdd(addAsOptional))}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 ${
            isAdded ? 'bg-emerald-500' : 'bg-slate-300'
          }`}
          title={isAdded ? 'הסרה מהתוכנית' : 'הוספה לתוכנית'}
        >
          <span
            className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ${
              isAdded ? 'end-0.5' : 'start-0.5'
            }`}
          />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-slate-800 truncate">{exercise.name}</span>
            <span
              className="text-[9px] px-1.5 py-0.5 rounded-full"
              style={{ background: typeBg[exercise.type], color: typeText[exercise.type] }}
            >
              {typeLabel[exercise.type]}
            </span>
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-teal-700">{formatExerciseMuscleGroups(exercise)}</span>
            <span className="text-[10px] text-slate-500">{formatExerciseBodyAreaLabels(exercise)}</span>
            <span className="text-[10px]" style={{ color: difficultyColor[exercise.difficulty] }}>
              ● {difficultyLabel[exercise.difficulty]}
            </span>
            <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
              {exercise.holdSeconds && !exercise.reps ? (
                <>
                  <Clock className="w-2.5 h-2.5" />
                  {exercise.sets}×{exercise.holdSeconds}שנ&apos;
                </>
              ) : (
                <>
                  <RotateCcw className="w-2.5 h-2.5" />
                  {exercise.sets}×{exercise.reps}
                </>
              )}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowDetail((v) => !v)}
          className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center hover:bg-slate-100 text-slate-400 transition-colors"
          aria-expanded={showDetail}
          title="הוראות"
        >
          {showDetail ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>
      {!isAdded && (
        <label className="flex items-center gap-2 px-3 pb-2 text-[10px] text-slate-600 cursor-pointer">
          <input
            type="checkbox"
            checked={addAsOptional}
            onChange={(e) => setAddAsOptional(e.target.checked)}
            className="rounded border-slate-300 text-teal-600"
          />
          <span>הוספה כתרגיל נוסף (לבחירה)</span>
        </label>
      )}
      {showDetail && (
        <div
          className="px-3 pb-3 pt-1 border-t text-xs text-slate-600 leading-relaxed"
          style={{ borderColor: '#e2e8f0', background: '#f8fffe' }}
        >
          {exercise.instructions}
        </div>
      )}
    </div>
  );
}
