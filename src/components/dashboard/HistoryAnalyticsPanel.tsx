import { useMemo } from 'react';
import { Star, Flame, Trophy, Activity, TrendingUp, Dumbbell, BarChart3 } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { addClinicalDays } from '../../utils/clinicalCalendar';
import StatsCard from './StatsCard';
import XPProgressBar from './XPProgressBar';
import SessionHistory from './SessionHistory';
import Compliance7DayChart from './Compliance7DayChart';

/** היסטוריה, אנליטיקה והתקדמות — ללא לוח שנה/מפת גוף (מופיעים בפורטל מטופל) */
export default function HistoryAnalyticsPanel() {
  const { selectedPatient, clinicalToday, dailyHistoryByPatient, getExercisePlan } = usePatient();

  if (!selectedPatient) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm" dir="rtl">
        בחרו מטופל מהרשימה בצד
      </div>
    );
  }

  const p = selectedPatient;
  const plan = getExercisePlan(p.id);
  const plannedExerciseCount = plan?.exercises.length ?? 0;

  const complianceChartKey = useMemo(() => {
    const m = dailyHistoryByPatient[p.id];
    let fp = '';
    for (let i = 6; i >= 0; i--) {
      const d = addClinicalDays(clinicalToday, -i);
      fp += `${m?.[d]?.exercisesCompleted ?? 0}-`;
    }
    return `${p.id}|${clinicalToday}|${fp}|${plannedExerciseCount}`;
  }, [dailyHistoryByPatient, p.id, clinicalToday, plannedExerciseCount]);

  const completionRate =
    p.analytics.sessionHistory.length > 0
      ? (
          (p.analytics.sessionHistory.reduce(
            (sum, s) => sum + s.exercisesCompleted / s.totalExercises,
            0
          ) /
            p.analytics.sessionHistory.length) *
          100
        ).toFixed(0)
      : '0';

  const dynamicAvgPain =
    p.analytics.painHistory.length > 0
      ? (p.analytics.painHistory.reduce((s, r) => s + r.painLevel, 0) /
          p.analytics.painHistory.length).toFixed(1)
      : null;

  const dynamicAvgDifficulty =
    p.analytics.sessionHistory.length > 0
      ? (p.analytics.sessionHistory.reduce((s, sh) => s + sh.difficultyRating, 0) /
          p.analytics.sessionHistory.length).toFixed(1)
      : null;

  return (
    <div className="h-full overflow-y-auto p-6" dir="rtl">
      <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-teal-600" />
        היסטוריה ואנליטיקה
      </h2>
      <p className="text-sm text-slate-500 mb-5">{p.name}</p>

      <div className="bg-white rounded-2xl p-5 border border-teal-100 shadow-sm mb-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400" />
          התקדמות ורמה
        </h3>
        <XPProgressBar xp={p.xp} xpForNextLevel={p.xpForNextLevel} level={p.level} />
      </div>

      <Compliance7DayChart
        key={complianceChartKey}
        patientId={p.id}
        clinicalToday={clinicalToday}
        localDayMap={dailyHistoryByPatient[p.id]}
        plannedExerciseCount={plannedExerciseCount}
      />

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
        <StatsCard
          label="רצף נוכחי"
          value={`${p.currentStreak} ימים`}
          subtext={`שיא: ${p.longestStreak} ימים`}
          icon={<Flame className="w-5 h-5 text-orange-500" />}
          iconBg="#fff7ed"
          highlight={p.currentStreak >= 7}
        />
        <StatsCard
          label="סה״כ אימונים"
          value={p.analytics.totalSessions}
          subtext="מאז תחילת הטיפול"
          icon={<Dumbbell className="w-5 h-5 text-teal-600" />}
          iconBg="#ccfbf1"
        />
        <StatsCard
          label="שיעור השלמה"
          value={`${completionRate}%`}
          subtext="ממוצע כל האימונים"
          icon={<Trophy className="w-5 h-5 text-amber-500" />}
          iconBg="#fef9c3"
          trend={Number(completionRate) >= 80 ? 'up' : 'down'}
          trendValue={Number(completionRate) >= 80 ? 'מצוין' : 'לשיפור'}
        />
        <StatsCard
          label="ממוצע כאב"
          value={dynamicAvgPain ? `${dynamicAvgPain} / 10` : 'אין נתונים'}
          subtext={dynamicAvgPain ? `מ-${p.analytics.painHistory.length} דיווחים` : 'אין דיווחים עדיין'}
          icon={<Activity className="w-5 h-5 text-red-400" />}
          iconBg="#fee2e2"
        />
        <StatsCard
          label="קושי ממוצע"
          value={dynamicAvgDifficulty ? `${dynamicAvgDifficulty} / 5` : 'אין נתונים'}
          subtext={
            dynamicAvgDifficulty ? `מ-${p.analytics.sessionHistory.length} אימונים` : 'אין אימונים עדיין'
          }
          icon={<TrendingUp className="w-5 h-5 text-purple-500" />}
          iconBg="#f3e8ff"
        />
      </div>

      <div>
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-teal-600" />
          היסטוריית אימונים
        </h3>
        <SessionHistory sessions={p.analytics.sessionHistory} />
      </div>
    </div>
  );
}
