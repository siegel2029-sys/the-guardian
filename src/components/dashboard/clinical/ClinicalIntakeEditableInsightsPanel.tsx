import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Save } from 'lucide-react';
import type { Patient } from '../../../types';
import { resolvePatientClinicalIntakeProfile } from '../../../utils/clinicalIntakeProfileDisplay';
import {
  loadClinicalIntakeEditableFields,
  buildPatientPatchFromEditableIntakeFields,
  type ClinicalIntakeEditableFields,
} from '../../../utils/clinicalIntakeEditableFields';
import { MedicalIntakeSectionedReport } from './MedicalIntakeDashboard';

type Props = {
  patient: Patient;
  compact?: boolean;
  onSave: (patch: ReturnType<typeof buildPatientPatchFromEditableIntakeFields>) => void | Promise<void>;
  showSaveButton?: boolean;
  className?: string;
};

export default function ClinicalIntakeEditableInsightsPanel({
  patient,
  compact = false,
  onSave,
  showSaveButton = true,
  className = '',
}: Props) {
  const [fields, setFields] = useState<ClinicalIntakeEditableFields>(() =>
    loadClinicalIntakeEditableFields(patient)
  );
  const [saving, setSaving] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);

  const profile = useMemo(() => resolvePatientClinicalIntakeProfile(patient), [patient]);

  useEffect(() => {
    setFields(loadClinicalIntakeEditableFields(patient));
  }, [patient.id]);

  const patchFields = useCallback(
    (partial: Partial<ClinicalIntakeEditableFields>) => {
      setFields((prev) => ({ ...prev, ...partial }));
    },
    []
  );

  const handleSave = async () => {
    setSaving(true);
    try {
      const patch = buildPatientPatchFromEditableIntakeFields(fields);
      await onSave(patch);
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2200);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`space-y-4 ${className}`} dir="rtl">
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
        profile={profile}
        showRedFlags
      />

      {showSaveButton && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 shadow-md"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                שומר…
              </>
            ) : savedFlash ? (
              'נשמר ✓'
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
