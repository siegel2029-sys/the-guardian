import { useMemo, useState } from 'react';
import { X, Stethoscope, Dumbbell, BookOpen, Microscope, Link2, Check, Pencil } from 'lucide-react';
import { EXERCISE_LIBRARY } from '../../data/mockData';
import type { BodyArea } from '../../types';
import { bodyAreaLabels } from '../../types';
import { exerciseMatchesPrimary } from '../../utils/clinicalBodyArea';
import { getClinicalIntakeAdvice } from '../../ai/clinicalIntakeAdvisor';
import { analyzeClinicalNote } from '../../utils/clinicalParser';

const ALL_AREAS = Object.keys(bodyAreaLabels) as BodyArea[];

export type ClinicalProfileSaveExtras = {
  displayName?: string;
  intakeStory?: string;
};

type Props = {
  initialPatientName: string;
  onClose: () => void;
  onSave: (
    primaryBodyArea: BodyArea,
    libraryExerciseIds: string[],
    extras?: ClinicalProfileSaveExtras
  ) => void;
};

type Step = 'intake' | 'review';

export default function ClinicalAiIntakeWizard({
  initialPatientName,
  onClose,
  onSave,
}: Props) {
  const [step, setStep] = useState<Step>('intake');
  const [intakeName, setIntakeName] = useState(initialPatientName);
  const [intakeStory, setIntakeStory] = useState('');
  const [detailedEdit, setDetailedEdit] = useState(false);

  const [primary, setPrimary] = useState<BodyArea>('back_lower');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const suggestedForPrimary = useMemo(
    () => EXERCISE_LIBRARY.filter((ex) => exerciseMatchesPrimary(ex, primary)),
    [primary]
  );

  const intakeAdvice = useMemo(() => getClinicalIntakeAdvice(primary), [primary]);

  const reviewAnalysis = useMemo(() => analyzeClinicalNote(intakeStory), [intakeStory]);

  const runAnalysisAndGoReview = () => {
    const analysis = analyzeClinicalNote(intakeStory);
    const p = analysis.primaryBodyArea ?? 'back_lower';
    const ids = [...new Set(analysis.proposedExercises.map((e) => e.id))];
    setPrimary(p);
    setSelectedIds(new Set(ids.length > 0 ? ids : []));
    setDetailedEdit(false);
    setStep('review');
  };

  const toggleLibId = (libId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(libId)) next.delete(libId);
      else next.add(libId);
      return next;
    });
  };

  const selectAllSuggested = () => {
    setSelectedIds(new Set(suggestedForPrimary.map((e) => e.id)));
  };

  const clearSelection = () => setSelectedIds(new Set());

  const extras = (): ClinicalProfileSaveExtras | undefined => {
    const name = intakeName.trim();
    const story = intakeStory.trim();
    const out: ClinicalProfileSaveExtras = {};
    if (name) out.displayName = name;
    if (story) out.intakeStory = story;
    return Object.keys(out).length ? out : undefined;
  };

  const commitSave = (primaryBodyArea: BodyArea, ids: string[]) => {
    if (ids.length === 0) return;
    onSave(primaryBodyArea, ids, extras());
    onClose();
  };

  const approveAi = () => {
    const analysis = analyzeClinicalNote(intakeStory);
    const p = analysis.primaryBodyArea ?? 'back_lower';
    const ids = [...new Set(analysis.proposedExercises.map((e) => e.id))];
    if (ids.length === 0) {
      const fb = EXERCISE_LIBRARY.filter((ex) => exerciseMatchesPrimary(ex, p)).slice(0, 4);
      commitSave(
        p,
        fb.map((e) => e.id)
      );
      return;
    }
    commitSave(p, ids);
  };

  const saveFromEditor = () => {
    commitSave(primary, [...selectedIds]);
  };

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.45)' }}
      dir="rtl"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col rounded-2xl bg-white shadow-2xl border border-teal-100"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clinical-ai-intake-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-teal-100 shrink-0">
          <h2
            id="clinical-ai-intake-title"
            className="text-base font-bold text-slate-800 flex items-center gap-2"
          >
            <Stethoscope className="w-5 h-5 text-teal-600" />
            {step === 'intake' ? 'אינטייק קליני' : 'סקירה והפעלה'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {step === 'intake' && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">שם תצוגה</label>
                <input
                  value={intakeName}
                  onChange={(e) => setIntakeName(e.target.value)}
                  placeholder="שם המטופל"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  סיפור / הערכה חופשית
                </label>
                <textarea
                  value={intakeStory}
                  onChange={(e) => setIntakeStory(e.target.value)}
                  placeholder="למשל: כאב ברך ימין אחרי ריצה, VAS 6, מטרה לחזור לריצה קלה..."
                  rows={6}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 resize-y min-h-[120px]"
                />
              </div>
            </>
          )}

          {step === 'review' && !detailedEdit && (
            <>
              <div
                className="rounded-xl border border-indigo-200 bg-indigo-50/90 p-3 space-y-2 text-[11px] text-indigo-950 leading-relaxed"
                role="region"
              >
                {reviewAnalysis.rationaleLinesHe.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-800">
                <p className="text-xs font-semibold text-slate-500 mb-1">מוקד מוצע</p>
                <p className="font-bold">
                  {bodyAreaLabels[reviewAnalysis.primaryBodyArea ?? 'back_lower']}
                </p>
                <p className="text-xs font-semibold text-slate-500 mt-2 mb-1">תרגילים מוצעים</p>
                <ul className="list-disc list-inside text-xs space-y-0.5 text-slate-700">
                  {reviewAnalysis.proposedExercises.slice(0, 8).map((ex) => (
                    <li key={ex.id}>{ex.name}</li>
                  ))}
                </ul>
              </div>
            </>
          )}

          {step === 'review' && detailedEdit && (
            <>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">
                  אזור גוף מרכזי (מפת גוף + תרגילים)
                </label>
                <select
                  value={primary}
                  onChange={(e) => {
                    setPrimary(e.target.value as BodyArea);
                    setSelectedIds(new Set());
                  }}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800"
                >
                  {ALL_AREAS.map((a) => (
                    <option key={a} value={a}>
                      {bodyAreaLabels[a]}
                    </option>
                  ))}
                </select>
              </div>

              <div
                className="rounded-xl border border-indigo-200 bg-indigo-50/90 p-3 space-y-2.5 text-[11px] text-indigo-950 leading-relaxed"
                role="region"
                aria-label="הנחיות אינטייק"
              >
                <p className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 shrink-0" />
                  פרוטוקול והמלצות (לפי אזור)
                </p>
                <p>{intakeAdvice.protocolHe}</p>
                <p className="text-indigo-800/95">
                  <span className="font-semibold">תרגילים: </span>
                  {intakeAdvice.exercisesHintHe}
                </p>
                <p className="text-indigo-800/95 flex gap-1.5">
                  <Microscope className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>
                    <span className="font-semibold">הבחנה דיפרנציאלית: </span>
                    {intakeAdvice.differentialHe}
                  </span>
                </p>
                <p className="text-indigo-800/95">
                  <span className="font-semibold">בדיקות נוספות: </span>
                  {intakeAdvice.furtherTestsHe}
                </p>
                <p className="rounded-lg bg-amber-100/90 border border-amber-300/80 px-2.5 py-2 text-amber-950 flex gap-1.5">
                  <Link2 className="w-4 h-4 shrink-0 mt-0.5 text-amber-800" />
                  <span>{intakeAdvice.chainWarningHe}</span>
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-semibold text-slate-600 flex items-center gap-1.5">
                    <Dumbbell className="w-4 h-4 text-teal-600" />
                    תוכנית ({suggestedForPrimary.length} תרגילים מוצעים)
                  </span>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={selectAllSuggested}
                      className="text-[11px] font-medium text-teal-700 hover:underline"
                    >
                      בחר הכל
                    </button>
                    <span className="text-slate-300">|</span>
                    <button
                      type="button"
                      onClick={clearSelection}
                      className="text-[11px] font-medium text-slate-500 hover:underline"
                    >
                      נקה
                    </button>
                  </div>
                </div>
                <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 max-h-52 overflow-y-auto">
                  {suggestedForPrimary.map((ex) => {
                    const on = selectedIds.has(ex.id);
                    return (
                      <li key={ex.id}>
                        <button
                          type="button"
                          onClick={() => toggleLibId(ex.id)}
                          className={`w-full text-right px-3 py-2.5 text-sm flex items-start gap-2 transition-colors ${
                            on ? 'bg-teal-50' : 'hover:bg-slate-50'
                          }`}
                        >
                          <span
                            className={`mt-0.5 w-4 h-4 rounded border shrink-0 flex items-center justify-center text-[10px] font-bold ${
                              on ? 'bg-teal-600 border-teal-600 text-white' : 'border-slate-300 bg-white'
                            }`}
                          >
                            {on ? '✓' : ''}
                          </span>
                          <span className="min-w-0">
                            <span className="font-semibold text-slate-800 block">{ex.name}</span>
                            <span className="text-[11px] text-slate-500">
                              {ex.muscleGroup} · {bodyAreaLabels[ex.targetArea]}
                            </span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
                {suggestedForPrimary.length === 0 && (
                  <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
                    אין תרגילים בספרייה לאזור זה — בחרו אזור אחר.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        <div className="px-5 py-4 border-t border-teal-100 flex flex-col gap-2 shrink-0">
          {step === 'intake' && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={runAnalysisAndGoReview}
                disabled={!intakeStory.trim()}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-45"
                style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
              >
                המשך לסקירה
              </button>
            </div>
          )}

          {step === 'review' && !detailedEdit && (
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setStep('intake')}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium"
              >
                חזרה
              </button>
              <button
                type="button"
                onClick={() => setDetailedEdit(true)}
                className="flex-1 py-2.5 rounded-xl border-2 border-amber-500 text-amber-900 bg-amber-50 text-sm font-semibold flex items-center justify-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                עריכה
              </button>
              <button
                type="button"
                onClick={approveAi}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
              >
                <Check className="w-4 h-4" />
                אישור
              </button>
            </div>
          )}

          {step === 'review' && detailedEdit && (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setDetailedEdit(false)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium"
              >
                חזרה לסיכום
              </button>
              <button
                type="button"
                disabled={selectedIds.size === 0}
                onClick={saveFromEditor}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-45"
                style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
              >
                שמירה
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
