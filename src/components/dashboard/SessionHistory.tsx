import { CheckCircle2, XCircle, Flame } from 'lucide-react';
import type { ExerciseSession } from '../../types';

interface SessionHistoryProps {
  sessions: ExerciseSession[];
}

const difficultyLabels: Record<number, string> = {
  1: 'קל מאוד',
  2: 'קל',
  3: 'בינוני',
  4: 'קשה',
  5: 'קשה מאוד',
};

const difficultyColors: Record<number, string> = {
  1: '#10b981',
  2: '#34d399',
  3: '#f59e0b',
  4: '#f97316',
  5: '#ef4444',
};

export default function SessionHistory({ sessions }: SessionHistoryProps) {
  const last5 = sessions.slice(-5).reverse();

  return (
    <div className="bg-white rounded-2xl p-4 border border-teal-100 shadow-sm" dir="rtl">
      <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <Flame className="w-4 h-4 text-orange-500" />
        5 אימונים אחרונים
      </h4>

      {/* ── Empty state ──────────────────────────────────────── */}
      {last5.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mb-1"
            style={{ background: '#f0fffe' }}>
            <Flame className="w-5 h-5 opacity-30 text-orange-400" />
          </div>
          <p className="text-sm font-medium text-slate-400">אין נתוני אימונים</p>
          <p className="text-xs text-slate-300">היסטוריית האימונים תופיע כאן לאחר שיסיים הסשן הראשון</p>
        </div>
      )}

      <div className="space-y-2">
        {last5.map((session, i) => {
          const completion = (session.exercisesCompleted / session.totalExercises) * 100;
          const isComplete = session.exercisesCompleted === session.totalExercises;

          return (
            <div
              key={i}
              className="flex items-center gap-3 p-2.5 rounded-xl border"
              style={{
                borderColor: isComplete ? '#a7f3d0' : '#fecaca',
                background: isComplete ? '#f0fdf9' : '#fff5f5',
              }}
            >
              {isComplete ? (
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-red-400 shrink-0" />
              )}
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-700">
                    {new Date(session.date).toLocaleDateString('he-IL', {
                      weekday: 'short',
                      day: 'numeric',
                      month: 'short',
                    })}
                  </span>
                  <span
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                    style={{ background: difficultyColors[session.difficultyRating] }}
                  >
                    {difficultyLabels[session.difficultyRating]}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${completion}%`,
                        background: isComplete ? '#10b981' : '#f87171',
                      }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {session.exercisesCompleted}/{session.totalExercises}
                  </span>
                  <span className="text-[10px] font-semibold text-teal-600">+{session.xpEarned} XP</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
