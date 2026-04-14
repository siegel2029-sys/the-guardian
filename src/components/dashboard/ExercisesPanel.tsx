import { useState, useMemo } from 'react';
import {
  Dumbbell,
  Flame,
  Trophy,
  Star,
  Zap,
  Play,
  X,
  CheckCircle2,
  PartyPopper,
} from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import BodyMap3D from '../body-map/BodyMap3D';
import ExerciseCard from './ExerciseCard';
import type { BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';
import { getStrengthenedBodyAreasToday } from '../../utils/strengthenedAreasToday';

// ── Video Modal ──────────────────────────────────────────────────
function VideoModal({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.55)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-800">{title}</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl flex items-center justify-center hover:bg-slate-100 transition-colors"
          >
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>
        {/* Video placeholder */}
        <div
          className="w-full aspect-video rounded-xl flex flex-col items-center justify-center border-2 border-dashed"
          style={{ background: '#f0fffe', borderColor: '#5eead4' }}
        >
          <div
            className="w-16 h-16 rounded-full flex items-center justify-center mb-3"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            <Play className="w-8 h-8 text-white" style={{ marginRight: '-3px' }} />
          </div>
          <p className="text-sm font-semibold text-teal-700">סרטון הדגמה</p>
          <p className="text-xs text-slate-400 mt-1">הווידאו יהיה זמין בגרסה הבאה</p>
        </div>
        <p className="text-xs text-slate-500 text-center mt-3">{title}</p>
      </div>
    </div>
  );
}

// ── Celebration overlay ─────────────────────────────────────────
function CelebrationBanner({ name }: { name: string }) {
  return (
    <div
      className="rounded-2xl p-4 mb-4 text-center border-2"
      style={{
        background: 'linear-gradient(135deg, #d1fae5, #ccfbf1)',
        borderColor: '#6ee7b7',
      }}
      dir="rtl"
    >
      <div className="flex items-center justify-center gap-2 mb-1">
        <PartyPopper className="w-5 h-5 text-emerald-600" />
        <span className="text-base font-bold text-emerald-800">כל הכבוד! {name}</span>
        <PartyPopper className="w-5 h-5 text-emerald-600" />
      </div>
      <p className="text-sm text-emerald-700">סיימת את כל תרגילי היום! הרצף שלך ממשיך 🔥</p>
    </div>
  );
}

// ── Session XP Bar ──────────────────────────────────────────────
function SessionXPBar({
  completed,
  total,
  sessionXp,
  maxXp,
  streak,
}: {
  completed: number;
  total: number;
  sessionXp: number;
  maxXp: number;
  streak: number;
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div
      className="rounded-2xl p-4 mb-4 border"
      style={{ background: 'white', borderColor: '#e0f2f1' }}
      dir="rtl"
    >
      {/* Header stats */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-teal-600" />
          אימון היום
        </h3>
        <div className="flex items-center gap-3">
          {/* Streak */}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-orange-50 border border-orange-200">
            <Flame className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-bold text-orange-700">{streak} ימים</span>
          </div>
          {/* Session XP */}
          <div className="flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-50 border border-amber-200">
            <Zap className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-bold text-amber-700">+{sessionXp} XP היום</span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-4 rounded-full overflow-hidden bg-slate-100 mb-2 relative">
        <div
          className="h-full rounded-full transition-all duration-500 relative"
          style={{
            width: `${pct}%`,
            background:
              pct === 100
                ? 'linear-gradient(90deg, #10b981, #34d399, #6ee7b7)'
                : 'linear-gradient(90deg, #0d9488, #10b981, #34d399)',
          }}
        >
          {pct > 15 && (
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-white text-[10px] font-bold">
              {pct}%
            </span>
          )}
        </div>
      </div>

      {/* Sub-stats */}
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {completed} מתוך {total} תרגילים הושלמו
        </span>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Trophy className="w-3 h-3 text-amber-400" />
            {sessionXp} / {maxXp} XP
          </span>
          <span className="flex items-center gap-1 text-xs text-slate-500">
            <Star className="w-3 h-3 text-teal-400" />
            {pct}% הושלם
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main ExercisesPanel ─────────────────────────────────────────
export default function ExercisesPanel() {
  const {
    selectedPatient,
    getExercisePlan,
    getTodaySession,
    toggleExercise,
    getPatientExerciseFinishReports,
    togglePatientInjuryHighlight,
    clearPatientInjuryHighlights,
    cycleTherapistBodyMapClinical,
  } = usePatient();
  const [videoModal, setVideoModal] = useState<string | null>(null);
  const [filterArea, setFilterArea] = useState<BodyArea | null>(null);

  const strengthenedToday = useMemo(() => {
    if (!selectedPatient) return [] as BodyArea[];
    return getStrengthenedBodyAreasToday(getPatientExerciseFinishReports(selectedPatient.id));
  }, [selectedPatient, getPatientExerciseFinishReports]);

  const allBodyAreasSorted = useMemo(
    () =>
      (Object.keys(bodyAreaLabels) as BodyArea[]).sort((a, b) =>
        bodyAreaLabels[a].localeCompare(bodyAreaLabels[b], 'he')
      ),
    []
  );

  const injurySet = useMemo(
    () => new Set(selectedPatient?.injuryHighlightSegments ?? []),
    [selectedPatient?.injuryHighlightSegments]
  );

  if (!selectedPatient) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm">
        אנא בחר מטופל
      </div>
    );
  }

  const plan = getExercisePlan(selectedPatient.id);
  const session = getTodaySession(selectedPatient.id);

  if (!plan) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm" dir="rtl">
        אין תכנית תרגילים למטופל זה עדיין
      </div>
    );
  }

  // Compute which body areas have exercises
  const activeAreas = [...new Set(plan.exercises.map((e) => e.targetArea))];

  // Filter exercises by clicked area on body map
  const visibleExercises = filterArea
    ? plan.exercises.filter((e) => e.targetArea === filterArea)
    : plan.exercises;

  const totalXp = plan.exercises.reduce((s, e) => s + e.xpReward, 0);
  const completedCount = session.completedIds.length;
  const allDone = completedCount === plan.exercises.length;

  return (
    <div className="h-full overflow-y-auto p-4 md:p-6" dir="rtl" style={{ background: '#F0F9FA' }}>
      {/* All-done celebration */}
      {allDone && <CelebrationBanner name={selectedPatient.name} />}

      {/* Session XP Bar */}
      <SessionXPBar
        completed={completedCount}
        total={plan.exercises.length}
        sessionXp={session.sessionXp}
        maxXp={totalXp}
        streak={selectedPatient.currentStreak}
      />

      {/* Main grid: body map + exercise list */}
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4">

        {/* ── Body Map Column ──────────────────────────────── */}
        <div className="flex flex-col gap-3">
          {/* 3D Body Map card */}
          <div
            className="rounded-2xl border overflow-hidden flex flex-col"
            style={{ borderColor: '#e0f2f1', minHeight: '520px' }}
          >
            {/* Header strip */}
            <div
              className="flex items-center justify-between px-4 py-2.5 border-b"
              style={{ background: 'white', borderColor: '#e0f2f1' }}
            >
              <h3 className="text-sm font-bold text-slate-800">מודל גוף 3D</h3>
              {filterArea && (
                <button
                  onClick={() => setFilterArea(null)}
                  className="flex items-center gap-1 text-xs text-teal-600 hover:text-teal-800 transition-colors"
                >
                  <X className="w-3 h-3" />
                  נקה סינון
                </button>
              )}
            </div>

            {/* 3D Canvas – fills the card */}
            <div className="flex min-h-0 flex-1 flex-col" style={{ minHeight: '460px' }}>
              <BodyMap3D
                wrapperClassName="h-full min-h-0 flex-1"
                activeAreas={activeAreas}
                primaryArea={selectedPatient.primaryBodyArea}
                clinicalArea={selectedPatient.primaryBodyArea}
                secondaryClinicalBodyAreas={selectedPatient.secondaryClinicalBodyAreas}
                stableInteraction
                painByArea={selectedPatient.analytics.painByArea}
                level={selectedPatient.level}
                xp={selectedPatient.xp}
                xpForNextLevel={selectedPatient.xpForNextLevel}
                streak={selectedPatient.currentStreak}
                strengthenedAreasToday={strengthenedToday}
                selectedArea={filterArea}
                injuryHighlightSegments={selectedPatient.injuryHighlightSegments}
                onAreaClick={(area) => {
                  cycleTherapistBodyMapClinical(selectedPatient.id, area);
                  setFilterArea((prev) => (prev === area ? null : area));
                }}
              />
            </div>

            {/* Legend */}
            <div className="mt-3 space-y-1.5">
              {activeAreas.map((area) => {
                const exercisesInArea = plan.exercises.filter((e) => e.targetArea === area);
                const completedInArea = exercisesInArea.filter((e) =>
                  session.completedIds.includes(e.id)
                ).length;
                const isPrimary = area === selectedPatient.primaryBodyArea;

                return (
                  <button
                    key={area}
                    onClick={() => setFilterArea((prev) => (prev === area ? null : area))}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-right transition-all"
                    style={{
                      background: filterArea === area ? '#ccfbf1' : 'transparent',
                      border: `1px solid ${filterArea === area ? '#5eead4' : 'transparent'}`,
                    }}
                  >
                    <span
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ background: isPrimary ? '#0d9488' : '#5eead4' }}
                    />
                    <span className="flex-1 text-xs font-medium text-slate-700 truncate">
                      {bodyAreaLabels[area]}
                    </span>
                    <span className="text-[10px] text-slate-500 shrink-0">
                      {completedInArea}/{exercisesInArea.length}
                    </span>
                    {completedInArea === exercisesInArea.length && (
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Hint */}
            <p className="text-[10px] text-slate-400 text-center mt-3 leading-snug">
              לחיצה על המפה: מחזור מוקד ראשי (אדום) / משני (כתום) / כבוי — וסינון הרשימה
            </p>
          </div>

          <div
            className="rounded-2xl border bg-white p-3 shadow-sm"
            style={{ borderColor: '#fecaca' }}
          >
            <div className="flex items-center justify-between gap-2 mb-1">
              <h4 className="text-xs font-black text-red-950">הדגשת פגיעה (אדום)</h4>
              <button
                type="button"
                onClick={() => clearPatientInjuryHighlights(selectedPatient.id)}
                className="text-[10px] font-semibold text-red-700 hover:underline shrink-0"
              >
                נקה הכל
              </button>
            </div>
            <p className="text-[10px] text-slate-500 mb-2 leading-snug">
              מקטעים נפרדים ממיקוד השיקום — לסימון שבר/כאב; נשמר אצל המטופל.
            </p>
            <div className="max-h-40 overflow-y-auto space-y-1 pr-0.5">
              {allBodyAreasSorted.map((a) => (
                <label
                  key={a}
                  className="flex items-center gap-2 text-[11px] cursor-pointer text-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={injurySet.has(a)}
                    onChange={() => togglePatientInjuryHighlight(selectedPatient.id, a)}
                    className="rounded border-red-300 text-red-600"
                  />
                  {bodyAreaLabels[a]}
                </label>
              ))}
            </div>
          </div>

          {/* Patient level mini card */}
          <div
            className="bg-white rounded-2xl border p-4"
            style={{ borderColor: '#e0f2f1' }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-lg shrink-0"
                style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
              >
                {selectedPatient.level}
              </div>
              <div className="flex-1">
                <p className="text-xs text-slate-500">רמה</p>
                <p className="text-sm font-bold text-slate-800">
                  {selectedPatient.xp.toLocaleString()} / {selectedPatient.xpForNextLevel.toLocaleString()} XP
                </p>
                <div className="h-2 rounded-full bg-slate-100 mt-1 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.min(
                        (selectedPatient.xp / selectedPatient.xpForNextLevel) * 100,
                        100
                      )}%`,
                      background: 'linear-gradient(90deg, #0d9488, #10b981)',
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Exercise List Column ──────────────────────────── */}
        <div className="flex flex-col gap-3">
          {/* Filter label */}
          {filterArea && (
            <div
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-medium"
              style={{ background: '#ccfbf1', borderColor: '#5eead4', color: '#0d9488' }}
            >
              <span>מסנן: {bodyAreaLabels[filterArea]}</span>
              <span className="text-xs opacity-70">({visibleExercises.length} תרגילים)</span>
              <button
                onClick={() => setFilterArea(null)}
                className="mr-auto flex items-center gap-1 text-teal-700 hover:text-teal-900"
              >
                <X className="w-3.5 h-3.5" />
                נקה
              </button>
            </div>
          )}

          {/* Exercise cards */}
          {visibleExercises.length === 0 ? (
            <div className="bg-white rounded-2xl p-8 text-center border border-teal-100">
              <p className="text-slate-400 text-sm">אין תרגילים לאזור הנבחר</p>
            </div>
          ) : (
            visibleExercises.map((exercise, i) => (
              <ExerciseCard
                key={exercise.id}
                exercise={exercise}
                index={i + 1}
                isCompleted={session.completedIds.includes(exercise.id)}
                onToggle={() =>
                  toggleExercise(
                    selectedPatient.id,
                    exercise.id,
                    exercise.isOptional ? 0 : exercise.xpReward
                  )
                }
                onVideoClick={() => setVideoModal(exercise.videoPlaceholder ?? exercise.name)}
              />
            ))
          )}

          {/* Complete all button */}
          {!allDone && !filterArea && (
            <button
              onClick={() => {
                plan.exercises.forEach((e) => {
                  if (!session.completedIds.includes(e.id)) {
                    toggleExercise(selectedPatient.id, e.id, e.isOptional ? 0 : e.xpReward);
                  }
                });
              }}
              className="mt-1 py-3 rounded-2xl text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:shadow-lg"
              style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
            >
              ✓ סיום יום – סמן הכל כהושלם
            </button>
          )}
        </div>
      </div>

      {/* Video modal */}
      {videoModal && (
        <VideoModal title={videoModal} onClose={() => setVideoModal(null)} />
      )}
    </div>
  );
}
