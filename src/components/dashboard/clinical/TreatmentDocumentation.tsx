import { useState, useEffect, useCallback, useMemo } from 'react';
import { Loader2, Sparkles, Save, History } from 'lucide-react';
import type { ClinicalTimelineEntry, Patient, TreatmentAiInsights } from '../../../types';
import { usePatient } from '../../../context/PatientContext';
import { getGeminiApiKey, GeminiRateLimitedError } from '../../../ai/geminiClient';
import { analyzeTreatmentAiInsights } from '../../../ai/geminiTreatmentAiInsights';
import { buildSupabaseClinicalDatastoreJson } from '../../../utils/buildSupabaseClinicalDatastoreJson';
import { deriveDiagnosisHeadline } from '../../../utils/clinicalNarrative';

function formatAiError(err: unknown): string {
  if (err instanceof GeminiRateLimitedError) return err.message;
  if (err instanceof Error) return err.message;
  return 'שגיאה בהפקת הערות AI';
}

type Props = { patient: Patient };

function sortTimelineDesc(entries: ClinicalTimelineEntry[]): ClinicalTimelineEntry[] {
  return [...entries].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function patchEntryInsights(
  entries: ClinicalTimelineEntry[],
  entryId: string,
  insights: TreatmentAiInsights
): ClinicalTimelineEntry[] {
  return entries.map((e) => (e.id === entryId ? { ...e, aiInsights: insights } : e));
}

function patchLatestEntryInsights(
  entries: ClinicalTimelineEntry[],
  insights: TreatmentAiInsights
): ClinicalTimelineEntry[] | null {
  if (entries.length === 0) return null;
  const latest = sortTimelineDesc(entries)[0];
  return patchEntryInsights(entries, latest.id, insights);
}

function InsightsSections({ insights }: { insights: TreatmentAiInsights }) {
  const when = new Date(insights.generatedAt).toLocaleString('he-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      <p className="text-xs text-slate-500 tabular-nums">נוצר: {when}</p>
      <section>
        <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide mb-1">התקדמות המטופל</h4>
        <p className="text-slate-800 whitespace-pre-wrap">{insights.patientProgress || '—'}</p>
      </section>
      <section>
        <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide mb-1">המלצות</h4>
        <p className="text-slate-800 whitespace-pre-wrap">{insights.recommendations || '—'}</p>
      </section>
      <section>
        <h4 className="text-xs font-black text-teal-900 uppercase tracking-wide mb-1">התאמות תרגילים</h4>
        <p className="text-slate-800 whitespace-pre-wrap">{insights.exerciseModifications || '—'}</p>
      </section>
    </div>
  );
}

export default function TreatmentDocumentation({ patient }: Props) {
  const { updatePatient, savePersistedStateToCloud } = usePatient();

  const [draftNote, setDraftNote] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [viewInsights, setViewInsights] = useState<TreatmentAiInsights | null>(null);

  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiPending, setAiPending] = useState<TreatmentAiInsights | null>(null);
  const [aiSaveBusy, setAiSaveBusy] = useState(false);

  const timeline = patient.clinicalTimeline ?? [];
  const sortedDesc = useMemo(() => sortTimelineDesc(timeline), [timeline]);
  const lastTreatment = sortedDesc[0];

  useEffect(() => {
    setDraftNote('');
    setAiPending(null);
    setAiError(null);
    setHistoryOpen(false);
    setAiModalOpen(false);
    setViewInsights(null);
  }, [patient.id]);

  const handleSave = useCallback(async () => {
    const text = draftNote.trim();
    if (!text) return;
    setSaveBusy(true);
    try {
      const entry: ClinicalTimelineEntry = {
        id: `treat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        createdAt: new Date().toISOString(),
        text,
      };
      updatePatient(patient.id, {
        clinicalTimeline: [...timeline, entry],
        geminiClinicalNarrative: text,
        diagnosis: deriveDiagnosisHeadline(text) || patient.diagnosis,
      });
      await savePersistedStateToCloud();
      setDraftNote('');
    } finally {
      setSaveBusy(false);
    }
  }, [draftNote, patient.id, patient.diagnosis, timeline, updatePatient, savePersistedStateToCloud]);

  const runAi = useCallback(async () => {
    if (!getGeminiApiKey()) {
      setAiError('הגדירו Supabase ופרסמו את gemini-proxy עם GEMINI_API_KEY.');
      return;
    }
    const hasContext = draftNote.trim().length > 0 || timeline.length > 0;
    if (!hasContext) {
      setAiError('הזינו תיעוד סשן או שמרו לפחות טיפול אחד לפני הפקת הערות AI.');
      return;
    }
    setAiBusy(true);
    setAiError(null);
    setAiPending(null);
    try {
      const datastoreJson = await buildSupabaseClinicalDatastoreJson(patient.id);
      const result = await analyzeTreatmentAiInsights(patient, draftNote, datastoreJson);
      setAiPending(result);
    } catch (e) {
      setAiError(formatAiError(e));
    } finally {
      setAiBusy(false);
    }
  }, [patient, draftNote, timeline.length]);

  const persistAiInsights = useCallback(async () => {
    if (!aiPending) return;
    const d = draftNote.trim();

    setAiSaveBusy(true);
    try {
      if (d) {
        const entry: ClinicalTimelineEntry = {
          id: `treat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          createdAt: new Date().toISOString(),
          text: d,
          aiInsights: aiPending,
        };
        updatePatient(patient.id, {
          clinicalTimeline: [...timeline, entry],
          geminiClinicalNarrative: d,
          diagnosis: deriveDiagnosisHeadline(d) || patient.diagnosis,
        });
        setDraftNote('');
      } else {
        const next = patchLatestEntryInsights(timeline, aiPending);
        if (!next) {
          setAiError('אין סשן אחרון לעדכון — הזינו תיעוד בשדה החדש או שמרו טיפול לפני שמירת הערות AI.');
          return;
        }
        updatePatient(patient.id, { clinicalTimeline: next });
      }
      await savePersistedStateToCloud();
      setAiPending(null);
      setAiModalOpen(false);
    } finally {
      setAiSaveBusy(false);
    }
  }, [
    aiPending,
    draftNote,
    patient.id,
    patient.diagnosis,
    timeline,
    updatePatient,
    savePersistedStateToCloud,
  ]);

  const openAiModal = () => {
    setAiError(null);
    setAiPending(null);
    setAiModalOpen(true);
  };

  return (
    <div
      id="treatment-documentation-panel"
      className="rounded-2xl border border-slate-200 bg-white shadow-sm mb-5 overflow-hidden scroll-mt-24"
      dir="rtl"
    >
      <div className="px-5 py-4 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base font-bold text-slate-950">תיעוד טיפולים</h2>
      </div>

      <div className="p-5 space-y-6">
        <section className="space-y-2" aria-labelledby="last-treatment-heading">
          <h3 id="last-treatment-heading" className="text-sm font-bold text-slate-950">
            טיפול אחרון
          </h3>
          {lastTreatment ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3 space-y-2">
              <time className="block text-xs font-semibold text-slate-500 tabular-nums">
                {new Date(lastTreatment.createdAt).toLocaleString('he-IL', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </time>
              <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">{lastTreatment.text}</p>
              {lastTreatment.aiInsights && (
                <button
                  type="button"
                  onClick={() => setViewInsights(lastTreatment.aiInsights!)}
                  className="text-xs font-bold text-teal-700 hover:underline"
                >
                  צפייה בהערות AI לסשן זה
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-xl bg-white">
              אין עדיין תיעוד טיפול שמור.
            </p>
          )}
        </section>

        <section className="space-y-3" aria-labelledby="new-treatment-heading">
          <h3 id="new-treatment-heading" className="text-sm font-bold text-slate-950">
            תיעוד טיפול חדש
          </h3>
          <label className="sr-only" htmlFor={`treatment-draft-${patient.id}`}>
            תיעוד טיפול חדש
          </label>
          <textarea
            id={`treatment-draft-${patient.id}`}
            value={draftNote}
            onChange={(e) => setDraftNote(e.target.value)}
            rows={6}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm text-slate-900 leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600/25 focus:border-teal-600/40"
            placeholder="תיעוד הסשן הנוכחי: ממצאים, טיפול, תוכנית המשך…"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saveBusy || !draftNote.trim()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:pointer-events-none min-h-[44px]"
            >
              {saveBusy ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden /> : <Save className="w-4 h-4" aria-hidden />}
              שמור
            </button>
            <button
              type="button"
              onClick={() => setHistoryOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border-2 border-slate-300 text-slate-800 bg-white hover:bg-slate-50 min-h-[44px]"
            >
              <History className="w-4 h-4 shrink-0" aria-hidden />
              היסטוריית טיפולים
            </button>
            <button
              type="button"
              onClick={openAiModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-slate-900 hover:bg-slate-800 min-h-[44px]"
            >
              <Sparkles className="w-4 h-4 shrink-0" aria-hidden />
              הערות AI
            </button>
          </div>
        </section>
      </div>

      {historyOpen && (
        <div
          className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="treatment-history-title"
        >
          <div className="w-full sm:max-w-lg max-h-[min(88dvh,720px)] flex flex-col bg-white sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
              <h2 id="treatment-history-title" className="text-base font-black text-slate-950">
                היסטוריית טיפולים
              </h2>
              <button
                type="button"
                onClick={() => setHistoryOpen(false)}
                className="px-3 py-2 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-200"
              >
                סגור
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-3">
              {sortedDesc.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">אין רשומות.</p>
              ) : (
                sortedDesc.map((e) => {
                  const when = new Date(e.createdAt).toLocaleString('he-IL', {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  });
                  return (
                    <article
                      key={e.id}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm space-y-2"
                    >
                      <time className="block text-xs font-semibold text-slate-500 tabular-nums">{when}</time>
                      <p className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed line-clamp-6">
                        {e.text}
                      </p>
                      <div className="flex justify-end">
                        {e.aiInsights ? (
                          <button
                            type="button"
                            onClick={() => {
                              setViewInsights(e.aiInsights!);
                              setHistoryOpen(false);
                            }}
                            className="text-xs font-black text-teal-700 hover:underline min-h-[40px]"
                          >
                            הערות AI
                          </button>
                        ) : (
                          <span className="text-[11px] text-slate-400">אין הערות AI שמורות</span>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {aiModalOpen && (
        <div
          className="fixed inset-0 z-[111] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="treatment-ai-title"
        >
          <div className="w-full sm:max-w-lg max-h-[min(92dvh,760px)] flex flex-col bg-white sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
              <h2 id="treatment-ai-title" className="text-base font-black text-slate-950 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-violet-600 shrink-0" aria-hidden />
                הערות AI
              </h2>
              <button
                type="button"
                onClick={() => {
                  setAiModalOpen(false);
                  setAiPending(null);
                  setAiError(null);
                }}
                className="px-3 py-2 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-200"
              >
                סגור
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                הניתוח משלב אינטייק, נתוני תרגול מ־Supabase, תיעודי עבר והטקסט בשדה ״תיעוד טיפול חדש״ (אם קיים).
                ללא טיוטה — ההערות יישמרו על <span className="font-bold">הטיפול האחרון</span> ברשימה.
              </p>
              {!aiPending && !aiBusy && (
                <button
                  type="button"
                  onClick={() => void runAi()}
                  className="w-full inline-flex justify-center items-center gap-2 px-4 py-3 rounded-xl text-sm font-black text-white bg-violet-600 hover:bg-violet-700 min-h-[48px]"
                >
                  <Sparkles className="w-4 h-4" aria-hidden />
                  הפק הערות AI
                </button>
              )}
              {aiBusy && (
                <div className="flex items-center gap-2 text-sm text-slate-600 py-4 justify-center">
                  <Loader2 className="w-5 h-5 animate-spin shrink-0" aria-hidden />
                  מנתח נתונים…
                </div>
              )}
              {aiError && <p className="text-sm text-red-700 whitespace-pre-wrap leading-relaxed">{aiError}</p>}
              {aiPending && (
                <>
                  <div className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
                    <InsightsSections insights={aiPending} />
                  </div>
                  <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
                    <button
                      type="button"
                      onClick={() => setAiPending(null)}
                      className="px-4 py-2.5 rounded-xl text-sm font-bold border border-slate-200 text-slate-700 hover:bg-slate-50"
                    >
                      נקה תוצאה
                    </button>
                    <button
                      type="button"
                      onClick={() => void persistAiInsights()}
                      disabled={
                        aiSaveBusy ||
                        Boolean(!draftNote.trim() && timeline.length === 0)
                      }
                      className="px-4 py-2.5 rounded-xl text-sm font-black text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40 disabled:pointer-events-none"
                    >
                      {aiSaveBusy ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin inline me-2" aria-hidden />
                          שומר…
                        </>
                      ) : (
                        'שמור הערות AI'
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {viewInsights && (
        <div
          className="fixed inset-0 z-[112] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="treatment-ai-view-title"
        >
          <div className="w-full sm:max-w-lg max-h-[min(88dvh,640px)] flex flex-col bg-white sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 flex items-center justify-between gap-2 bg-slate-50">
              <h2 id="treatment-ai-view-title" className="text-base font-black text-slate-950">
                הערות AI שמורות
              </h2>
              <button
                type="button"
                onClick={() => setViewInsights(null)}
                className="px-3 py-2 rounded-xl text-sm font-bold text-slate-700 hover:bg-slate-200"
              >
                סגור
              </button>
            </div>
            <div className="overflow-y-auto p-4">
              <InsightsSections insights={viewInsights} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
