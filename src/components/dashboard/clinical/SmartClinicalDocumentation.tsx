import { useState, useEffect, useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import { ChevronDown, Loader2, Sparkles, X, CheckCircle2 } from 'lucide-react';
import type { BodyArea, ClinicalTimelineEntry, Patient } from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { usePatient } from '../../../context/PatientContext';
import { supabase, isSupabaseConfigured } from '../../../lib/supabase';
import {
  fetchExercisePlanVersionsForPatient,
  fetchRecentSessionHistoryForPatient,
} from '../../../services/exerciseService';
import {
  analyzeClinicalNoteWithSupabaseContext,
  type ClinicalContextReviewResult,
} from '../../../ai/geminiClinicalContextReview';
import { getGeminiApiKey, GeminiRateLimitedError } from '../../../ai/geminiClient';
import { PortalDropdown } from '../../ui/PortalDropdown';
import ClinicalTimeline from './ClinicalTimeline';
import { deriveDiagnosisHeadline } from '../../../utils/clinicalNarrative';

const ALL_AREAS_SORTED: BodyArea[] = (Object.keys(bodyAreaLabels) as BodyArea[]).sort((a, b) =>
  bodyAreaLabels[a].localeCompare(bodyAreaLabels[b], 'he')
);

function PainAreasMultiSelect({
  selected,
  onToggle,
  onClear,
}: {
  selected: ReadonlySet<BodyArea>;
  onToggle: (area: BodyArea) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const count = selected.size;
  const summary = count === 0 ? 'בחרו אזורי כאב' : `${count} אזורים נבחרו`;
  const handleClose = useCallback(() => setOpen(false), []);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-xl border-2 border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 shadow-sm hover:border-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/35"
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="truncate text-right flex-1">{summary}</span>
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-slate-600 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {count > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {[...selected]
            .sort((a, b) => bodyAreaLabels[a].localeCompare(bodyAreaLabels[b], 'he'))
            .map((area) => (
              <span
                key={area}
                className="inline-flex items-center gap-1 rounded-lg bg-teal-900/90 text-white text-xs font-semibold px-2 py-1"
              >
                {bodyAreaLabels[area]}
                <button
                  type="button"
                  onClick={() => onToggle(area)}
                  className="rounded p-0.5 hover:bg-white/20"
                  aria-label={`הסר ${bodyAreaLabels[area]}`}
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
        </div>
      )}
      <PortalDropdown
        open={open}
        onClose={handleClose}
        triggerRef={triggerRef as RefObject<HTMLElement | null>}
      >
        <div dir="rtl" role="listbox" aria-multiselectable className="py-1">
          <div className="flex justify-between items-center px-2 py-1.5 border-b border-slate-100">
            <span className="text-[11px] font-bold text-slate-600">אזורי גוף</span>
            {count > 0 && (
              <button
                type="button"
                onClick={onClear}
                className="text-[11px] font-bold text-red-700 hover:underline"
              >
                נקה הכל
              </button>
            )}
          </div>
          {ALL_AREAS_SORTED.map((area) => (
            <label
              key={area}
              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 text-sm text-slate-900"
            >
              <input
                type="checkbox"
                checked={selected.has(area)}
                onChange={() => onToggle(area)}
                className="rounded border-slate-400 text-teal-700 focus:ring-teal-600/40 shrink-0"
              />
              <span>{bodyAreaLabels[area]}</span>
            </label>
          ))}
        </div>
      </PortalDropdown>
    </div>
  );
}

async function buildSupabaseDatastoreJson(patientId: string): Promise<string> {
  if (!isSupabaseConfigured || !supabase) {
    return JSON.stringify(
      { error: 'Supabase לא מוגדר — מוצגים רק נתונים מקומיים במודל.' },
      null,
      2
    );
  }
  const [planRows, sessions] = await Promise.all([
    fetchExercisePlanVersionsForPatient(supabase, patientId, 8),
    fetchRecentSessionHistoryForPatient(supabase, patientId, 14),
  ]);

  const sessionSummaries =
    sessions?.map((s) => ({
      date: s.date,
      completedExercises: s.completedIds?.length ?? 0,
      sessionXp: s.sessionXp,
    })) ?? [];

  return JSON.stringify(
    {
      exercise_plans: planRows ?? [],
      session_history_recent: sessionSummaries,
    },
    null,
    2
  );
}

function formatAiError(err: unknown): string {
  if (err instanceof GeminiRateLimitedError) return err.message;
  if (err instanceof Error) return err.message;
  return 'שגיאה בניתוח';
}

type Props = { patient: Patient };

export default function SmartClinicalDocumentation({ patient }: Props) {
  const {
    updatePatient,
    savePersistedStateToCloud,
    togglePatientInjuryHighlight,
    clearPatientInjuryHighlights,
  } = usePatient();

  const [noteDraft, setNoteDraft] = useState('');
  const [analyzeBusy, setAnalyzeBusy] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [trends, setTrends] = useState<string[]>([]);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [evaluationDraft, setEvaluationDraft] = useState('');
  const [approveBusy, setApproveBusy] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seqRef = useRef(0);

  useEffect(() => {
    setNoteDraft('');
    setAnalyzeError(null);
    setTrends([]);
    setAiSuggestion(null);
    setEvaluationDraft('');
  }, [patient.id]);

  const runAnalysis = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        setTrends([]);
        setAiSuggestion(null);
        setEvaluationDraft('');
        return;
      }
      if (!getGeminiApiKey()) {
        setAnalyzeError('הגדירו Supabase ופרסמו את gemini-proxy עם GEMINI_API_KEY כדי לנתח הקשר.');
        return;
      }

      const mySeq = ++seqRef.current;
      setAnalyzeBusy(true);
      setAnalyzeError(null);
      try {
        const datastoreJson = await buildSupabaseDatastoreJson(patient.id);
        const result: ClinicalContextReviewResult = await analyzeClinicalNoteWithSupabaseContext(
          patient,
          trimmed,
          datastoreJson
        );
        if (seqRef.current !== mySeq) return;
        setTrends(result.trends);
        setAiSuggestion(result.aiSuggestion);
        setEvaluationDraft(result.evaluationDraft);
      } catch (e) {
        if (seqRef.current !== mySeq) return;
        setAnalyzeError(formatAiError(e));
      } finally {
        if (seqRef.current === mySeq) setAnalyzeBusy(false);
      }
    },
    [patient]
  );

  const scheduleDebouncedAnalysis = useCallback(
    (text: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void runAnalysis(text);
      }, 1200);
    },
    [runAnalysis]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const injurySet = new Set(patient.injuryHighlightSegments ?? []);

  const scheduleCloudSave = useCallback(() => {
    void savePersistedStateToCloud();
  }, [savePersistedStateToCloud]);

  const handleToggleArea = useCallback(
    (area: BodyArea) => {
      togglePatientInjuryHighlight(patient.id, area);
      scheduleCloudSave();
    },
    [patient.id, togglePatientInjuryHighlight, scheduleCloudSave]
  );

  const timeline = patient.clinicalTimeline ?? [];

  const handleApprove = useCallback(async () => {
    const text = evaluationDraft.trim();
    if (!text) return;
    setApproveBusy(true);
    try {
      const entry: ClinicalTimelineEntry = {
        id: `clinical-tl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        text,
      };
      updatePatient(patient.id, {
        clinicalTimeline: [...timeline, entry],
        geminiClinicalNarrative: text,
        diagnosis: deriveDiagnosisHeadline(text) || patient.diagnosis,
      });
      await savePersistedStateToCloud();
      setEvaluationDraft('');
      setTrends([]);
      setAiSuggestion(null);
      setNoteDraft('');
    } finally {
      setApproveBusy(false);
    }
  }, [
    evaluationDraft,
    patient.id,
    timeline,
    updatePatient,
    savePersistedStateToCloud,
  ]);

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm mb-5 overflow-hidden" dir="rtl">
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base font-bold text-slate-950">תיעוד קליני חכם</h2>
        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
          הניתוח משתמש ב־<code className="text-[11px] bg-slate-200/80 px-1 rounded">exercise_plans</code>
          {' ו־'}
          <code className="text-[11px] bg-slate-200/80 px-1 rounded">session_history</code>
          {' מ־Supabase לצד נתוני מטופל מקומיים. הטיוטה נשמרת לציר הזמן רק לאחר האישור שלך.'}
        </p>
      </div>

      <div className="p-5 space-y-8">
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-slate-950">ציר זמן קליני</h3>
          <ClinicalTimeline entries={timeline} />
        </section>

        <section className="space-y-3">
          <h3 className="text-sm font-bold text-slate-950">טקסט חדש / עדכון</h3>
          <textarea
            value={noteDraft}
            onChange={(e) => {
              const v = e.target.value;
              setNoteDraft(v);
              scheduleDebouncedAnalysis(v);
            }}
            rows={6}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/25 focus:border-teal-600/40"
            placeholder="תיעוד סשן, שינוי במצב, כוונות לתוכנית, הערות על עומסים…"
            aria-label="טקסט תיעוד קליני"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void runAnalysis(noteDraft)}
              disabled={analyzeBusy || !noteDraft.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:pointer-events-none"
            >
              {analyzeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              נתח עם AI עכשיו
            </button>
            {analyzeBusy && (
              <span className="text-xs text-slate-600 self-center">מעבד הקשר מ־Supabase…</span>
            )}
          </div>
          {analyzeError && (
            <p className="text-sm text-red-700 whitespace-pre-wrap leading-relaxed">{analyzeError}</p>
          )}
        </section>

        {(trends.length > 0 || aiSuggestion) && (
          <section className="rounded-xl border border-teal-100 bg-teal-50/40 px-4 py-3 space-y-3">
            <h3 className="text-sm font-bold text-teal-950">מגמות מההיסטוריה</h3>
            {trends.length > 0 ? (
              <ul className="list-disc list-inside text-sm text-slate-800 space-y-1 leading-relaxed">
                {trends.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-slate-600">—</p>
            )}
            {aiSuggestion && (
              <div className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-2">
                <p className="text-xs font-bold text-amber-900 mb-1">הצעת AI</p>
                <p className="text-sm text-amber-950 leading-relaxed">{aiSuggestion}</p>
              </div>
            )}
          </section>
        )}

        <section className="space-y-3">
          <h3 className="text-sm font-bold text-slate-950">טיוטת הערכה (עריכה לפני שמירה)</h3>
          <textarea
            value={evaluationDraft}
            onChange={(e) => setEvaluationDraft(e.target.value)}
            rows={10}
            className="w-full rounded-xl border border-violet-200 bg-violet-50/20 px-3 py-3 text-sm text-slate-900 leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/35"
            placeholder="תוצאת ה־AI תופיע כאן — ערכו לפי הצורך לפני אישור."
            aria-label="טיוטת הערכה מבוססת AI"
          />
          <button
            type="button"
            onClick={() => void handleApprove()}
            disabled={approveBusy || !evaluationDraft.trim()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:pointer-events-none"
          >
            {approveBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            אשר ושמור לציר הזמן
          </button>
        </section>

        <section className="space-y-2">
          <h3 className="text-sm font-bold text-slate-950">אזורי כאב</h3>
          <p className="text-xs text-slate-600">הבחירה נשמרת בפרופיל המטופל.</p>
          <PainAreasMultiSelect
            selected={injurySet}
            onToggle={handleToggleArea}
            onClear={() => {
              clearPatientInjuryHighlights(patient.id);
              scheduleCloudSave();
            }}
          />
        </section>
      </div>
    </div>
  );
}
