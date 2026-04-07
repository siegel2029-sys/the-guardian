import { useState, useMemo, useEffect } from 'react';
import { LineChart, Dumbbell, Stethoscope } from 'lucide-react';
import type { Patient } from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { usePatient } from '../../../context/PatientContext';

type TabId = 'pain' | 'exercise' | 'assessment';

const tabs: { id: TabId; label: string; icon: typeof LineChart }[] = [
  { id: 'pain', label: 'דוחות כאב', icon: LineChart },
  { id: 'exercise', label: 'היסטוריית תרגול', icon: Dumbbell },
  { id: 'assessment', label: 'הערכה קלינית', icon: Stethoscope },
];

function PainTrendPanel({ patient }: { patient: Patient }) {
  const sorted = useMemo(
    () => [...patient.analytics.painHistory].sort((a, b) => a.date.localeCompare(b.date)),
    [patient.analytics.painHistory]
  );
  const sessions = useMemo(
    () => [...patient.analytics.sessionHistory].sort((a, b) => a.date.localeCompare(b.date)),
    [patient.analytics.sessionHistory]
  );

  const maxPain = 10;
  const dates = useMemo(() => {
    const set = new Set<string>();
    sorted.forEach((r) => set.add(r.date));
    sessions.forEach((s) => set.add(s.date));
    return [...set].sort();
  }, [sorted, sessions]);

  const painByDate = useMemo(() => {
    const m = new Map<string, number>();
    sorted.forEach((r) => m.set(r.date, r.painLevel));
    return m;
  }, [sorted]);

  const effortByDate = useMemo(() => {
    const m = new Map<string, number>();
    sessions.forEach((s) => m.set(s.date, s.difficultyRating));
    return m;
  }, [sessions]);

  if (dates.length === 0) {
    return (
      <p className="text-sm text-slate-500 text-center py-10">אין עדיין נתוני כאב או מאמץ לגרפים</p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold text-slate-600 mb-3">מגמת כאב (VAS) ומאמץ מדווח (1–5)</p>
        <div className="flex gap-1 items-end h-40 border-b border-slate-200 pb-1 px-1" style={{ direction: 'ltr' }}>
          {dates.map((d) => {
            const pain = painByDate.get(d);
            const effort = effortByDate.get(d);
            const painH = pain != null ? (pain / maxPain) * 100 : 0;
            const effortH = effort != null ? (effort / 5) * 100 : 0;
            return (
              <div key={d} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                <div className="flex gap-0.5 items-end justify-center h-32 w-full">
                  {pain != null && (
                    <div
                      className="w-[42%] rounded-t transition-all bg-blue-500 min-h-[4px]"
                      style={{ height: `${painH}%` }}
                      title={`כאב ${pain}/10`}
                    />
                  )}
                  {effort != null && (
                    <div
                      className="w-[42%] rounded-t transition-all bg-sky-300 min-h-[4px]"
                      style={{ height: `${effortH}%` }}
                      title={`מאמץ ${effort}/5`}
                    />
                  )}
                </div>
                <span className="text-[9px] text-slate-500 truncate w-full text-center leading-tight">
                  {d.slice(5).replace('-', '/')}
                </span>
              </div>
            );
          })}
        </div>
        <div className="flex gap-4 justify-center mt-3 text-[11px] text-slate-600">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-blue-500" /> כאב
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm bg-sky-300" /> מאמץ
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 overflow-hidden">
        <table className="w-full text-xs text-end">
          <thead className="bg-slate-50 text-slate-600 font-semibold">
            <tr>
              <th className="p-2">תאריך</th>
              <th className="p-2">כאב</th>
              <th className="p-2">אזור</th>
            </tr>
          </thead>
          <tbody>
            {sorted.slice(-14).reverse().map((r) => (
              <tr key={`${r.date}-${r.bodyArea}`} className="border-t border-slate-100">
                <td className="p-2">{r.date}</td>
                <td className="p-2 font-mono">{r.painLevel}/10</td>
                <td className="p-2">{bodyAreaLabels[r.bodyArea]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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

function ClinicalAssessmentPanel({ patient }: { patient: Patient }) {
  const { updateTherapistNotes, runClinicalAssessmentEngine } = usePatient();
  const [draft, setDraft] = useState(patient.therapistNotes);
  const [savedFlash, setSavedFlash] = useState(false);
  const [runFlash, setRunFlash] = useState(false);

  useEffect(() => {
    setDraft(patient.therapistNotes);
  }, [patient.id]);

  const saveOnly = () => {
    updateTherapistNotes(patient.id, draft);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 2000);
  };

  const saveAndRun = () => {
    runClinicalAssessmentEngine(patient.id, draft);
    setRunFlash(true);
    window.setTimeout(() => setRunFlash(false), 3200);
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 leading-relaxed">
        תיעדו הערכה חופשית. שמירה עם «הפעלת ניתוח מערכת» תייצר המלצת תרגיל (pending) למטופל — בהתאם
        למגמות כאב ולעמידה בתוכנית, יחד עם תוכן ההערה.
      </p>
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        rows={8}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        placeholder="סיכום קליני, תסמינים, תגובה לתרגול, המלצות להמשך…"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={saveOnly}
          className="px-4 py-2 rounded-lg text-sm font-semibold border border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
        >
          שמירת הערות בלבד
        </button>
        <button
          type="button"
          onClick={saveAndRun}
          className="px-4 py-2 rounded-lg text-sm font-bold text-white"
          style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)' }}
        >
          שמירה והפעלת המלצת מערכת
        </button>
      </div>
      {savedFlash && <p className="text-xs text-emerald-600 font-medium">ההערות נשמרו.</p>}
      {runFlash && (
        <p className="text-xs text-blue-700 font-medium">
          ההערות נשמרו. אם התאימה מגמה קלינית — נוצרה הצעת תרגיל חדשה בלשונית המעקב אצל המטופל.
        </p>
      )}
    </div>
  );
}

export default function ClinicalDeepDiveTabs({ patient }: { patient: Patient }) {
  const [tab, setTab] = useState<TabId>('pain');

  return (
    <div
      className="rounded-xl border bg-white shadow-sm overflow-hidden"
      style={{ borderColor: '#e2e8f0' }}
      dir="rtl"
    >
      <div className="flex border-b border-slate-200 bg-slate-50/90">
        {tabs.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 flex items-center justify-center gap-2 py-3 px-2 text-xs sm:text-sm font-semibold transition-colors ${
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
        {tab === 'pain' && <PainTrendPanel patient={patient} />}
        {tab === 'exercise' && <ExerciseHistoryPanel patient={patient} />}
        {tab === 'assessment' && <ClinicalAssessmentPanel patient={patient} />}
      </div>
    </div>
  );
}
