import { useState, useCallback, useMemo, useEffect } from 'react';
import { X, Loader2, Sparkles, CheckCircle2, Archive } from 'lucide-react';
import type { ClinicalTimelineEntry, Patient, PatientIntakeArchive } from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { usePatient } from '../../../context/PatientContext';
import { getGeminiApiKey, GeminiRateLimitedError } from '../../../ai/geminiClient';
import { analyzeIntakeVersusCurrentCare, type IntakeComparativeAiResult } from '../../../ai/geminiIntakeComparativeFollowup';
import { buildSupabaseClinicalDatastoreJson } from '../../../utils/buildSupabaseClinicalDatastoreJson';
import { deriveDiagnosisHeadline } from '../../../utils/clinicalNarrative';

type Props = {
  patient: Patient;
  onClose: () => void;
};

function fallbackIntakeFromPatient(p: Patient): PatientIntakeArchive {
  return {
    capturedAt: p.joinDate,
    primaryBodyArea: p.primaryBodyArea,
    libraryExerciseIds: [],
    diagnosis: p.diagnosis,
    therapistNotes: p.therapistNotes,
    ...(p.geminiClinicalNarrative?.trim()
      ? { geminiClinicalNarrative: p.geminiClinicalNarrative.trim() }
      : {}),
    ...(p.displayAlias?.trim() || p.name
      ? { displayName: (p.displayAlias ?? p.name).trim() }
      : {}),
    extras: {
      intakeStory: p.therapistNotes,
      injuryHighlightSegments: [...(p.injuryHighlightSegments ?? [])],
      secondaryClinicalBodyAreas: [...(p.secondaryClinicalBodyAreas ?? [])],
      clinicalDiagnosis: p.diagnosis,
      ...(p.geminiClinicalNarrative?.trim()
        ? { geminiClinicalNarrative: p.geminiClinicalNarrative.trim() }
        : {}),
    },
  };
}

function formatAiError(err: unknown): string {
  if (err instanceof GeminiRateLimitedError) return err.message;
  if (err instanceof Error) return err.message;
  return 'שגיאה בניתוח';
}

export default function FullIntakeVaultModal({ patient, onClose }: Props) {
  const { updatePatient, savePersistedStateToCloud } = usePatient();
  const intake = patient.initialIntakeArchive ?? fallbackIntakeFromPatient(patient);
  const usingFallback = !patient.initialIntakeArchive;

  const [comparativeBusy, setComparativeBusy] = useState(false);
  const [comparativeError, setComparativeError] = useState<string | null>(null);
  const [comparativeResult, setComparativeResult] = useState<IntakeComparativeAiResult | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [approveBusy, setApproveBusy] = useState(false);

  useEffect(() => {
    setComparativeError(null);
    setComparativeResult(null);
    setNoteDraft('');
  }, [patient.id]);

  const intakeFields = useMemo(() => {
    const ex = intake.extras ?? {};
    return [
      { label: 'תאריך צילום אינטייק', value: new Date(intake.capturedAt).toLocaleString('he-IL') },
      { label: 'מוקד ראשי (אינטייק)', value: bodyAreaLabels[intake.primaryBodyArea] },
      { label: 'אבחנה (שדה קצר)', value: intake.diagnosis || '—' },
      { label: 'הערות / סיפור אינטייק', value: intake.therapistNotes || '—' },
      {
        label: 'סיכום AI באינטייק',
        value: intake.geminiClinicalNarrative ?? ex.geminiClinicalNarrative ?? '—',
      },
      { label: 'אבחון קליני (טקסט אינטייק)', value: ex.clinicalDiagnosis ?? '—' },
      { label: 'שם תצוגה באינטייק', value: intake.displayName ?? ex.displayName ?? '—' },
      {
        label: 'הדגשת פגיעה (אדום) באינטייק',
        value:
          (ex.injuryHighlightSegments ?? [])
            .map((a) => bodyAreaLabels[a])
            .join(', ') || '—',
      },
      {
        label: 'משני קליני (כתום) באינטייק',
        value:
          (ex.secondaryClinicalBodyAreas ?? [])
            .map((a) => bodyAreaLabels[a])
            .join(', ') || '—',
      },
      { label: 'דגל אדום באינטייק', value: ex.intakeRedFlag ? 'כן' : 'לא' },
      {
        label: 'מזהי תרגילים מהספרייה',
        value: intake.libraryExerciseIds?.length ? intake.libraryExerciseIds.join(', ') : '—',
      },
    ];
  }, [intake]);

  const runComparative = useCallback(async () => {
    if (!getGeminiApiKey()) {
      setComparativeError('הגדירו Supabase ופרסמו את gemini-proxy עם GEMINI_API_KEY.');
      return;
    }
    setComparativeBusy(true);
    setComparativeError(null);
    try {
      const datastoreJson = await buildSupabaseClinicalDatastoreJson(patient.id);
      const result = await analyzeIntakeVersusCurrentCare(patient, intake, datastoreJson);
      setComparativeResult(result);
      setNoteDraft(result.comparativeNoteDraft);
    } catch (e) {
      setComparativeError(formatAiError(e));
    } finally {
      setComparativeBusy(false);
    }
  }, [patient, intake]);

  const timeline = patient.clinicalTimeline ?? [];

  const handleApprove = useCallback(async () => {
    const text = noteDraft.trim();
    if (!text) return;
    setApproveBusy(true);
    try {
      const entry: ClinicalTimelineEntry = {
        id: `intake-cmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: new Date().toISOString(),
        text: `[השוואת אינטייק — אושר ידנית]\n${text}`,
      };
      updatePatient(patient.id, {
        clinicalTimeline: [...timeline, entry],
        geminiClinicalNarrative: text,
        diagnosis: deriveDiagnosisHeadline(text) || patient.diagnosis,
      });
      await savePersistedStateToCloud();
      onClose();
    } finally {
      setApproveBusy(false);
    }
  }, [noteDraft, patient.id, patient.diagnosis, timeline, updatePatient, savePersistedStateToCloud, onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="full-intake-vault-title"
      dir="rtl"
    >
      <div className="w-full sm:max-w-3xl max-h-[min(92dvh,900px)] flex flex-col bg-white sm:rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-slate-200 bg-slate-50 shrink-0">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-teal-700 text-white flex items-center justify-center shrink-0">
              <Archive className="w-5 h-5" aria-hidden />
            </div>
            <div className="min-w-0">
              <h2 id="full-intake-vault-title" className="text-lg font-black text-slate-950">
                סיכום אינטייק מלא
              </h2>
              {usingFallback && (
                <p className="text-xs text-amber-800 font-bold mt-1">
                  אין צילום אינטייק שמור — מוצגים נתוני בסיס מהפרופיל הנוכחי.
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-slate-200 text-slate-700 hover:bg-slate-100 shrink-0"
            aria-label="סגור"
          >
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          <div className="p-5 space-y-8">
            <section>
              <h3 className="text-sm font-bold text-slate-950 mb-3">שדות האינטייק</h3>
              <dl className="rounded-xl border border-slate-200 divide-y divide-slate-100 bg-white">
                {intakeFields.map((row) => (
                  <div key={row.label} className="px-4 py-3 flex flex-col sm:flex-row sm:gap-4 text-sm">
                    <dt className="font-bold text-slate-600 shrink-0 sm:w-44">{row.label}</dt>
                    <dd className="text-slate-900 whitespace-pre-wrap leading-relaxed flex-1 min-w-0 mt-1 sm:mt-0">
                      {row.value}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>

            <section className="rounded-2xl border border-violet-200 bg-violet-50/30 p-4 space-y-4">
              <h3 className="text-sm font-black text-violet-950">ניתוח השוואתי AI</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                ההשוואה נשענת על ארכיון האינטייק, היסטוריית סשנים ותוכניות מ־Supabase, והמצב הנוכחי של
                המטופל. הטקסט אינו נכנס לציר הזמן עד שתאשרו.
              </p>
              <button
                type="button"
                onClick={() => void runComparative()}
                disabled={comparativeBusy}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold text-white bg-violet-700 hover:bg-violet-800 disabled:opacity-40"
              >
                {comparativeBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                ) : (
                  <Sparkles className="w-4 h-4" aria-hidden />
                )}
                הרץ ניתוח השוואתי
              </button>
              {comparativeError && (
                <p className="text-sm text-red-700 whitespace-pre-wrap">{comparativeError}</p>
              )}
              {comparativeResult && (
                <div className="space-y-3 text-sm">
                  <div>
                    <p className="text-xs font-bold text-slate-600 mb-1">פערים / סתירות</p>
                    {comparativeResult.discrepancies.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1 text-slate-800 leading-relaxed">
                        {comparativeResult.discrepancies.map((d, i) => (
                          <li key={i}>{d}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500">—</p>
                    )}
                  </div>
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <p className="text-xs font-bold text-slate-600 mb-1">הערכה מחדש</p>
                    <p className="font-semibold text-slate-900">
                      {comparativeResult.reevaluation.needed ? 'מומלץ לשקול הערכה מחדש' : 'לא חובה'}
                    </p>
                    <p className="text-slate-700 mt-1 leading-relaxed">
                      {comparativeResult.reevaluation.rationaleHe}
                    </p>
                  </div>
                </div>
              )}
              <div>
                <label htmlFor="intake-comparative-draft" className="text-xs font-bold text-slate-700 block mb-1">
                  טיוטה לעריכה ואישור
                </label>
                <textarea
                  id="intake-comparative-draft"
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  rows={10}
                  className="w-full rounded-xl border border-violet-200 bg-white px-3 py-3 text-sm text-slate-900 leading-relaxed focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/35"
                />
              </div>
              <button
                type="button"
                onClick={() => void handleApprove()}
                disabled={approveBusy || !noteDraft.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-40"
              >
                {approveBusy ? (
                  <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                ) : (
                  <CheckCircle2 className="w-4 h-4" aria-hidden />
                )}
                אשר ושמור לציר הזמן
              </button>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
