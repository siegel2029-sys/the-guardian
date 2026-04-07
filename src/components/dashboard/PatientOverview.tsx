import { useState } from 'react';
import {
  Star, Flame, Trophy, Activity, Dumbbell,
  User, CalendarDays, Stethoscope, FileText, TrendingUp, ClipboardList, AlertTriangle,
  KeyRound,
} from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { findPatientLoginByPatientId } from '../../context/authPersistence';
import StatsCard from './StatsCard';
import XPProgressBar from './XPProgressBar';
import PainAnalytics from './PainAnalytics';
import RedFlagAlert from './RedFlagAlert';
import SessionHistory from './SessionHistory';
import AiSuggestionsPanel from './AiSuggestionsPanel';
import PendingApprovalsPanel from './PendingApprovalsPanel';
import ManagePlanModal from './ManagePlanModal';
import { bodyAreaLabels } from '../../types';

const statusLabels: Record<string, string> = {
  active: 'פעיל', pending: 'ממתין', paused: 'מושהה',
};
const statusStyles: Record<string, { bg: string; text: string; dot: string }> = {
  active:  { bg: '#dcfce7', text: '#166534', dot: '#16a34a' },
  pending: { bg: '#fef9c3', text: '#854d0e', dot: '#ca8a04' },
  paused:  { bg: '#f1f5f9', text: '#475569', dot: '#94a3b8' },
};

export default function PatientOverview() {
  const {
    selectedPatient,
    getExercisePlan,
    isPatientExerciseSafetyLocked,
    clearPatientExerciseSafetyLock,
  } = usePatient();
  const [showManageModal, setShowManageModal] = useState(false);

  if (!selectedPatient) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        אנא בחר מטופל מהסרגל הצדדי
      </div>
    );
  }

  const p = selectedPatient;
  const style = statusStyles[p.status];
  const plan = getExercisePlan(p.id);
  const exerciseCount = plan?.exercises.length ?? 0;
  const patientAccessLoginId = findPatientLoginByPatientId(p.id);

  const completionRate =
    p.analytics.sessionHistory.length > 0
      ? (
          (p.analytics.sessionHistory.reduce(
            (sum, s) => sum + s.exercisesCompleted / s.totalExercises, 0
          ) / p.analytics.sessionHistory.length) * 100
        ).toFixed(0)
      : '0';

  // ── All analytics computed dynamically from raw data ──────────
  // Average pain (computed from painHistory)
  const dynamicAvgPain =
    p.analytics.painHistory.length > 0
      ? (p.analytics.painHistory.reduce((s, r) => s + r.painLevel, 0) /
          p.analytics.painHistory.length).toFixed(1)
      : null;

  // Average difficulty (computed from sessionHistory)
  const dynamicAvgDifficulty =
    p.analytics.sessionHistory.length > 0
      ? (p.analytics.sessionHistory.reduce((s, sh) => s + sh.difficultyRating, 0) /
          p.analytics.sessionHistory.length).toFixed(1)
      : null;

  return (
    <div className="h-full overflow-y-auto p-6" dir="rtl">
      {/* Red Flag Alert */}
      {p.hasRedFlag && <RedFlagAlert patient={p} />}

      {isPatientExerciseSafetyLocked(p.id) && (
        <div
          className="mb-5 rounded-2xl border-2 border-red-600 bg-red-50 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
          dir="rtl"
        >
          <div className="flex items-start gap-2 min-w-0">
            <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-black text-red-950">נעילת תרגול פעילה</p>
              <p className="text-xs text-red-900 mt-1 leading-relaxed">
                המטופל קיבל התראת חירום או נעילה קלינית. שחררו את הנעילה רק לאחר הערכה מתאימה ובהתאם לפרוטוקול.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => clearPatientExerciseSafetyLock(p.id)}
            className="shrink-0 px-4 py-2.5 rounded-xl text-sm font-bold text-white"
            style={{
              background: 'linear-gradient(135deg, #b91c1c, #7f1d1d)',
              boxShadow: '0 8px 20px -6px rgba(127, 29, 29, 0.45)',
            }}
          >
            שחרור נעילת תרגול
          </button>
        </div>
      )}

      {/* Patient Profile Header */}
      <div className="bg-white rounded-2xl p-5 border border-teal-100 shadow-sm mb-5">
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-black shadow-md shrink-0"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            {p.name.charAt(0)}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-xl font-bold text-slate-800">{p.name}</h2>
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: style.bg, color: style.text }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: style.dot }} />
                {statusLabels[p.status]}
              </span>
              {p.hasRedFlag && (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-sm"
                  style={{
                    background: 'linear-gradient(135deg, #fef2f2, #ffe4e6)',
                    color: '#b91c1c',
                    borderColor: '#f87171',
                  }}
                >
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  התראת בטיחות
                </span>
              )}
            </div>
            <p className="text-sm text-teal-700 font-medium mt-0.5">{p.diagnosis}</p>
            {patientAccessLoginId && (
              <p className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                <KeyRound className="w-3.5 h-3.5" />
                מזהה גישה למטופל:{' '}
                <span className="font-mono font-semibold text-teal-800">{patientAccessLoginId}</span>
              </p>
            )}
            <div className="flex items-center gap-4 mt-2 flex-wrap">
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <User className="w-3.5 h-3.5" /> גיל {p.age}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <Stethoscope className="w-3.5 h-3.5" />
                {bodyAreaLabels[p.primaryBodyArea]}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <CalendarDays className="w-3.5 h-3.5" />
                הצטרף: {new Date(p.joinDate).toLocaleDateString('he-IL')}
              </span>
              <span className="flex items-center gap-1.5 text-xs text-slate-500">
                <CalendarDays className="w-3.5 h-3.5" />
                אימון אחרון: {new Date(p.lastSessionDate).toLocaleDateString('he-IL')}
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setShowManageModal(true)}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
            >
              <ClipboardList className="w-4 h-4" />
              ניהול תוכנית
              {exerciseCount > 0 && (
                <span className="w-5 h-5 rounded-full bg-white/30 flex items-center justify-center text-xs font-black">
                  {exerciseCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Therapist Notes */}
        {p.therapistNotes && (
          <div className="mt-4 p-3 rounded-xl bg-teal-50 border border-teal-100 flex items-start gap-2">
            <FileText className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
            <p className="text-xs text-teal-800">{p.therapistNotes}</p>
          </div>
        )}
      </div>

      {/* XP / Level Progress */}
      <div className="bg-white rounded-2xl p-5 border border-teal-100 shadow-sm mb-5">
        <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
          <Star className="w-4 h-4 text-amber-400" />
          התקדמות ורמה
        </h3>
        <XPProgressBar xp={p.xp} xpForNextLevel={p.xpForNextLevel} level={p.level} />
      </div>

      {/* Stats Grid */}
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
          subtext={dynamicAvgDifficulty ? `מ-${p.analytics.sessionHistory.length} אימונים` : 'אין אימונים עדיין'}
          icon={<TrendingUp className="w-5 h-5 text-purple-500" />}
          iconBg="#f3e8ff"
        />
      </div>

      {/* ── Pending therapist approvals (after patient consent) ── */}
      <PendingApprovalsPanel />

      {/* ── AI Suggestions tracking ─────────────────────────────── */}
      <AiSuggestionsPanel />

      {/* Analytics Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-5">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-600" />
            ניתוח כאב
          </h3>
          <PainAnalytics analytics={p.analytics} primaryBodyArea={p.primaryBodyArea} />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
            <Dumbbell className="w-4 h-4 text-teal-600" />
            היסטוריית אימונים
          </h3>
          <SessionHistory sessions={p.analytics.sessionHistory} />
        </div>
      </div>

      {/* Manage Plan Modal */}
      {showManageModal && <ManagePlanModal onClose={() => setShowManageModal(false)} />}
    </div>
  );
}
