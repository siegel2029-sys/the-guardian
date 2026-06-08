import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Save, Sparkles } from 'lucide-react';
import type { Patient, PatientClinicalIntakeProfile } from '../../../types';
import {
  applyLegacyNormalizationIfNeeded,
  buildPatientPatchFromEditableIntakeFields,
  type ClinicalIntakeEditableFields,
} from '../../../utils/clinicalIntakeEditableFields';
import { loadLatestIntakeFields } from '../../../utils/clinicalIntakeVersions';
import { MedicalIntakeSectionedReport } from './MedicalIntakeDashboard';
import { useDebouncedCallback } from './useDebouncedCallback';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  patient: Patient;
  compact?: boolean;
  version?: 'latest';
  onSave: (patch: ReturnType<typeof buildPatientPatchFromEditableIntakeFields>) => void | Promise<void>;
  showSaveButton?: boolean;
  autoSave?: boolean;
  onRunComparativeAnalysis?: () => void | Promise<void>;
  comparativeBusy?: boolean;
  showComparativeCta?: boolean;
  className?: string;
};

const AUTO_SAVE_DELAY_MS = 1400;

function loadFieldsForVersion(patient: Patient): ClinicalIntakeEditableFields {
  return loadLatestIntakeFields(patient);
}

export default function ClinicalIntakeEditableInsightsPanel({
  patient,
  compact = false,
  version = 'latest',
  onSave,
  showSaveButton = true,
  autoSave = true,
  onRunComparativeAnalysis,
  comparativeBusy = false,
  showComparativeCta = false,
  className = '',
}: Props) {
  const [fields, setFields] = useState<ClinicalIntakeEditableFields>(() =>
    loadFieldsForVersion(patient)
  );
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [legacyRestored, setLegacyRestored] = useState(false);
  const [legacyFilledFields, setLegacyFilledFields] = useState<string[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const fieldsRef = useRef(fields);
  const isDirtyRef = useRef(false);
  const mountedRef = useRef(false);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    fieldsRef.current = fields;
  }, [fields]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const persistFields = useCallback(
    async (
      snapshot: ClinicalIntakeEditableFields,
      opts?: { silent?: boolean; reason?: 'manual' | 'auto' | 'legacy_restore' }
    ) => {
      if (!opts?.silent) setSaveStatus('saving');
      try {
        const patch = buildPatientPatchFromEditableIntakeFields(snapshot);
        await onSaveRef.current(patch);
        isDirtyRef.current = false;
        setIsDirty(false);
        setSaveStatus('saved');
        if (opts?.reason === 'legacy_restore') {
          setLegacyRestored(false);
        }
        window.setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2400);
      } catch {
        setSaveStatus('error');
        window.setTimeout(() => setSaveStatus('idle'), 3000);
      }
    },
    []
  );

  useEffect(() => {
    mountedRef.current = false;
    const loaded = loadFieldsForVersion(patient);
    const { fields: restored, restoredFromLegacy, filledProfileFields } =
      applyLegacyNormalizationIfNeeded(patient, loaded);
    setFields(restored);
    setLegacyRestored(restoredFromLegacy);
    setLegacyFilledFields(filledProfileFields);
    isDirtyRef.current = false;
    setIsDirty(false);
    setSaveStatus('idle');

    if (restoredFromLegacy) {
      void persistFields(restored, { silent: true, reason: 'legacy_restore' });
    }

    const t = window.setTimeout(() => {
      mountedRef.current = true;
    }, 0);
    return () => window.clearTimeout(t);
  }, [patient.id, version, persistFields]);

  const handleSave = useCallback(
    async (opts?: { silent?: boolean }) => {
      await persistFields(fieldsRef.current, { silent: opts?.silent, reason: 'manual' });
    },
    [persistFields]
  );

  const debouncedAutoSave = useDebouncedCallback(() => {
    if (!autoSave || !mountedRef.current || !isDirtyRef.current) return;
    void persistFields(fieldsRef.current, { silent: true, reason: 'auto' });
  }, AUTO_SAVE_DELAY_MS);

  const patchFields = useCallback(
    (partial: Partial<ClinicalIntakeEditableFields>) => {
      isDirtyRef.current = true;
      setIsDirty(true);
      setFields((prev) => {
        const next = { ...prev, ...partial };
        fieldsRef.current = next;
        debouncedAutoSave();
        return next;
      });
    },
    [debouncedAutoSave]
  );

  const handleBlurSave = useCallback(() => {
    if (!autoSave || !isDirtyRef.current) return;
    void persistFields(fieldsRef.current, { silent: true, reason: 'auto' });
  }, [autoSave, persistFields]);

  const saveIndicator = (() => {
    if (saveStatus === 'saving') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700">
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden />
          שומר…
        </span>
      );
    }
    if (saveStatus === 'saved') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
          נשמר
        </span>
      );
    }
    if (saveStatus === 'error') {
      return (
        <span className="text-xs font-semibold text-red-700" role="alert">
          שגיאת שמירה — נסו שוב
        </span>
      );
    }
    if (isDirty && autoSave) {
      return <span className="text-xs text-slate-500">שינויים שלא נשמרו</span>;
    }
    return null;
  })();

  return (
    <div className={`space-y-4 ${className}`} dir="rtl" onBlur={handleBlurSave}>
      {showComparativeCta && onRunComparativeAnalysis && (
        <div className="rounded-xl border border-violet-200 bg-violet-50/50 px-4 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-violet-950 leading-relaxed">
            עדיין לא בוצע ניתוח השוואתי — ניתן לעדכן ידנית או להריץ AI להשוואה מול הקבלה הראשונית.
          </p>
          <button
            type="button"
            onClick={() => void onRunComparativeAnalysis()}
            disabled={comparativeBusy}
            className="inline-flex items-center gap-2 shrink-0 px-4 py-2 rounded-lg text-xs font-bold text-white bg-violet-700 hover:bg-violet-800 disabled:opacity-40"
          >
            {comparativeBusy ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="w-3.5 h-3.5" aria-hidden />
            )}
            ניתוח השוואתי AI
          </button>
        </div>
      )}

      {legacyRestored && (
        <div
          className="rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs text-amber-950 leading-relaxed flex items-start gap-2"
          role="status"
        >
          <Sparkles className="w-4 h-4 shrink-0 text-amber-700 mt-0.5" aria-hidden />
          <div>
            <p className="font-bold text-amber-900">נתונים שוחזרו מארכיון ישן</p>
            <p className="mt-0.5">
              שדות מובנים חולצו מהטקסט הישן לגרסה המעודכנת.
              {legacyFilledFields.length > 0 && (
                <span> שוחזרו: {legacyFilledFields.join(', ')}.</span>
              )}
              {' '}הנתונים נשמרים אוטומטית — הקבלה הראשונית לא משתנה.
            </p>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 min-h-[1.5rem]">
        <span className="sr-only" aria-live="polite">
          {saveStatus === 'saving' ? 'שומר נתוני אינטייק' : saveStatus === 'saved' ? 'נשמר' : ''}
        </span>
        {saveIndicator}
      </div>

      <MedicalIntakeSectionedReport
        compact={compact}
        caseStory={fields.caseStory}
        onCaseStoryChange={(caseStory) => patchFields({ caseStory })}
        vasScore={fields.vasScore}
        onVasScoreChange={(vasScore) => patchFields({ vasScore })}
        clinicalDiagnosis={fields.diagnosis}
        onClinicalDiagnosisChange={(diagnosis) => patchFields({ diagnosis })}
        differentialDiagnosis={fields.differentialDiagnosis}
        onDifferentialChange={(differentialDiagnosis) =>
          patchFields({ differentialDiagnosis })
        }
        clinicalConclusionsHe={fields.clinicalConclusionsHe}
        onClinicalConclusionsChange={(clinicalConclusionsHe) =>
          patchFields({ clinicalConclusionsHe })
        }
        precautionsHe={fields.precautionsHe}
        onPrecautionsChange={(precautionsHe) => patchFields({ precautionsHe })}
        recommendedTestsHe={fields.recommendedTestsHe}
        onRecommendedTestsChange={(recommendedTestsHe) =>
          patchFields({ recommendedTestsHe })
        }
        redFlags={fields.redFlags}
        onRedFlagsChange={(redFlags) => patchFields({ redFlags })}
        profile={fields.clinicalIntakeProfile}
        onProfileChange={(clinicalIntakeProfile: PatientClinicalIntakeProfile) =>
          patchFields({ clinicalIntakeProfile })
        }
        objectiveEditable
        showRedFlags
      />

      {showSaveButton && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saveStatus === 'saving'}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 shadow-md"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            {saveStatus === 'saving' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                שומר…
              </>
            ) : saveStatus === 'saved' ? (
              <>
                <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden />
                נשמר ✓
              </>
            ) : (
              <>
                <Save className="w-4 h-4 shrink-0" aria-hidden />
                שמירת עריכות
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
}
