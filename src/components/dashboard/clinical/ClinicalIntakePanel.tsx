import { useState, useEffect } from 'react';
import { Sparkles, CheckCircle2, Loader2 } from 'lucide-react';
import type { Patient } from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { usePatient } from '../../../context/PatientContext';
import { analyzeClinicalNote, type ClinicalIntakeAnalysis } from '../../../utils/clinicalParser';
import { summarizeTherapistIntakeNote } from '../../../ai/geminiTherapistDive';
import { getGeminiApiKey, GeminiRateLimitedError } from '../../../ai/geminiClient';

export default function ClinicalIntakePanel({ patient }: { patient: Patient }) {
  const { applyIntakeExercisePlan, updateTherapistNotes } = usePatient();
  const [note, setNote] = useState('');
  const [analysis, setAnalysis] = useState<ClinicalIntakeAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [appliedFlash, setAppliedFlash] = useState(false);
  const [followUpMode, setFollowUpMode] = useState(false);
  const [geminiSummary, setGeminiSummary] = useState<string | null>(null);
  const [geminiBusy, setGeminiBusy] = useState(false);
  const [geminiError, setGeminiError] = useState<string | null>(null);

  useEffect(() => {
    setNote('');
    setAnalysis(null);
    setFollowUpMode(false);
    setGeminiSummary(null);
    setGeminiError(null);
  }, [patient.id]);

  const runAnalysis = () => {
    const t = note.trim();
    if (!t) {
      setAnalysis(null);
      return;
    }
    setBusy(true);
    window.setTimeout(() => {
      setAnalysis(analyzeClinicalNote(t));
      setBusy(false);
    }, 280);
  };

  const runGeminiIntake = async () => {
    const t = note.trim();
    if (!t || !getGeminiApiKey()) {
      setGeminiError('הגדירו VITE_GEMINI_API_KEY ב־.env והפעילו מחדש את השרת.');
      return;
    }
    setGeminiBusy(true);
    setGeminiError(null);
    try {
      const text = await summarizeTherapistIntakeNote(patient, t, followUpMode ? 'follow_up' : 'initial');
      setGeminiSummary(text);
    } catch (e) {
      const msg =
        e instanceof GeminiRateLimitedError
          ? e.message
          : e instanceof Error
            ? e.message
            : 'שגיאת Gemini';
      setGeminiError(msg);
    } finally {
      setGeminiBusy(false);
    }
  };

  const applyPlan = () => {
    if (!analysis?.primaryBodyArea || analysis.proposedExercises.length === 0) return;
    applyIntakeExercisePlan(patient.id, analysis.proposedExercises, analysis.primaryBodyArea);
    updateTherapistNotes(patient.id, note.trim());
    setAppliedFlash(true);
    window.setTimeout(() => setAppliedFlash(false), 3500);
  };

  return (
    <div className="space-y-4" dir="rtl">
      <p className="text-sm text-slate-600 leading-relaxed">
        הזינו תיאור קליני חופשי (אנגלית או עברית). «ניתוח הערה» מריץ מנוע מקומי לתרגילים. «סיכום AI
        (Gemini)» מיועד למטפל — ניתוח מקצועי (דגלים, אבחנה מבדלת, דגשי תוכנית) לפי הטקסט ומפת הגוף
        במערכת.
      </p>

      <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={followUpMode}
          onChange={(e) => {
            setFollowUpMode(e.target.checked);
            setGeminiSummary(null);
            setGeminiError(null);
          }}
          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/40"
        />
        מצב אינטייק משכי (מטופל חוזר — Gemini יתמקד בשינוי, לא בדמוגרפיה)
      </label>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <div className="flex flex-col gap-3 min-h-[320px]">
          <h3 className="text-sm font-bold text-slate-800">הערכה / אבחון (Assessment / Evaluation)</h3>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={14}
            className="flex-1 min-h-[280px] w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500/35"
            placeholder="לדוגמה: Patient has ACL strain and limited ROM&#10;או: כאב כתף ימין, VAS 6, מגבלה בטווח תנועה"
          />
          <div className="flex flex-col sm:flex-row gap-2">
            <button
              type="button"
              onClick={runAnalysis}
              disabled={busy || !note.trim()}
              className="inline-flex flex-1 items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-45"
              style={{ background: 'linear-gradient(135deg, #1d4ed8, #2563eb)' }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              ניתוח הערה (מקומי)
            </button>
            <button
              type="button"
              onClick={() => void runGeminiIntake()}
              disabled={geminiBusy || !note.trim()}
              className="inline-flex flex-1 items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-45"
              style={{ background: 'linear-gradient(135deg, #4f46e5, #6366f1)' }}
            >
              {geminiBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              סיכום AI (Gemini)
            </button>
          </div>
          {geminiError && (
            <p className="text-xs text-red-600 font-medium whitespace-pre-wrap">{geminiError}</p>
          )}
          {geminiSummary && (
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 p-3 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed max-h-[220px] overflow-y-auto">
              <p className="font-bold text-indigo-900 mb-1">Gemini — למטפל</p>
              {geminiSummary}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-blue-100 bg-slate-50/80 p-4 flex flex-col min-h-[320px]">
          <h3 className="text-sm font-bold text-slate-800 mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-600" />
            תוכנית מוצעת
          </h3>

          {!analysis && (
            <div className="flex-1 flex items-center justify-center text-center text-sm text-slate-400 px-4">
              לאחר הזנת הערכה ולחיצה על «ניתוח הערה» תופיע כאן רשימת התרגילים המותאמים.
            </div>
          )}

          {analysis && (
            <>
              <div className="text-xs text-slate-600 space-y-1 mb-3 p-3 rounded-lg bg-white border border-slate-100">
                <p>
                  <span className="font-semibold text-slate-700">מוקד: </span>
                  {analysis.primaryBodyArea
                    ? bodyAreaLabels[analysis.primaryBodyArea]
                    : '—'}
                </p>
                {analysis.inferredPainLevel != null && (
                  <p>
                    <span className="font-semibold text-slate-700">כאב משוער מהטקסט: </span>
                    {analysis.inferredPainLevel}/10
                  </p>
                )}
                <ul className="list-disc list-inside text-slate-500 mt-2 space-y-0.5">
                  {analysis.rationaleLinesHe.slice(0, 6).map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              </div>

              <ul className="space-y-2 flex-1 overflow-y-auto max-h-[340px] pr-1">
                {analysis.proposedExercises.map((ex) => (
                  <li
                    key={ex.id}
                    className="flex flex-col gap-0.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <span className="font-semibold text-slate-800">{ex.name}</span>
                    <span className="text-xs text-slate-500">
                      {ex.muscleGroup} · קושי {ex.difficulty}/5 ·{' '}
                      {ex.holdSeconds ? `החזקה ${ex.holdSeconds}ש׳` : `${ex.reps ?? 0} חזרות`}
                    </span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={applyPlan}
                disabled={analysis.proposedExercises.length === 0 || !analysis.primaryBodyArea}
                className="mt-4 w-full py-3 rounded-xl text-sm font-black text-white flex items-center justify-center gap-2 disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #059669, #10b981)' }}
              >
                <CheckCircle2 className="w-5 h-5" />
                החל תוכנית (עדכון מלא + שמירה)
              </button>
              <p className="text-[10px] text-slate-400 mt-2 text-center leading-relaxed">
                מחליף את כל תרגילי המטופל בתוכנית הנוכחית, מעדכן מוקד גוף, ושומר את טקסט ההערכה בהערות
                המטפל (localStorage).
              </p>
            </>
          )}
        </div>
      </div>

      {appliedFlash && (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-900"
          role="status"
        >
          התוכנית הוחלה בהצלחה. המטופל יראה את התרגילים המעודכנים בפורטל.
        </div>
      )}
    </div>
  );
}
