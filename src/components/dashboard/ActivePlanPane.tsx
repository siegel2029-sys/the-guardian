import { Check, ClipboardList } from 'lucide-react';
import type { PatientExercise } from '../../types';
import {
  DEFAULT_TARGET_WORKOUTS_PER_WEEK,
  TARGET_WORKOUTS_PER_WEEK_MAX,
  TARGET_WORKOUTS_PER_WEEK_MIN,
} from '../../utils/targetWorkoutsPerWeek';
import PlanExerciseRow from './PlanExerciseRow';
import type { PlanExerciseFieldUpdates } from './planBuilderShared';

export interface ActivePlanPaneProps {
  exercises: PatientExercise[];
  /** Weekly session target (1–7). */
  targetWorkoutsPerWeek?: number;
  onTargetWorkoutsPerWeekChange?: (value: number) => void;
  successMsg?: string | null;
  onRemove: (exerciseId: string) => void;
  onUpdate: (exerciseId: string, updates: PlanExerciseFieldUpdates) => void;
  onRegisterPendingFlush?: (flush: () => void) => () => void;
  className?: string;
}

const WEEKLY_TARGET_OPTIONS = Array.from(
  { length: TARGET_WORKOUTS_PER_WEEK_MAX - TARGET_WORKOUTS_PER_WEEK_MIN + 1 },
  (_, i) => TARGET_WORKOUTS_PER_WEEK_MIN + i
);

export default function ActivePlanPane({
  exercises,
  targetWorkoutsPerWeek = DEFAULT_TARGET_WORKOUTS_PER_WEEK,
  onTargetWorkoutsPerWeekChange,
  successMsg = null,
  onRemove,
  onUpdate,
  onRegisterPendingFlush,
  className = '',
}: ActivePlanPaneProps) {
  const totalXp = exercises.reduce((s, e) => s + e.xpReward, 0);
  const customCount = exercises.filter((e) => e.isCustom).length;
  const weeklyTargetId = 'plan-weekly-target';

  return (
    <section
      className={`flex flex-col flex-1 min-h-0 h-full overflow-hidden bg-white self-stretch ${className}`}
      dir="rtl"
      aria-label="תוכנית פעילה"
    >
      <div
        className="shrink-0 px-4 py-2 border-b flex flex-wrap items-center justify-between gap-3"
        style={{ background: '#f8fffe', borderColor: '#e0f2f1' }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <ClipboardList className="w-4 h-4 text-teal-600 shrink-0" aria-hidden />
          <span className="text-sm font-semibold text-slate-700">
            <span className="text-teal-700 font-black">{exercises.length}</span> תרגילים בתוכנית
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0 flex-wrap justify-end">
          {onTargetWorkoutsPerWeekChange && (
            <label
              htmlFor={weeklyTargetId}
              className="flex items-center gap-2 text-xs text-slate-600"
            >
              <span className="font-semibold whitespace-nowrap">יעד אימונים שבועי</span>
              <select
                id={weeklyTargetId}
                value={targetWorkoutsPerWeek}
                onChange={(e) => onTargetWorkoutsPerWeekChange(Number(e.target.value))}
                className="rounded-lg border border-teal-200 bg-white px-2 py-1.5 text-sm font-bold text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 min-h-9"
                aria-label="יעד אימונים שבועי"
              >
                {WEEKLY_TARGET_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? 'יום' : 'ימים'}
                  </option>
                ))}
              </select>
            </label>
          )}
          {exercises.length > 0 && (
            <span className="text-xs text-slate-500">
              {totalXp} XP
              {customCount > 0 ? ` · ${customCount} מותאמים` : ''}
            </span>
          )}
        </div>
      </div>

      {successMsg && (
        <div
          className="shrink-0 mx-4 mt-3 px-4 py-3 rounded-2xl flex items-center gap-3 text-sm font-bold shadow-md"
          style={{
            background: 'linear-gradient(135deg,#d1fae5,#ccfbf1)',
            color: '#065f46',
            border: '2px solid #6ee7b7',
          }}
          role="status"
        >
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center shrink-0"
            style={{ background: '#059669' }}
          >
            <Check className="w-4 h-4 text-white" aria-hidden />
          </div>
          <span className="flex-1 min-w-0">{successMsg}</span>
        </div>
      )}

      <div
        data-plan-builder-scroll
        data-scroll-lock-allow
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-3 space-y-2 bg-slate-100/70"
      >
        {exercises.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400 text-center">
            <ClipboardList className="w-10 h-10 opacity-30" aria-hidden />
            <p className="text-sm font-medium">התוכנית ריקה</p>
            <p className="text-xs max-w-xs">
              הוסף תרגילים מלשונית הקטלוג, או צור תרגיל מותאם אישית
            </p>
          </div>
        ) : (
          exercises.map((ex) => (
            <PlanExerciseRow
              key={ex.id}
              exercise={ex}
              onRemove={() => onRemove(ex.id)}
              onUpdate={(updates) => onUpdate(ex.id, updates)}
              onRegisterPendingFlush={onRegisterPendingFlush}
            />
          ))
        )}
      </div>
    </section>
  );
}
