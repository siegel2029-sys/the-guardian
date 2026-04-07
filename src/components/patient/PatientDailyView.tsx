import { useState, useMemo } from 'react';
import { ArrowRight, Sparkles, X, MessageCircle } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import BodyMap3D from '../body-map/BodyMap3D';
import ExerciseReportModal from './ExerciseReportModal';
import ExerciseDetailModal from './ExerciseDetailModal';
import PatientExerciseCard from './PatientExerciseCard';
import type { PatientExercise, BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';

export default function PatientDailyView() {
  const {
    selectedPatient,
    getExercisePlan,
    getTodaySession,
    submitExerciseReport,
    setViewMode,
    sendPatientMessage,
  } = usePatient();

  const [reportFor, setReportFor] = useState<PatientExercise | null>(null);
  const [detailFor, setDetailFor] = useState<PatientExercise | null>(null);
  const [detailAutoStart, setDetailAutoStart] = useState(false);
  const [filterArea, setFilterArea] = useState<BodyArea | null>(null);
  const [messageOpen, setMessageOpen] = useState(false);
  const [messageText, setMessageText] = useState('');

  const plan = selectedPatient ? getExercisePlan(selectedPatient.id) : undefined;
  const session = selectedPatient ? getTodaySession(selectedPatient.id) : null;
  const exercises = plan?.exercises ?? [];

  const activeAreas = useMemo(
    () => [...new Set(exercises.map((e) => e.targetArea))],
    [exercises]
  );

  const visibleExercises = useMemo(
    () => (filterArea ? exercises.filter((e) => e.targetArea === filterArea) : exercises),
    [exercises, filterArea]
  );

  const completedSet = useMemo(
    () => new Set(session?.completedIds ?? []),
    [session?.completedIds]
  );

  const openExerciseDetail = (ex: PatientExercise, autoStart: boolean) => {
    if (completedSet.has(ex.id)) return;
    setDetailAutoStart(autoStart);
    setDetailFor(ex);
  };

  const closeExerciseDetail = () => {
    setDetailFor(null);
    setDetailAutoStart(false);
  };

  const handleRequestCompleteFromDetail = (ex: PatientExercise) => {
    closeExerciseDetail();
    if (!completedSet.has(ex.id)) {
      setReportFor(ex);
    }
  };

  const handleReportSubmit = (painLevel: number, effortRating: number) => {
    if (!reportFor || !selectedPatient) return;
    submitExerciseReport(
      selectedPatient.id,
      reportFor.id,
      painLevel,
      effortRating,
      reportFor.xpReward
    );
    setReportFor(null);
  };

  const sendMessage = () => {
    if (!selectedPatient || !messageText.trim()) return;
    sendPatientMessage(selectedPatient.id, messageText.trim());
    setMessageText('');
    setMessageOpen(false);
  };

  if (!selectedPatient) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center p-6 text-center"
        style={{ background: '#F0F9FA' }}
        dir="rtl"
      >
        <p className="text-teal-900 font-medium mb-4">לא נבחר מטופל</p>
        <button
          type="button"
          onClick={() => setViewMode('therapist')}
          className="px-5 py-2.5 rounded-2xl bg-teal-600 text-white font-medium"
        >
          חזרה למטפל
        </button>
      </div>
    );
  }

  const xp = selectedPatient.xp;
  const next = selectedPatient.xpForNextLevel;
  const pct = Math.min(100, Math.round((xp / next) * 100));

  return (
    <div
      className="min-h-screen flex flex-col max-w-lg mx-auto w-full shadow-xl relative"
      style={{ background: 'linear-gradient(180deg, #ecfdf5 0%, #f0fdfa 35%, #ffffff 100%)' }}
      dir="rtl"
    >
      <header
        className="sticky top-0 z-20 px-4 pt-4 pb-3 border-b flex items-center gap-3"
        style={{
          borderColor: '#99f6e4',
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <button
          type="button"
          onClick={() => setViewMode('therapist')}
          className="flex items-center gap-1.5 text-sm font-medium text-teal-700 px-3 py-2 rounded-xl hover:bg-teal-50 border border-teal-200/80"
        >
          <ArrowRight className="w-4 h-4" />
          חזרה למטפל
        </button>
        <div className="flex-1 min-w-0 text-end">
          <p className="text-xs text-teal-600 font-medium">תצוגת מטופל</p>
          <p className="text-base font-semibold text-slate-800 truncate">{selectedPatient.name}</p>
        </div>
      </header>

      <div className="flex-1 px-4 py-4 pb-28">
        {/* 3D Body map — patient status */}
        {exercises.length > 0 && (
          <section className="mb-5">
            <div className="flex items-center justify-between mb-2 px-0.5">
              <h2 className="text-base font-bold text-slate-800">מפת הגוף שלי</h2>
              {filterArea && (
                <button
                  type="button"
                  onClick={() => setFilterArea(null)}
                  className="flex items-center gap-1 text-xs font-medium text-teal-600 hover:text-teal-800"
                >
                  <X className="w-3 h-3" />
                  הצג הכל
                </button>
              )}
            </div>
            <p className="text-xs text-slate-500 mb-2">
              כאב ממוצע לפי אזור, אזורים בתוכנית, והתאמה לרמה {selectedPatient.level}
            </p>
            <div
              className="rounded-2xl border overflow-hidden flex flex-col"
              style={{ borderColor: '#a7f3d0', minHeight: '300px' }}
            >
              <div className="flex-1 min-h-[300px] w-full">
                <BodyMap3D
                  activeAreas={activeAreas}
                  primaryArea={selectedPatient.primaryBodyArea}
                  painByArea={selectedPatient.analytics.painByArea}
                  level={selectedPatient.level}
                  selectedArea={filterArea}
                  minHeightPx={300}
                  onAreaClick={(area) =>
                    setFilterArea((prev) => (prev === area ? null : area))
                  }
                />
              </div>
            </div>
            {filterArea && (
              <p className="text-xs text-teal-700 mt-2 font-medium">
                מסונן: {bodyAreaLabels[filterArea]}
              </p>
            )}
          </section>
        )}

        <div
          className="rounded-2xl p-4 mb-5 border"
          style={{
            borderColor: '#a7f3d0',
            background: 'linear-gradient(135deg, #f0fdfa, #ffffff)',
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-teal-600" />
            <span className="text-sm font-semibold text-teal-900">התקדמות</span>
          </div>
          <div className="flex justify-between text-sm text-slate-600 mb-1">
            <span>רמה {selectedPatient.level}</span>
            <span className="tabular-nums">
              {xp} / {next} נק׳
            </span>
          </div>
          <div className="h-2 rounded-full bg-teal-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${pct}%`,
                background: 'linear-gradient(90deg, #14b8a6, #059669)',
              }}
            />
          </div>
        </div>

        <h1 className="text-lg font-bold text-slate-800 mb-1">המשימות להיום</h1>
        <p className="text-sm text-slate-500 mb-4 leading-relaxed">
          השתמשו ב־<strong className="text-teal-800">נגן</strong> להתחלת מדד זמן, או ב־
          <strong className="text-teal-800">V</strong> לפתיחת ההנחיות — לאחר מדד זמן חובה יופיע דיווח
          VAS.
        </p>

        {exercises.length === 0 ? (
          <div
            className="rounded-2xl border border-dashed border-teal-200 p-8 text-center text-teal-800/80 text-sm"
            style={{ background: 'rgba(240, 253, 250, 0.6)' }}
          >
            אין תרגילים בתוכנית. המטפל יכול להוסיף תרגילים ממסך ניהול התוכנית.
          </div>
        ) : visibleExercises.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">
            אין תרגילים באזור שנבחר. נקו את הסינון או בחרו אזור אחר.
          </p>
        ) : (
          <ul className="space-y-3 flex flex-col">
            {visibleExercises.map((ex, i) => {
              const done = completedSet.has(ex.id);
              return (
                <li key={ex.id} className="w-full">
                  <PatientExerciseCard
                    exercise={ex}
                    index={i + 1}
                    isCompleted={done}
                    onPlay={() => openExerciseDetail(ex, true)}
                    onDone={() => openExerciseDetail(ex, false)}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Floating message to therapist */}
      {!detailFor && (
        <button
          type="button"
          onClick={() => setMessageOpen(true)}
          className="fixed z-[70] bottom-6 right-4 flex items-center gap-2 px-4 py-3 rounded-2xl font-semibold text-white shadow-lg max-w-[calc(100vw-2rem)]"
          style={{
            background: 'linear-gradient(135deg, #0d9488, #059669)',
            boxShadow: '0 12px 28px -8px rgba(13, 148, 136, 0.55)',
          }}
        >
          <MessageCircle className="w-5 h-5 shrink-0" />
          <span className="text-sm truncate">שלח הודעה למטפל</span>
        </button>
      )}

      {messageOpen && (
        <div
          className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center p-4"
          style={{ background: 'rgba(15, 118, 110, 0.3)' }}
          dir="rtl"
          onClick={() => setMessageOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-3xl border shadow-2xl overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, #f0fdfa 0%, #ffffff 50%)',
              borderColor: '#99f6e4',
            }}
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="msg-sheet-title"
          >
            <div
              className="flex items-center justify-between px-5 py-4 border-b"
              style={{ borderColor: '#ccfbf1' }}
            >
              <h2 id="msg-sheet-title" className="text-base font-bold text-teal-900">
                שלח הודעה למטפל
              </h2>
              <button
                type="button"
                onClick={() => setMessageOpen(false)}
                className="p-2 rounded-xl text-teal-600 hover:bg-teal-100/80"
                aria-label="סגור"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <textarea
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="כתבו כאן…"
                rows={4}
                className="w-full resize-none rounded-2xl border border-teal-200 px-4 py-3 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-400/50"
                style={{ background: '#fafefd' }}
              />
              <button
                type="button"
                disabled={!messageText.trim()}
                onClick={sendMessage}
                className="w-full py-3.5 rounded-2xl font-semibold text-white disabled:opacity-45"
                style={{
                  background: 'linear-gradient(135deg, #0d9488, #059669)',
                  boxShadow: '0 10px 25px -8px rgba(13, 148, 136, 0.5)',
                }}
              >
                שליחה
              </button>
            </div>
          </div>
        </div>
      )}

      <ExerciseDetailModal
        exercise={detailFor}
        onClose={closeExerciseDetail}
        onRequestComplete={handleRequestCompleteFromDetail}
        isCompleted={detailFor ? completedSet.has(detailFor.id) : false}
        autoStartTimer={detailAutoStart}
      />

      <ExerciseReportModal
        exercise={reportFor}
        onClose={() => setReportFor(null)}
        onSubmit={handleReportSubmit}
      />
    </div>
  );
}
