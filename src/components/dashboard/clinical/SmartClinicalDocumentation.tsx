import { useState, useEffect, useCallback, useRef } from 'react';
import { Loader2, Sparkles, CheckCircle2 } from 'lucide-react';
import type { ClinicalTimelineEntry, Patient } from '../../../types';
import { usePatient } from '../../../context/PatientContext';
import { getGeminiApiKey, GeminiRateLimitedError } from '../../../ai/geminiClient';
import {
  analyzeClinicalNoteWithSupabaseContext,
  type ClinicalContextReviewResult,
} from '../../../ai/geminiClinicalContextReview';
import { buildSupabaseClinicalDatastoreJson } from '../../../utils/buildSupabaseClinicalDatastoreJson';
import ClinicalTimeline from './ClinicalTimeline';
import { deriveDiagnosisHeadline } from '../../../utils/clinicalNarrative';

function formatAiError(err: unknown): string {
  if (err instanceof GeminiRateLimitedError) return err.message;
  if (err instanceof Error) return err.message;
  return 'שגיאה בניתוח';
}

type Props = { patient: Patient };

export default function SmartClinicalDocumentation({ patient }: Props) {
  const { updatePatient, savePersistedStateToCloud } = usePatient();

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
        const datastoreJson = await buildSupabaseClinicalDatastoreJson(patient.id);
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
      </div>
    </div>
  );
}
