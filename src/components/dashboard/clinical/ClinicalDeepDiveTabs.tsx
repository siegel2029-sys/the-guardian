import { useState, useMemo } from 'react';
import { Dumbbell, ClipboardCheck } from 'lucide-react';
import type { Patient } from '../../../types';
import TherapistReportsView from './TherapistReportsView';

type TabId = 'exercise' | 'finishReports';

const tabs: { id: TabId; label: string; icon: typeof Dumbbell }[] = [
  { id: 'exercise', label: 'היסטוריית תרגול', icon: Dumbbell },
  { id: 'finishReports', label: 'דיווחי סיום תרגול', icon: ClipboardCheck },
];

const difficultyHe: Record<number, string> = {
  1: 'קל מאוד',
  2: 'קל',
  3: 'בינוני',
  4: 'קשה',
  5: 'קשה מאוד',
};

function ExerciseHistoryPanel({ patient }: { patient: Patient }) {
  const rows = useMemo(
    () =>
      [...patient.analytics.sessionHistory].sort((a, b) => b.date.localeCompare(a.date)),
    [patient.analytics.sessionHistory]
  );

  if (rows.length === 0) {
    return <p className="text-sm text-slate-500 text-center py-10">אין היסטוריית סשנים</p>;
  }

  return (
    <div className="rounded-lg border border-slate-200 overflow-x-auto max-h-[420px] overflow-y-auto">
      <table className="w-full text-xs text-end min-w-[480px]">
        <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0">
          <tr>
            <th className="p-2">תאריך</th>
            <th className="p-2">הושלמו / מתוכננים</th>
            <th className="p-2">אחוז השלמה</th>
            <th className="p-2">מאמץ מדווח</th>
            <th className="p-2">XP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const pct =
              s.totalExercises > 0 ? Math.round((s.exercisesCompleted / s.totalExercises) * 100) : 0;
            return (
              <tr key={s.date} className="border-t border-slate-100 hover:bg-slate-50/80">
                <td className="p-2 whitespace-nowrap">{s.date}</td>
                <td className="p-2 font-mono">
                  {s.exercisesCompleted}/{s.totalExercises}
                </td>
                <td className="p-2">{pct}%</td>
                <td className="p-2">
                  {s.difficultyRating}/5 — {difficultyHe[s.difficultyRating] ?? ''}
                </td>
                <td className="p-2 text-blue-700 font-semibold">+{s.xpEarned}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function ClinicalDeepDiveTabs({ patient }: { patient: Patient }) {
  const [tab, setTab] = useState<TabId>('exercise');

  return (
    <div
      className="rounded-xl border bg-white shadow-sm overflow-hidden"
      style={{ borderColor: '#e2e8f0' }}
      dir="rtl"
    >
      <div className="flex flex-wrap border-b border-slate-200 bg-slate-50/90">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 py-3 px-2 text-xs sm:text-sm font-semibold transition-colors ${
                active
                  ? 'text-blue-800 bg-white border-b-2 border-blue-600 -mb-px'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              {t.label}
            </button>
          );
        })}
      </div>
      <div className="p-5">
        {tab === 'exercise' && <ExerciseHistoryPanel patient={patient} />}
        {tab === 'finishReports' && <TherapistReportsView patient={patient} />}
      </div>
    </div>
  );
}
