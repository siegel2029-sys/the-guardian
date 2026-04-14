import { useMemo, useState } from 'react';
import {
  X,
  Stethoscope,
  Dumbbell,
  BookOpen,
  Microscope,
  Link2,
  Check,
  Pencil,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { EXERCISE_LIBRARY } from '../../data/mockData';
import type { BodyArea, Exercise, InitialClinicalProfileExtras } from '../../types';
import { bodyAreaLabels } from '../../types';
import { exerciseMatchesPrimary } from '../../utils/clinicalBodyArea';
import { getClinicalIntakeAdvice } from '../../ai/clinicalIntakeAdvisor';
import { analyzeClinicalNote, type ClinicalIntakeAnalysis } from '../../utils/clinicalParser';
import {
  getGeminiApiKey,
  analyzeIntakeStoryWithGemini,
  GeminiRateLimitedError,
} from '../../ai/geminiClinicalIntake';
import { isJointBodyArea, filterToJointBodyAreas } from '../../body/jointBodyAreas';
import {
  extractHeuristicIntakeRedFlags,
  heuristicIntakeRedFlagDetected,
} from '../../utils/intakeRedFlagHeuristics';

export type ClinicalProfileSaveExtras = InitialClinicalProfileExtras;

const ALL_AREAS = Object.keys(bodyAreaLabels) as BodyArea[];

type Props = {
  initialPatientName: string;
  /** מזהה פורטל קבוע (רמזים) — לא ניתן לעריכה; נכלל בניתוח AI כמזהה פנימי */
  lockedPortalUsername?: string | null;
  /** יצירה מסרגל צד vs עריכה מסקירת מטפל */
  clinicalIntakeMode?: 'create' | 'edit';
  onClose: () => void;
  onSave: (
    primaryBodyArea: BodyArea,
    libraryExerciseIds: string[],
    extras?: ClinicalProfileSaveExtras
  ) => void;
};

type Step = 'intake' | 'review';

type AnalysisBundle = {
  primaryBodyArea: BodyArea;
  proposedExercises: Exercise[];
  rationaleLinesHe: string[];
  clinicalDiagnosis: string;
  redFlags: string[];
  redFlagDetected: boolean;
  injuryHighlightSegments: BodyArea[];
  secondaryClinicalBodyAreas: BodyArea[];
  source: 'gemini' | 'local';
  /** הודעה למטפל (למשל מכסת Gemini מלאה) */
  intakeNoticeHe?: string;
};

function buildLocalBundle(story: string, local: ClinicalIntakeAnalysis): AnalysisBundle {
  const primaryBodyArea = local.primaryBodyArea ?? 'back_lower';
  const jointAreas = filterToJointBodyAreas(local.bodyAreas);
  let injuryHighlightSegments: BodyArea[] = [];
  if (isJointBodyArea(primaryBodyArea)) {
    injuryHighlightSegments = [primaryBodyArea];
  } else if (jointAreas.length > 0) {
    injuryHighlightSegments = [jointAreas[0]];
  }
  const secondaryClinicalBodyAreas = jointAreas.filter((a) => !injuryHighlightSegments.includes(a));
  const redFlags = extractHeuristicIntakeRedFlags(story);
  const redFlagDetected = heuristicIntakeRedFlagDetected(redFlags);
  return {
    primaryBodyArea,
    proposedExercises: local.proposedExercises,
    rationaleLinesHe: local.rationaleLinesHe,
    clinicalDiagnosis: `מוקד טיפול: ${bodyAreaLabels[primaryBodyArea]}`,
    redFlags,
    redFlagDetected,
    injuryHighlightSegments,
    secondaryClinicalBodyAreas,
    source: 'local',
  };
}

async function runIntakeAnalysis(
  story: string,
  followUp: boolean,
  portalIdentity?: string | null
): Promise<AnalysisBundle> {
  const trimmed = story.trim();
  const identitySuffix =
    portalIdentity && portalIdentity.trim()
      ? `\n\n[מזהה פורטל קבוע (מעקב פנימי בלבד, לא שם מלא): ${portalIdentity.trim()}]`
      : '';
  const forModel = trimmed + identitySuffix;
  const local = analyzeClinicalNote(trimmed);

  if (!getGeminiApiKey()) {
    return buildLocalBundle(trimmed, local);
  }

  try {
    const g = await analyzeIntakeStoryWithGemini(forModel, { followUp });
    const primaryBodyArea =
      g.primaryInjuryZoneJoint ?? local.primaryBodyArea ?? 'back_lower';

    let proposedExercises = [...g.proposedExercises];
    if (proposedExercises.length < 4) {
      const seen = new Set(proposedExercises.map((e) => e.id));
      for (const ex of local.proposedExercises) {
        if (proposedExercises.length >= 5) break;
        if (!seen.has(ex.id)) {
          proposedExercises.push(ex);
          seen.add(ex.id);
        }
      }
    }
    if (proposedExercises.length < 4) {
      proposedExercises = EXERCISE_LIBRARY.filter((ex) =>
        exerciseMatchesPrimary(ex, primaryBodyArea)
      ).slice(0, 5);
    }

    const injuryHighlightSegments: BodyArea[] = g.primaryInjuryZoneJoint
      ? [g.primaryInjuryZoneJoint]
      : isJointBodyArea(primaryBodyArea)
        ? [primaryBodyArea]
        : [];

    const rationaleLinesHe =
      g.clinicalReasoningHe.length > 0 ? g.clinicalReasoningHe : local.rationaleLinesHe;

    return {
      primaryBodyArea,
      proposedExercises,
      rationaleLinesHe,
      clinicalDiagnosis: g.clinicalDiagnosis,
      redFlags: g.redFlags,
      redFlagDetected: g.redFlagDetected,
      injuryHighlightSegments,
      secondaryClinicalBodyAreas: [...g.chainReactionZoneJoints],
      source: 'gemini',
    };
  } catch (e) {
    const bundle = buildLocalBundle(trimmed, local);
    if (e instanceof GeminiRateLimitedError) {
      return {
        ...bundle,
        intakeNoticeHe:
          e.message ||
          'מכסת הבקשות ל-Gemini מלאה כרגע. מוצג ניתוח מקומי. נסו שוב בעוד מספר דקות או בדקו מכסה ב-Google AI Studio.',
      };
    }
    return bundle;
  }
}

export default function ClinicalAiIntakeWizard({
  initialPatientName,
  lockedPortalUsername = null,
  clinicalIntakeMode: _clinicalIntakeMode = 'edit',
  onClose,
  onSave,
}: Props) {
  void _clinicalIntakeMode;
  const [step, setStep] = useState<Step>('intake');
  const [intakeName, setIntakeName] = useState(initialPatientName);
  const [intakeStory, setIntakeStory] = useState('');
  const [followUpIntake, setFollowUpIntake] = useState(false);
  const [detailedEdit, setDetailedEdit] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisBundle, setAnalysisBundle] = useState<AnalysisBundle | null>(null);

  const [primary, setPrimary] = useState<BodyArea>('back_lower');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const suggestedForPrimary = useMemo(
    () => EXERCISE_LIBRARY.filter((ex) => exerciseMatchesPrimary(ex, primary)),
    [primary]
  );

  const intakeAdvice = useMemo(() => getClinicalIntakeAdvice(primary), [primary]);

  const runAnalysisAndGoReview = async () => {
    const story = intakeStory.trim();
    if (!story) return;
    setAnalysisError(null);
    setIsAnalyzing(true);
    try {
      const bundle = await runIntakeAnalysis(story, followUpIntake, lockedPortalUsername);
      setAnalysisBundle(bundle);
      setPrimary(bundle.primaryBodyArea);
      setSelectedIds(new Set(bundle.proposedExercises.map((e) => e.id)));
      setDetailedEdit(false);
      setStep('review');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'שגיאת ניתוח';
      setAnalysisError(msg);
    } finally {
      setIsAnalyzing(false);
    }
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
    if (analysisBundle) {
      out.injuryHighlightSegments = [...analysisBundle.injuryHighlightSegments];
      out.secondaryClinicalBodyAreas = [...analysisBundle.secondaryClinicalBodyAreas];
      out.clinicalDiagnosis = analysisBundle.clinicalDiagnosis;
      if (analysisBundle.redFlagDetected) out.intakeRedFlag = true;
    }
    return Object.keys(out).length ? out : undefined;
  };

  const commitSave = (primaryBodyArea: BodyArea, ids: string[]) => {
    if (ids.length === 0) return;
    onSave(primaryBodyArea, ids, extras());
    onClose();
  };

  const approveAi = () => {
    if (!analysisBundle) return;
    const p = analysisBundle.primaryBodyArea;
    let ids = analysisBundle.proposedExercises.map((e) => e.id);
    if (ids.length === 0) {
      const fb = EXERCISE_LIBRARY.filter((ex) => exerciseMatchesPrimary(ex, p)).slice(0, 4);
      ids = fb.map((e) => e.id);
    }
    commitSave(p, ids);
  };

  const saveFromEditor = () => {
    commitSave(primary, [...selectedIds]);
  };

  const reviewLines = analysisBundle?.rationaleLinesHe ?? [];

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
              {lockedPortalUsername && (
                <div
                  className="rounded-xl border border-teal-200 bg-teal-50/90 px-3 py-2 text-[11px] text-teal-950 leading-relaxed"
                  role="status"
                >
                  <span className="font-bold">מזהה פורטל (קבוע): </span>
                  <span className="font-mono font-semibold">{lockedPortalUsername}</span>
                  <span className="text-teal-800"> — לא ניתן לשינוי לאחר שמירת המטופל.</span>
                </div>
              )}
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
              <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={followUpIntake}
                  onChange={(e) => setFollowUpIntake(e.target.checked)}
                  className="rounded border-slate-300 text-teal-600 focus:ring-teal-500/40"
                />
                אינטייק משכי (מטופל חוזר — Gemini יתמקד בשינוי, לא בדמוגרפיה)
              </label>
              {analysisError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {analysisError}
                </p>
              )}
              {!getGeminiApiKey() && (
                <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
                  מפתח Gemini לא הוגדר — הניתוח יבוצע במצב מקומי. הוסיפו VITE_GEMINI_API_KEY בקובץ{' '}
                  <code className="font-mono text-[10px]">.env</code> בשורש הפרויקט והפעילו מחדש את
                  השרת.
                </p>
              )}
            </>
          )}

          {step === 'review' && analysisBundle?.intakeNoticeHe && (
            <div
              className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950 leading-relaxed"
              role="status"
            >
              <p className="font-semibold text-amber-900 mb-1">התראת מערכת</p>
              <p>{analysisBundle.intakeNoticeHe}</p>
            </div>
          )}

          {step === 'review' && analysisBundle?.redFlagDetected && (
            <div
              className="rounded-xl border-2 border-red-600 bg-red-50 p-3 flex gap-2.5 shadow-md"
              style={{
                animation: 'clinical-intake-red-pulse 1.1s ease-in-out infinite',
              }}
              role="alert"
            >
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-sm font-black text-red-800">דגל אדום — נדרשת בדיקה קלינית</p>
                <p className="text-[11px] text-red-900 mt-1 leading-relaxed">
                  זוהו ממצאים חשודים בסיפור. יש לאמת היסטוריה, בדיקה גופנית ומתן הפניות לפי הפרוטוקול.
                </p>
                {analysisBundle.redFlags.length > 0 && (
                  <ul className="mt-2 text-[11px] text-red-950 list-disc list-inside space-y-0.5">
                    {analysisBundle.redFlags.map((f, i) => (
                      <li key={i}>{f}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          {step === 'review' && !detailedEdit && analysisBundle && (
            <>
              <div
                className="rounded-xl border border-indigo-200 bg-indigo-50/90 p-3 space-y-2 text-[11px] text-indigo-950 leading-relaxed"
                role="region"
              >
                {analysisBundle.source === 'gemini' && (
                  <p className="text-[10px] font-semibold text-indigo-700 uppercase tracking-wide">
                    ניתוח Gemini Flash
                  </p>
                )}
                {reviewLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 text-sm text-slate-800">
                <p className="text-xs font-semibold text-slate-500 mb-1">אבחון / רושם</p>
                <p className="font-bold text-slate-900">{analysisBundle.clinicalDiagnosis}</p>
                <p className="text-xs font-semibold text-slate-500 mt-2 mb-1">מוקד מוצע (תוכנית)</p>
                <p className="font-bold">{bodyAreaLabels[analysisBundle.primaryBodyArea]}</p>
                <p className="text-xs font-semibold text-slate-500 mt-2 mb-1">
                  מפרקים במפה (אדום / כתום)
                </p>
                <p className="text-xs text-slate-700">
                  <span className="font-semibold text-red-700">אדום: </span>
                  {analysisBundle.injuryHighlightSegments.length
                    ? analysisBundle.injuryHighlightSegments.map((a) => bodyAreaLabels[a]).join(', ')
                    : '—'}
                </p>
                <p className="text-xs text-slate-700 mt-0.5">
                  <span className="font-semibold text-orange-700">כתום: </span>
                  {analysisBundle.secondaryClinicalBodyAreas.length
                    ? analysisBundle.secondaryClinicalBodyAreas.map((a) => bodyAreaLabels[a]).join(', ')
                    : '—'}
                </p>
                <p className="text-xs font-semibold text-slate-500 mt-2 mb-1">תרגילים מוצעים</p>
                <ul className="list-disc list-inside text-xs space-y-0.5 text-slate-700">
                  {analysisBundle.proposedExercises.slice(0, 8).map((ex) => (
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
                disabled={isAnalyzing}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                type="button"
                onClick={() => void runAnalysisAndGoReview()}
                disabled={!intakeStory.trim() || isAnalyzing}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-45 flex items-center justify-center gap-2"
                style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
              >
                {isAnalyzing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                    מנתח…
                  </>
                ) : (
                  'המשך לסקירה'
                )}
              </button>
            </div>
          )}

          {step === 'review' && !detailedEdit && (
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep('intake');
                  setAnalysisBundle(null);
                }}
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
                disabled={!analysisBundle}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-45"
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
      <style>{`
        @keyframes clinical-intake-red-pulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.55); opacity: 1; }
          50% { box-shadow: 0 0 0 10px rgba(220, 38, 38, 0); opacity: 0.92; }
        }
      `}</style>
    </div>
  );
}
