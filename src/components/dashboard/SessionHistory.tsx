import { CheckCircle2, XCircle, Flame } from 'lucide-react';
import type { ExerciseSession } from '../../types';
import { effortToScale10 } from '../../utils/effortScale';

interface SessionHistoryProps {
  sessions: ExerciseSession[];
}

function effortLabel(rating10: number): string {
  if (rating10 <= 2) return 'קל מאוד';
  if (rating10 <= 4) return 'קל';
  if (rating10 <= 6) return 'בינוני';
  if (rating10 <= 8) return 'קשה';
  return 'קשה מאוד';
}

function effortColor(rating10: number): string {
  if (rating10 <= 2) return '#10b981';
  if (rating10 <= 4) return '#34d399';
  if (rating10 <= 6) return '#f59e0b';
  if (rating10 <= 8) return '#f97316';
  return '#ef4444';
}

export default function SessionHistory({ sessions }: SessionHistoryProps) {
  const last5 = sessions.slice(-5).reverse();

  return (
    <div className="bg-white rounded-2xl p-4 border border-teal-100 shadow-sm" dir="rtl">
      <h4 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <Flame className="w-4 h-4 text-orange-500" />
        5 אימונים אחרונים
      </h4>

      {last5.length === 0 && (
        <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center mb-1"
            style={{ background: '#f0fffe' }}
          >
            <Flame className="w-5 h-5 opacity-30 text-orange-400" />
          </div>
          <p className="text-sm font-medium text-slate-400">אין נתוני אימונים</p>
          <p className="text-xs text-slate-300">
            היסטוריית האימונים תופיע כאן לאחר שיסיים הסשן הראשון
          </p>
        </div>
      )}

      <div className="space-y-2">
        {last5.map((session, i) => {
          const completion = (session.exercisesCompleted / session.totalExercises) * 100;
          const isComplete = session.exercisesCompleted === session.totalExercises;
          const effort10 = effortToScale10(session.difficultyRating, session.effortScale ?? null);

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
                    style={{ background: effortColor(effort10) }}
                    title={`מאמץ ${effort10}/10`}
                  >
                    {effortLabel(effort10)} ({effort10}/10)
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
                  <span className="text-[10px] font-semibold text-teal-600">
                    +{session.xpEarned} XP
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
