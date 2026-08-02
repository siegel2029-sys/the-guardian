import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Stethoscope,
  Check,
  AlertTriangle,
  Loader2,
} from 'lucide-react';
import { getCachedActiveExercises } from '../../services/exerciseCatalogService';
import { useExerciseCatalog } from '../../hooks/useExerciseCatalog';
import type {
  BodyArea,
  Exercise,
  InitialClinicalProfileExtras,
  PatientClinicalIntakeProfile,
  PatientMedicalProfileMetadata,
  ProtocolTrackingState,
  TreatmentProtocolWeek,
} from '../../types';
import { bodyAreaLabels } from '../../types';
import { exerciseMatchesPrimary } from '../../utils/clinicalBodyArea';
import { getClinicalIntakeAdvice } from '../../ai/clinicalIntakeAdvisor';
import IntakeActivationReviewPanel from './clinical/IntakeActivationReviewPanel';
import {
  emptyClinicalProfile,
  splitClinicalListText,
} from './clinical/intakeReviewUtils';
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
import { dataUpdateInputClassName } from './clinical/patientDataUpdateHighlight';
import MissingFieldHint from './clinical/MissingFieldHint';
import {
  CLINICAL_INTAKE_TEMPLATE_HE,
  medicalHistoryToProfileMetadata,
  parseClinicalIntakeProfileFromStory,
} from '../../utils/clinicalIntakeTemplate';
import {
  buildCondensedIntakeSnapshot,
  formatCondensedIntakeSnapshotAsNarrative,
} from '../../utils/clinicalIntakeSnapshotCondenser';
import {
  clinicalInsightsToSavePayload,
  formatClinicalIntakeInsightsNarrative,
} from '../../utils/clinicalIntakeInsightsDisplay';
import {
  extractNarrativeCaseStory,
  pruneAiInsightLists,
} from '../../utils/clinicalIntakeNarrativeExtract';

export type ClinicalProfileSaveExtras = InitialClinicalProfileExtras;

const ALL_AREAS = Object.keys(bodyAreaLabels) as BodyArea[];

type Props = {
  initialPatientName: string;
  /** טקסט אינטייק קיים (עריכה); ברירת מחדל — תבנית מובנית ביצירה */
  initialIntakeStory?: string;
  /** מזהה פורטל קבוע (רמזים UI) — נשלח כ־nameTokens לניקוי, לא בטקסט הפרומפט */
  lockedPortalUsername?: string | null;
  /** יצירה מסרגל צד vs עריכה מסקירת מטפל */
  clinicalIntakeMode?: 'create' | 'edit';
  /** מסמן שדות ריקים באינטייק כשחסר `initialIntakeArchive` */
  highlightIncompleteFields?: boolean;
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
  differentialDiagnosis: string[];
  precautionsHe: string[];
  recommendedTestsHe: string[];
  redFlags: string[];
  redFlagDetected: boolean;
  injuryHighlightSegments: BodyArea[];
  secondaryClinicalBodyAreas: BodyArea[];
  source: 'gemini' | 'local';
  /** הודעה למטפל (למשל מכסת Gemini מלאה) */
  intakeNoticeHe?: string;
  clinicalIntakeProfile?: PatientClinicalIntakeProfile;
  medicalProfileMetadata?: PatientMedicalProfileMetadata;
  treatmentProtocol?: TreatmentProtocolWeek[] | string;
  prognosisHypothesis?: string;
  protocolTrackingState?: ProtocolTrackingState;
};

function buildReviewClinicalContext(
  primary: BodyArea,
  bundle: {
    differentialDiagnosis?: string[];
    rationaleLinesHe: string[];
    source: 'gemini' | 'local';
  }
): { differentialDiagnosis: string[]; precautionsHe: string[]; recommendedTestsHe: string[] } {
  const advice = getClinicalIntakeAdvice(primary);
  const differentialDiagnosis =
    bundle.differentialDiagnosis?.length
      ? bundle.differentialDiagnosis
      : splitClinicalListText(advice.differentialHe);
  const precautionsHe =
    bundle.rationaleLinesHe.length > 0
      ? bundle.rationaleLinesHe
      : [advice.chainWarningHe];
  const recommendedTestsHe = splitClinicalListText(advice.furtherTestsHe);
  return { differentialDiagnosis, precautionsHe, recommendedTestsHe };
}

function mergeClinicalIntakeProfile(
  fromGemini: PatientClinicalIntakeProfile | null | undefined,
  fromStory: PatientClinicalIntakeProfile | undefined
): PatientClinicalIntakeProfile | undefined {
  const merged: PatientClinicalIntakeProfile = {
    ...(fromStory ?? {}),
    ...(fromGemini ?? {}),
    medical_history: {
      ...(fromStory?.medical_history ?? {}),
      ...(fromGemini?.medical_history ?? {}),
    },
  };
  const hasContent =
    (merged.ranges?.length ?? 0) > 0 ||
    merged.muscle_strength?.trim() ||
    (merged.special_tests?.length ?? 0) > 0 ||
    merged.medical_history?.backgroundDiseases?.trim() ||
    merged.medical_history?.chronicMedications?.trim() ||
    (merged.goals?.length ?? 0) > 0;
  return hasContent ? merged : undefined;
}

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
  const clinicalIntakeProfile = parseClinicalIntakeProfileFromStory(story);
  const rationaleLinesHe = local.rationaleLinesHe;
  const clinicalContext = buildReviewClinicalContext(primaryBodyArea, {
    rationaleLinesHe,
    source: 'local',
  });
  return {
    primaryBodyArea,
    proposedExercises: local.proposedExercises,
    rationaleLinesHe,
    clinicalDiagnosis: `מוקד טיפול: ${bodyAreaLabels[primaryBodyArea]}`,
    ...clinicalContext,
    redFlags,
    redFlagDetected,
    injuryHighlightSegments,
    secondaryClinicalBodyAreas,
    source: 'local',
    clinicalIntakeProfile,
    medicalProfileMetadata: medicalHistoryToProfileMetadata(clinicalIntakeProfile?.medical_history),
  };
}

async function runIntakeAnalysis(
  story: string,
  followUp: boolean,
  opts?: { portalUsername?: string | null; patientName?: string | null }
): Promise<AnalysisBundle> {
  const trimmed = story.trim();
  const forModel = trimmed;
  const local = analyzeClinicalNote(trimmed);

  if (!getGeminiApiKey()) {
    return buildLocalBundle(trimmed, local);
  }

  try {
    const g = await analyzeIntakeStoryWithGemini(forModel, {
      followUp,
      patientName: opts?.patientName,
      portalUsername: opts?.portalUsername,
    });
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
      proposedExercises = getCachedActiveExercises()
        .filter((ex) => exerciseMatchesPrimary(ex, primaryBodyArea))
        .slice(0, 5);
    }

    const injuryHighlightSegments: BodyArea[] = g.primaryInjuryZoneJoint
      ? [g.primaryInjuryZoneJoint]
      : isJointBodyArea(primaryBodyArea)
        ? [primaryBodyArea]
        : [];

    const rationaleLinesHe =
      g.clinicalReasoningHe.length > 0 ? g.clinicalReasoningHe : local.rationaleLinesHe;

    const clinicalIntakeProfile = mergeClinicalIntakeProfile(
      g.clinicalIntakeProfile,
      parseClinicalIntakeProfileFromStory(trimmed)
    );

    const clinicalContext = buildReviewClinicalContext(primaryBodyArea, {
      differentialDiagnosis: g.differentialDiagnosis,
      rationaleLinesHe,
      source: 'gemini',
    });

    return {
      primaryBodyArea,
      proposedExercises,
      rationaleLinesHe,
      clinicalDiagnosis: g.clinicalDiagnosis,
      ...clinicalContext,
      redFlags: g.redFlags,
      redFlagDetected: g.redFlagDetected,
      injuryHighlightSegments,
      secondaryClinicalBodyAreas: [...g.chainReactionZoneJoints],
      source: 'gemini',
      clinicalIntakeProfile,
      medicalProfileMetadata: medicalHistoryToProfileMetadata(
        clinicalIntakeProfile?.medical_history ?? g.medicalProfileMetadata ?? undefined
      ),
      treatmentProtocol: g.treatmentProtocol,
      prognosisHypothesis: g.prognosisHypothesis,
      protocolTrackingState: g.protocolTrackingState,
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
  initialIntakeStory,
  lockedPortalUsername = null,
  clinicalIntakeMode = 'edit',
  highlightIncompleteFields = false,
  onClose,
  onSave,
}: Props) {
  const { activeExercises: exerciseLibrary } = useExerciseCatalog();
  const defaultStory =
    initialIntakeStory?.trim() ||
    (clinicalIntakeMode === 'create' ? CLINICAL_INTAKE_TEMPLATE_HE : '');
  const [step, setStep] = useState<Step>('intake');
  const [intakeName, setIntakeName] = useState(initialPatientName);
  const [intakeStory, setIntakeStory] = useState(defaultStory);
  const [followUpIntake, setFollowUpIntake] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisBundle, setAnalysisBundle] = useState<AnalysisBundle | null>(null);

  const [primary, setPrimary] = useState<BodyArea>('back_lower');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [reviewProfile, setReviewProfile] = useState<PatientClinicalIntakeProfile>(() =>
    emptyClinicalProfile()
  );
  const [differentialDiagnosis, setDifferentialDiagnosis] = useState<string[]>([]);
  const [precautionsHe, setPrecautionsHe] = useState<string[]>([]);
  const [recommendedTestsHe, setRecommendedTestsHe] = useState<string[]>([]);
  const [clinicalConclusionsHe, setClinicalConclusionsHe] = useState<string[]>([]);
  const [reviewClinicalDiagnosis, setReviewClinicalDiagnosis] = useState('');
  const [intakeVasScore, setIntakeVasScore] = useState<number | null>(null);
  const [injuryHighlightSegments, setInjuryHighlightSegments] = useState<BodyArea[]>([]);
  const [secondaryClinicalBodyAreas, setSecondaryClinicalBodyAreas] = useState<BodyArea[]>([]);

  const suggestedForPrimary = useMemo(
    () =>
      exerciseLibrary.filter((ex) => exerciseMatchesPrimary(ex, primary)),
    [primary, exerciseLibrary]
  );

  const reviewExercises = useMemo(() => {
    const seen = new Set<string>();
    const out: Exercise[] = [];
    for (const ex of analysisBundle?.proposedExercises ?? []) {
      if (!seen.has(ex.id)) {
        seen.add(ex.id);
        out.push(ex);
      }
    }
    for (const ex of suggestedForPrimary) {
      if (!seen.has(ex.id)) {
        seen.add(ex.id);
        out.push(ex);
      }
    }
    return out;
  }, [analysisBundle?.proposedExercises, suggestedForPrimary]);

  const highlightIntakeFields = highlightIncompleteFields && step === 'intake';
  const intakeNameEmpty = intakeName.trim().length === 0;
  const intakeStoryEmpty = intakeStory.trim().length === 0;

  const runAnalysisAndGoReview = async () => {
    const fullStory = intakeStory.trim();
    if (!fullStory) return;
    setAnalysisError(null);
    setIsAnalyzing(true);
    try {
      const bundle = await runIntakeAnalysis(fullStory, followUpIntake, {
        portalUsername: lockedPortalUsername,
        patientName: intakeName.trim() || initialPatientName,
      });
      const narrativeOnly = extractNarrativeCaseStory(fullStory) || fullStory;
      const parsedProfile = mergeClinicalIntakeProfile(
        bundle.clinicalIntakeProfile,
        parseClinicalIntakeProfileFromStory(fullStory)
      );
      const prunedAi = pruneAiInsightLists(
        {
          differentialDiagnosis: [...bundle.differentialDiagnosis],
          clinicalConclusionsHe: [...bundle.rationaleLinesHe],
          precautionsHe: [...bundle.precautionsHe],
          recommendedTestsHe: [...bundle.recommendedTestsHe],
          redFlags: [...bundle.redFlags],
        },
        { narrative: narrativeOnly, profile: parsedProfile }
      );

      setAnalysisBundle(bundle);
      setPrimary(bundle.primaryBodyArea);
      setSelectedIds(new Set(bundle.proposedExercises.map((e) => e.id)));
      setReviewProfile({
        ...emptyClinicalProfile(),
        ...(parsedProfile ?? {}),
        medical_history: {
          ...emptyClinicalProfile().medical_history,
          ...parsedProfile?.medical_history,
        },
      });
      setIntakeStory(narrativeOnly);
      setDifferentialDiagnosis(prunedAi.differentialDiagnosis);
      setPrecautionsHe(prunedAi.precautionsHe);
      setRecommendedTestsHe(prunedAi.recommendedTestsHe);
      setClinicalConclusionsHe(prunedAi.clinicalConclusionsHe);
      setReviewClinicalDiagnosis(bundle.clinicalDiagnosis);
      setIntakeVasScore(null);
      setInjuryHighlightSegments([...bundle.injuryHighlightSegments]);
      setSecondaryClinicalBodyAreas([...bundle.secondaryClinicalBodyAreas]);
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

  const clearSelection = () => setSelectedIds(new Set());

  const extras = (): ClinicalProfileSaveExtras | undefined => {
    const name = intakeName.trim();
    /** Narrative-only — objective metrics live in clinicalIntakeProfile */
    const caseStory = extractNarrativeCaseStory(intakeStory.trim()) || intakeStory.trim();
    const out: ClinicalProfileSaveExtras = {};
    if (name) out.displayName = name;
    if (caseStory) out.intakeStory = caseStory;
    /** Maps to payload `intakeVasScore` / `vas_score` */
    if (intakeVasScore != null && Number.isFinite(intakeVasScore)) {
      out.intakeVasScore = Math.min(10, Math.max(0, Math.round(intakeVasScore)));
    }
    if (analysisBundle) {
      out.injuryHighlightSegments = [...injuryHighlightSegments];
      out.secondaryClinicalBodyAreas = [...secondaryClinicalBodyAreas];
      out.clinicalDiagnosis = reviewClinicalDiagnosis.trim() || analysisBundle.clinicalDiagnosis;
      const storyBrief = buildCondensedIntakeSnapshot({
        profile: { ...reviewProfile },
        diagnosis: out.clinicalDiagnosis,
        clinicalDiagnosis: out.clinicalDiagnosis,
        intakeStory: caseStory,
        intakeRedFlag: analysisBundle.redFlagDetected,
        primaryBodyArea: primary,
      }).sections.find((s) => s.id === 'story_brief')?.text;

      const clinicalConclusions = clinicalConclusionsHe.filter((l) => l.trim());
      const redFromBundle = analysisBundle.redFlags.filter((f) => f.trim());

      /** Structured AI segments — not merged into case story blob */
      out.clinicalReasoningHe = clinicalConclusions;
      out.clinicalIntakeAiInsights = clinicalInsightsToSavePayload({
        differentialDiagnosis: differentialDiagnosis.filter((d) => d.trim()),
        precautionsHe: precautionsHe.filter((p) => p.trim()),
        recommendedTestsHe: recommendedTestsHe.filter((t) => t.trim()),
        redFlags: redFromBundle,
        clinicalConclusions,
      });

      out.geminiClinicalNarrative = formatClinicalIntakeInsightsNarrative({
        diagnosis: out.clinicalDiagnosis,
        differentialDiagnosis: differentialDiagnosis.filter((d) => d.trim()),
        clinicalConclusions,
        precautions: precautionsHe.filter((p) => p.trim()),
        redFlags: redFromBundle,
        recommendedTests: recommendedTestsHe.filter((t) => t.trim()),
        storySummary: storyBrief,
      });

      // גיבוי תמצית קצרה לשדות legacy
      if (!out.geminiClinicalNarrative.trim()) {
        const condensed = buildCondensedIntakeSnapshot({
          profile: { ...reviewProfile },
          diagnosis: analysisBundle.clinicalDiagnosis,
          clinicalDiagnosis: analysisBundle.clinicalDiagnosis,
          intakeStory: caseStory,
          intakeRedFlag: analysisBundle.redFlagDetected,
          primaryBodyArea: primary,
        });
        if (redFromBundle.length > 0) {
          const redSection = condensed.sections.find((s) => s.id === 'neurological_red_flags');
          const mergedRed = redSection
            ? `${redSection.text}; ${redFromBundle.join('; ')}`
            : redFromBundle.join('; ');
          const idx = condensed.sections.findIndex((s) => s.id === 'neurological_red_flags');
          if (idx >= 0) {
            condensed.sections[idx] = { ...condensed.sections[idx], text: mergedRed };
          } else {
            condensed.sections.push({
              id: 'neurological_red_flags',
              titleHe: 'דגלים אדומים',
              text: mergedRed,
              emphasis: 'danger',
            });
          }
        }
        out.geminiClinicalNarrative = formatCondensedIntakeSnapshotAsNarrative(condensed);
      }
      if (analysisBundle.redFlagDetected) out.intakeRedFlag = true;
      out.clinicalIntakeProfile = { ...reviewProfile };
      out.medicalProfileMetadata = medicalHistoryToProfileMetadata(
        reviewProfile.medical_history ?? analysisBundle.medicalProfileMetadata
      );
      if (
        analysisBundle.treatmentProtocol !== undefined &&
        (Array.isArray(analysisBundle.treatmentProtocol)
          ? analysisBundle.treatmentProtocol.length > 0
          : analysisBundle.treatmentProtocol.trim())
      ) {
        out.treatmentProtocol = analysisBundle.treatmentProtocol;
      }
      if (analysisBundle.prognosisHypothesis?.trim()) {
        out.prognosisHypothesis = analysisBundle.prognosisHypothesis.trim();
      }
      if (analysisBundle.protocolTrackingState?.length) {
        out.protocolTrackingState = analysisBundle.protocolTrackingState;
      }
    }
    if (!out.clinicalIntakeProfile) {
      const parsed = parseClinicalIntakeProfileFromStory(caseStory);
      if (parsed) {
        out.clinicalIntakeProfile = parsed;
        out.medicalProfileMetadata =
          out.medicalProfileMetadata ?? medicalHistoryToProfileMetadata(parsed.medical_history);
      }
    }
    return Object.keys(out).length ? out : undefined;
  };

  const commitSave = (primaryBodyArea: BodyArea, ids: string[]) => {
    if (ids.length === 0) return;
    onSave(primaryBodyArea, ids, extras());
    onClose();
  };

  const confirmActivation = () => {
    if (!analysisBundle) return;
    let ids = [...selectedIds];
    if (ids.length === 0) {
      ids = analysisBundle.proposedExercises.map((e) => e.id);
    }
    if (ids.length === 0) {
      ids = exerciseLibrary
        .filter((ex) => exerciseMatchesPrimary(ex, primary))
        .slice(0, 4)
        .map((e) => e.id);
    }
    commitSave(primary, ids);
  };

  const isIntakeStep = step === 'intake';
  const spaciousIntakeLayout = isIntakeStep || step === 'review';

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5"
      style={{ background: 'rgba(15, 23, 42, 0.45)' }}
      dir="rtl"
      onClick={onClose}
      role="presentation"
    >
      <div
        className={`w-full overflow-hidden flex flex-col rounded-2xl bg-white shadow-2xl border border-teal-100 ${
          spaciousIntakeLayout
            ? 'max-w-3xl h-[min(96dvh,920px)]'
            : 'max-w-lg md:max-w-3xl max-h-[90vh] md:h-[min(96dvh,920px)]'
        }`}
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

        <div
          className={`overflow-y-auto flex-1 ${
            spaciousIntakeLayout ? 'p-5 sm:p-6 flex flex-col' : 'p-5 space-y-4'
          }`}
        >
          {step === 'intake' && (
            <div className={spaciousIntakeLayout ? 'flex flex-col flex-1 min-h-0 gap-4' : 'space-y-4'}>
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
                  className={dataUpdateInputClassName(
                    highlightIntakeFields,
                    intakeNameEmpty,
                    'w-full rounded-xl border px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500'
                  )}
                />
                <MissingFieldHint show={highlightIntakeFields && intakeNameEmpty} />
              </div>
              <div className={spaciousIntakeLayout ? 'flex flex-col flex-1 min-h-0' : ''}>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                  סיפור / הערכה חופשית
                </label>
                <textarea
                  value={intakeStory}
                  onChange={(e) => setIntakeStory(e.target.value)}
                  placeholder="מלאו את תבנית האינטייק הקליני…"
                  rows={spaciousIntakeLayout ? 25 : 12}
                  className={dataUpdateInputClassName(
                    highlightIntakeFields,
                    intakeStoryEmpty,
                    `w-full rounded-xl border px-4 py-3 text-sm text-slate-800 resize-y placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 leading-relaxed ${
                      spaciousIntakeLayout
                        ? 'flex-1 min-h-[65vh] text-[15px] font-normal tracking-normal'
                        : 'min-h-[200px]'
                    }`
                  )}
                />
                <MissingFieldHint show={highlightIntakeFields && intakeStoryEmpty} />
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
                  Gemini דרך השרת לא זמין — הניתוח יבוצע במצב מקומי. הגדירו{' '}
                  <code className="font-mono text-[10px]">VITE_SUPABASE_URL</code> ו־
                  <code className="font-mono text-[10px]">VITE_SUPABASE_ANON_KEY</code> ב־
                  <code className="font-mono text-[10px]">.env</code>, פרסמו{' '}
                  <code className="font-mono text-[10px]">gemini-proxy</code> והגדירו סוד{' '}
                  <code className="font-mono text-[10px]">GEMINI_API_KEY</code> ב־Supabase.
                </p>
              )}
            </div>
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

          {step === 'review' && analysisBundle && (
            <IntakeActivationReviewPanel
              clinicalDiagnosis={reviewClinicalDiagnosis || analysisBundle.clinicalDiagnosis}
              onClinicalDiagnosisChange={setReviewClinicalDiagnosis}
              caseStory={intakeStory}
              onCaseStoryChange={setIntakeStory}
              vasScore={intakeVasScore}
              onVasScoreChange={setIntakeVasScore}
              clinicalConclusionsHe={clinicalConclusionsHe}
              onClinicalConclusionsChange={setClinicalConclusionsHe}
              differentialDiagnosis={differentialDiagnosis}
              onDifferentialChange={setDifferentialDiagnosis}
              precautionsHe={precautionsHe}
              onPrecautionsChange={setPrecautionsHe}
              recommendedTestsHe={recommendedTestsHe}
              onRecommendedTestsChange={setRecommendedTestsHe}
              profile={reviewProfile}
              onProfileChange={setReviewProfile}
              primaryBodyArea={primary}
              onPrimaryBodyAreaChange={(area) => {
                setPrimary(area);
              }}
              injuryHighlightSegments={injuryHighlightSegments}
              onInjuryHighlightChange={setInjuryHighlightSegments}
              secondaryClinicalBodyAreas={secondaryClinicalBodyAreas}
              onSecondaryClinicalChange={setSecondaryClinicalBodyAreas}
              allBodyAreas={ALL_AREAS}
              suggestedExercises={reviewExercises}
              selectedExerciseIds={selectedIds}
              onToggleExercise={toggleLibId}
              onSelectAllExercises={() =>
                setSelectedIds(new Set(reviewExercises.map((e) => e.id)))
              }
              onClearExercises={clearSelection}
              sourceGemini={analysisBundle.source === 'gemini'}
            />
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

          {step === 'review' && (
            <div className="flex flex-col sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep('intake');
                  setAnalysisBundle(null);
                }}
                className="sm:flex-none sm:min-w-[7rem] py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium"
              >
                חזרה
              </button>
              <button
                type="button"
                onClick={confirmActivation}
                disabled={!analysisBundle}
                className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-45"
                style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
              >
                <Check className="w-4 h-4" aria-hidden />
                אישור והפעלה
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

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
