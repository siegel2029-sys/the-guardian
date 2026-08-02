import { useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Stethoscope, Check, UserRoundPen, FileText } from 'lucide-react';
import type { BodyArea, Patient, PatientClinicalIntakeProfile, PatientExercise } from '../../../types';
import { bodyAreaLabels } from '../../../types';
import { getCachedActiveExercises } from '../../../services/exerciseCatalogService';
import { exerciseMatchesPrimary } from '../../../utils/clinicalBodyArea';
import {
  resolveCoreLegacyIntakeSummaryText,
} from '../../../utils/clinicalIntakeProfileMigration';
import { resolvePatientClinicalIntakeProfile } from '../../../utils/clinicalIntakeProfileDisplay';
import { getClinicalIntakeProfileValidation } from '../../../utils/clinicalIntakeProfileValidation';
import {
  medicalHistoryToProfileMetadata,
  parseClinicalIntakeProfileFromStory,
} from '../../../utils/clinicalIntakeTemplate';
import { getPatientDisplayName } from '../../../utils/patientDisplayName';
import type { ClinicalProfileSaveExtras } from '../ClinicalAiIntakeWizard';
import StructuredClinicalIntakeTabs from './StructuredClinicalIntakeTabs';
import { emptyClinicalProfile } from './intakeReviewUtils';
import { normalizeClinicalIntakeProfileForStorage } from '../../../utils/clinicalIntakeProfilePersist';
import { devError } from '../../../lib/safeLog';

type Props = {
  patient: Patient;
  planExercises: PatientExercise[];
  onClose: () => void;
  onSave: (
    primaryBodyArea: BodyArea,
    libraryExerciseIds: string[],
    extras?: ClinicalProfileSaveExtras
  ) => void | Promise<void>;
  /** פתיחת אשף אינטייק מלא (טקסט חופשי + AI) */
  onOpenFullWizard?: () => void;
};

function mergeCompletionProfile(patient: Patient) {
  const fromDisplay = resolvePatientClinicalIntakeProfile(patient);
  const story = resolveCoreLegacyIntakeSummaryText(patient);
  const fromStory = story ? parseClinicalIntakeProfileFromStory(story) : undefined;
  return {
    ...emptyClinicalProfile(),
    ...fromStory,
    ...fromDisplay,
    medical_history: {
      ...emptyClinicalProfile().medical_history,
      ...fromStory?.medical_history,
      ...fromDisplay?.medical_history,
    },
  };
}

function libraryIdsFromPlanExercises(exercises: PatientExercise[]): string[] {
  const libIds = getCachedActiveExercises().map((e) => e.id);
  const found: string[] = [];
  for (const pe of exercises) {
    for (const lid of libIds) {
      if (pe.id.includes(lid)) found.push(lid);
    }
  }
  return [...new Set(found)];
}

export default function ClinicalIntakeCompletionModal({
  patient,
  planExercises,
  onClose,
  onSave,
  onOpenFullWizard,
}: Props) {
  const [profile, setProfile] = useState<PatientClinicalIntakeProfile>(() =>
    mergeCompletionProfile(patient)
  );
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const validation = useMemo(() => getClinicalIntakeProfileValidation(profile), [profile]);

  const diagnosisLabel =
    patient.diagnosis?.trim() ||
    patient.geminiClinicalNarrative?.split('\n')[0]?.trim() ||
    `מוקד: ${bodyAreaLabels[patient.primaryBodyArea]}`;

  const handleSave = useCallback(async () => {
    if (!validation.isComplete || saveBusy) return;

    setSaveError(null);
    setSaveBusy(true);

    const primary = patient.primaryBodyArea;
    let libIds = libraryIdsFromPlanExercises(planExercises);
    if (libIds.length === 0) {
      libIds = getCachedActiveExercises()
        .filter((ex) => exerciseMatchesPrimary(ex, primary))
        .slice(0, 4)
        .map((e) => e.id);
    }

    const normalizedProfile = normalizeClinicalIntakeProfileForStorage(profile);
    if (!normalizedProfile) {
      const msg = '[ClinicalIntakeCompletion] אין נתוני פרופיל לשמירה לאחר נרמול';
      devError(msg);
      setSaveError('לא ניתן לשמור — נתוני האינטייק ריקים או לא תקינים.');
      setSaveBusy(false);
      return;
    }

    const story = resolveCoreLegacyIntakeSummaryText(patient);
    const extras: ClinicalProfileSaveExtras = {
      displayName: getPatientDisplayName(patient),
      ...(story ? { intakeStory: story } : {}),
      clinicalDiagnosis: patient.diagnosis,
      clinicalIntakeProfile: normalizedProfile,
      medicalProfileMetadata: medicalHistoryToProfileMetadata(normalizedProfile.medical_history),
      injuryHighlightSegments: [...(patient.injuryHighlightSegments ?? [])],
      secondaryClinicalBodyAreas: [...(patient.secondaryClinicalBodyAreas ?? [])],
      ...(patient.geminiClinicalNarrative
        ? { geminiClinicalNarrative: patient.geminiClinicalNarrative }
        : {}),
    };

    try {
      await onSave(primary, libIds, extras);
      onClose();
    } catch (e) {
      const err = e as { message?: string; code?: string; details?: string; hint?: string; httpStatus?: number };
      const parts = [
        err?.message,
        err?.code ? `code=${err.code}` : '',
        err?.details ? `details=${err.details}` : '',
        err?.hint ? `hint=${err.hint}` : '',
        err?.httpStatus != null ? `http=${err.httpStatus}` : '',
      ].filter(Boolean);
      const msg = parts.join(' · ') || (e instanceof Error ? e.message : String(e));
      console.error('[ClinicalIntakeCompletion] שמירה נכשלה — Supabase/שרת:', e);
      setSaveError(msg || 'שמירה נכשלה. בדקו את הקונסול לפרטים.');
    } finally {
      setSaveBusy(false);
    }
  }, [
    validation.isComplete,
    saveBusy,
    patient,
    planExercises,
    profile,
    onSave,
    onClose,
  ]);

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5"
      style={{ background: 'rgba(15, 23, 42, 0.45)' }}
      dir="rtl"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-5xl h-[min(96dvh,920px)] overflow-hidden flex flex-col rounded-2xl bg-white shadow-2xl border border-purple-200"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="intake-completion-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-purple-100 shrink-0 bg-gradient-to-l from-purple-50/80 to-white">
          <h2
            id="intake-completion-title"
            className="text-base font-bold text-slate-800 flex items-center gap-2"
          >
            <Stethoscope className="w-5 h-5 text-purple-600" aria-hidden />
            השלמת אינטייק קליני
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

        <div className="overflow-y-auto flex-1 p-5 sm:p-6 space-y-4">
          <div
            className="rounded-xl border border-purple-300 bg-purple-50/90 px-4 py-3 flex items-start gap-2.5"
            role="status"
          >
            <UserRoundPen className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" aria-hidden />
            <div>
              <p className="text-sm font-bold text-purple-950">
                {validation.isComplete
                  ? 'כל המדדים מולאו — ניתן להשלים את האינטייק'
                  : `${validation.missingCount} ${
                      validation.missingCount === 1 ? 'פריט חסר' : 'פריטים חסרים'
                    } לאקטיבציה`}
              </p>
              <p className="text-xs text-purple-800 mt-0.5 leading-relaxed">
                השלימו את השדות המסומנים בסגול. לאחר מילוי הם יסומנו בירוק. הנתונים למטה נשלפו
                מהאינטייק הקיים — ערכו ישירות בטאבים.
              </p>
            </div>
          </div>

          <header className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm">
            <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">
              מטופל / אבחון
            </p>
            <p className="text-sm font-bold text-slate-900 mt-0.5">{getPatientDisplayName(patient)}</p>
            <p className="text-sm text-slate-700 mt-1 leading-snug">{diagnosisLabel}</p>
          </header>

          <StructuredClinicalIntakeTabs
            profile={profile}
            onProfileChange={setProfile}
            validationHighlight
            syncParentImmediately
            focusFirstMissingTab
          />

          {onOpenFullWizard && (
            <button
              type="button"
              onClick={onOpenFullWizard}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <FileText className="w-4 h-4 shrink-0" aria-hidden />
              עריכת סיפור אינטייק מלא (טקסט חופשי + ניתוח AI)
            </button>
          )}
        </div>

        {saveError && (
          <p
            className="px-5 py-2 text-xs text-red-700 bg-red-50 border-t border-red-100 shrink-0"
            role="alert"
          >
            {saveError}
          </p>
        )}

        <div className="px-5 py-4 border-t border-purple-100 flex gap-2 shrink-0 bg-white">
          <button
            type="button"
            onClick={onClose}
            disabled={saveBusy}
            className="flex-none min-w-[7rem] py-2.5 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium disabled:opacity-50"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!validation.isComplete || saveBusy}
            className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-45 disabled:cursor-not-allowed"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)' }}
            title={
              validation.isComplete
                ? undefined
                : `נותרו ${validation.missingCount} שדות חסרים`
            }
          >
            <Check className="w-4 h-4" aria-hidden />
            שמירה והשלמת אינטייק
          </button>
        </div>
      </div>
    </div>
  );

  if (typeof document === 'undefined') return null;
  return createPortal(modal, document.body);
}
