import { useState, useEffect } from 'react';
import { Bug } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import type { AiDevLongitudinalScenario } from '../../ai/aiProgramLongitudinalGate';
import { lifetimeXpFromPatient } from '../../body/patientLevelXp';
import {
  DEV_MOCK_DATE_CHANGED_EVENT,
  getAppDate,
  getDevCalendarOffsetDays,
} from '../../utils/debugMockDate';
import { formatLocalYmd } from '../../utils/dailyKnowledgeFact';

/**
 * פאנל דיבוג — רק ב־development (מוצג מההורה).
 * God mode: היסטוריה, XP מצטבר, איפוס מלא.
 */
export default function PortalPatientDebugPanel() {
  const {
    selectedPatient,
    updatePatient,
    resetPatientToCleanAvatar,
    devMockSevenDayExerciseHistory,
    devBreakStreakRemoveYesterday,
    devAdjustPatientLifetimeXp,
    devSetPatientLifetimeXp,
    clinicalToday,
    devSkipToNextCalendarDay,
    devSkipClinicalDaysAhead,
    devSeedAiLongitudinalWindow,
    devSkipToPreviousCalendarDay,
    supabaseConfigured,
    supabaseSyncStatus,
    supabaseSyncError,
    savePersistedStateToCloud,
  } = usePatient();
  const [open, setOpen] = useState(false);
  const [lifetimeXpInput, setLifetimeXpInput] = useState('');
  const [mockDateUiRev, setMockDateUiRev] = useState(0);

  useEffect(() => {
    const onMock = () => setMockDateUiRev((n) => n + 1);
    window.addEventListener(DEV_MOCK_DATE_CHANGED_EVENT, onMock as EventListener);
    return () => window.removeEventListener(DEV_MOCK_DATE_CHANGED_EVENT, onMock as EventListener);
  }, []);

  if (!selectedPatient) return null;

  const pid = selectedPatient.id;
  const lifetimeTotal = Math.max(0, Math.floor(lifetimeXpFromPatient(selectedPatient)));

  useEffect(() => {
    if (!open) return;
    setLifetimeXpInput(String(lifetimeTotal));
  }, [open, lifetimeTotal]);

  void mockDateUiRev;
  const offsetDays = getDevCalendarOffsetDays();
  const appWallClockYmd = formatLocalYmd(getAppDate());

  return (
    <div
      className="fixed z-[60] text-start"
      style={{ left: 8, bottom: 'calc(88px + env(safe-area-inset-bottom, 0px))', maxWidth: 220 }}
      dir="rtl"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 rounded-xl px-2.5 py-1.5 text-[10px] font-bold border shadow-md"
        style={{
          background: 'rgba(15,23,42,0.88)',
          borderColor: '#475569',
          color: '#e2e8f0',
        }}
      >
        <Bug className="w-3.5 h-3.5" />
        דיבוג
      </button>
      {open && (
        <div
          className="mt-2 rounded-xl border p-2.5 space-y-2 shadow-xl max-h-[min(70vh,520px)] overflow-y-auto"
          style={{
            background: 'rgba(15,23,42,0.95)',
            borderColor: '#64748b',
          }}
        >
          <p className="text-[9px] text-slate-400 leading-snug">
            רק dev — נשמר ב־localStorage. XP בשדה = סה״כ מצטבר (כל הרמות).
          </p>

          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-wide">היסטוריה</p>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-emerald-950 text-emerald-100 hover:bg-emerald-900 border border-emerald-700/50"
            onClick={() => devMockSevenDayExerciseHistory(pid)}
          >
            Mock 7-Day History
          </button>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-orange-950 text-orange-100 hover:bg-orange-900 border border-orange-700/50"
            onClick={() => devBreakStreakRemoveYesterday(pid)}
          >
            Break Streak (מחק אתמול)
          </button>
          <div className="rounded-lg border border-slate-600/80 bg-slate-900/60 px-2 py-1.5 space-y-1">
            <p className="text-[9px] font-bold text-slate-200 uppercase tracking-wide">מכונת זמן (דיבאג)</p>
            <p className="text-[9px] text-slate-300 leading-snug tabular-nums" dir="ltr">
              יום קליני: <span className="text-emerald-200/95">{clinicalToday}</span>
            </p>
            <p className="text-[9px] text-slate-400 leading-snug tabular-nums" dir="ltr">
              לוח שנה (אפליקציה): {appWallClockYmd}
              {offsetDays !== 0 && (
                <span className="text-slate-500">
                  {' '}
                  · הזחה {offsetDays > 0 ? '+' : ''}
                  {offsetDays}
                </span>
              )}
            </p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              className="flex-1 min-w-0 text-[10px] font-semibold py-1.5 rounded-lg bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-600/70"
              onClick={() => devSkipToPreviousCalendarDay(pid)}
            >
              חזור יום אחורה (דיבאג)
            </button>
            <button
              type="button"
              className="flex-1 min-w-0 text-[10px] font-semibold py-1.5 rounded-lg bg-violet-950 text-violet-100 hover:bg-violet-900 border border-violet-700/50"
              onClick={() => devSkipToNextCalendarDay(pid)}
            >
              עבור ליום הבא (דיבאג)
            </button>
          </div>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-indigo-950 text-indigo-100 hover:bg-indigo-900 border border-indigo-700/50"
            onClick={() => devSkipClinicalDaysAhead(pid, 4)}
          >
            דלג 4 ימים קדימה (מצטבר)
          </button>
          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-wide">AI — חלון 4 ימים</p>
          <p className="text-[9px] text-slate-500 leading-snug">
            ממלא את 4 הימים האחרונים (כולל היום הקליני) ב־painHistory, sessionHistory וסשנים. אחרי «כאב עולה»
            פתחו אימונים — אמורה להופיע הצעת AI. «ללא מגמה» = בדיקת שלילה.
          </p>
          {(
            [
              ['rising_pain', 'Seed: כאב עולה'],
              ['low_compliance', 'Seed: השלמה נמוכה'],
              ['functional_decline', 'Seed: ירידה בתרגילים'],
              ['steady_clear', 'Seed: ללא מגמה'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-slate-800 text-slate-100 hover:bg-slate-700 border border-slate-600/50"
              onClick={() => devSeedAiLongitudinalWindow(pid, key as AiDevLongitudinalScenario)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-fuchsia-950 text-fuchsia-100 hover:bg-fuchsia-900 border border-fuchsia-700/50"
            onClick={() => {
              const lv = Math.max(1, selectedPatient.level + 1);
              updatePatient(pid, { level: Math.min(100, lv) });
            }}
          >
            Level Up (Debug) — +1 רמה
          </button>
          <p className="text-[9px] text-slate-500 leading-snug">
            קדימה: מזיז את «היום» +1, מאפס הידעת/מאמרים/סשן ופרהאב ליום הקליני החדש. אחורה: מזיז −1
            בלי למחוק היסטוריה — הידעת, רקע האווטאר והצעות AI נשענים על תאריך קליני + הנתונים השמורים
            לאותו יום.
          </p>

          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-wide pt-0.5">XP</p>
          <div className="flex gap-1">
            <button
              type="button"
              className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg bg-teal-900 text-teal-50 hover:bg-teal-800"
              onClick={() => devAdjustPatientLifetimeXp(pid, 100)}
            >
              +100 XP
            </button>
            <button
              type="button"
              className="flex-1 text-[10px] font-semibold py-1.5 rounded-lg bg-slate-700 text-slate-100 hover:bg-slate-600"
              onClick={() => devAdjustPatientLifetimeXp(pid, -100)}
            >
              −100 XP
            </button>
          </div>
          <div className="flex gap-1 items-stretch">
            <input
              type="number"
              min={0}
              className="flex-1 min-w-0 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-[10px] text-slate-100"
              value={lifetimeXpInput}
              onChange={(e) => setLifetimeXpInput(e.target.value)}
              aria-label="סה״כ XP מצטבר"
            />
            <button
              type="button"
              className="shrink-0 px-2 rounded-lg text-[10px] font-semibold bg-indigo-900 text-indigo-100 hover:bg-indigo-800 border border-indigo-700/50"
              onClick={() => {
                const n = Math.max(0, Math.floor(Number(lifetimeXpInput)));
                if (Number.isFinite(n)) devSetPatientLifetimeXp(pid, n);
              }}
            >
              החל
            </button>
          </div>

          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-wide pt-0.5">איפוס</p>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-rose-950 text-rose-100 hover:bg-rose-900 border border-rose-700/60"
            onClick={() => resetPatientToCleanAvatar(pid)}
          >
            Reset (משחק): רמה 1, XP/רצף/מטבעות/ציוד, דגל אדום+נעילה — שומר אבחון, הדגשות פגיעה ותוכנית
            תרגילים
          </button>

          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-wide pt-0.5">פריסטים — רמה (ויזואליה)</p>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-slate-700 text-slate-100 hover:bg-slate-600"
            onClick={() =>
              updatePatient(pid, {
                level: 5,
                xp: 0,
                xpForNextLevel: 500,
                currentStreak: 0,
              })
            }
          >
            רמה 5 — רזה / חלש
          </button>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-teal-900 text-teal-100 hover:bg-teal-800"
            onClick={() =>
              updatePatient(pid, {
                level: 35,
                xp: 1200,
                xpForNextLevel: 1800,
              })
            }
          >
            רמה 35 — שיקום פעיל
          </button>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-emerald-900 text-emerald-100 hover:bg-emerald-800"
            onClick={() =>
              updatePatient(pid, {
                level: 65,
                xp: 4000,
                xpForNextLevel: 9000,
              })
            }
          >
            רמה 65 — חיזוק
          </button>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-cyan-900 text-cyan-100 hover:bg-cyan-800"
            onClick={() =>
              updatePatient(pid, {
                level: 90,
                xp: 8000,
                xpForNextLevel: 16000,
              })
            }
          >
            רמה 90 — עוצמה
          </button>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-violet-950 text-violet-100 hover:bg-violet-900"
            onClick={() =>
              updatePatient(pid, {
                level: 100,
                xp: 0,
                xpForNextLevel: 999_999_999,
              })
            }
          >
            רמה 100 — מקסימום
          </button>
          <button
            type="button"
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-amber-900 text-amber-100 hover:bg-amber-800"
            onClick={() =>
              updatePatient(pid, {
                coins: selectedPatient.coins + 1000,
              })
            }
          >
            Rich Mode (+1000 מטבעות)
          </button>

          <p className="text-[9px] font-bold text-slate-300 uppercase tracking-wide pt-0.5">Supabase</p>
          {!supabaseConfigured && (
            <p className="text-[9px] text-amber-200/90 leading-snug">אין VITE_SUPABASE_* ב־.env</p>
          )}
          {supabaseSyncError && (
            <p className="text-[9px] text-red-300 whitespace-pre-wrap leading-snug">{supabaseSyncError}</p>
          )}
          <button
            type="button"
            disabled={!supabaseConfigured || supabaseSyncStatus === 'saving'}
            className="w-full text-[10px] font-semibold py-1.5 rounded-lg bg-sky-950 text-sky-100 hover:bg-sky-900 border border-sky-700/50 disabled:opacity-40"
            onClick={() => void savePersistedStateToCloud()}
          >
            {supabaseSyncStatus === 'saving' ? 'שומר…' : 'שמירה ל-Supabase (כל המטופלים)'}
          </button>
        </div>
      )}
    </div>
  );
}
