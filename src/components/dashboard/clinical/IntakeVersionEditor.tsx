import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import type { Patient, PatientClinicalIntakeProfile, PatientIntakeVersionEntry } from '../../../types';
import type { ClinicalIntakeEditableFields } from '../../../utils/clinicalIntakeEditableFields';
import ClinicalIntelligencePanel from './ClinicalIntelligencePanel';
import { MedicalIntakeSectionedReport } from './MedicalIntakeDashboard';
import TreatmentProtocolPrognosisCard from './TreatmentProtocolPrognosisCard';
import { useDebouncedCallback } from './useDebouncedCallback';
import { resolveClinicalActiveStreak } from '../../../utils/clinicalActiveStreak';
import {
  computeClinicalProtocolContext,
  resolveProtocolStartDateForPatient,
} from '../../../utils/clinicalProtocolWeek';
import { collectPatientSessionDates } from '../../../utils/collectPatientSessionDates';
import { clampTargetWorkoutsPerWeek } from '../../../utils/targetWorkoutsPerWeek';
import { usePatientExercisePlans } from '../../../context/patientDomainHooks';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  fields: ClinicalIntakeEditableFields;
  onFieldsChange: (next: ClinicalIntakeEditableFields) => void;
  onSave: (fields: ClinicalIntakeEditableFields) => void | Promise<void>;
  readOnly?: boolean;
  compact?: boolean;
  showSaveButton?: boolean;
  autoSave?: boolean;
  comparativeMeta?: PatientIntakeVersionEntry['comparativeMeta'];
  sourceGemini?: boolean;
  className?: string;
  patient?: Patient;
  clinicalToday?: string;
};

const AUTO_SAVE_DELAY_MS = 1400;

export default function IntakeVersionEditor({
  fields,
  onFieldsChange,
  onSave,
  readOnly = false,
  compact = false,
  showSaveButton = true,
  autoSave = true,
  comparativeMeta,
  sourceGemini = false,
  className = '',
  patient,
  clinicalToday,
}: Props) {
  const { getExercisePlan, dailyHistoryByPatient, dailySessions } = usePatientExercisePlans();
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [isDirty, setIsDirty] = useState(false);
  const fieldsRef = useRef(fields);
  const isDirtyRef = useRef(false);
  const onSaveRef = useRef(onSave);

  useEffect(() => {
    fieldsRef.current = fields;
    isDirtyRef.current = false;
    setIsDirty(false);
    setSaveStatus('idle');
  }, [fields]);

  useEffect(() => {
    onSaveRef.current = onSave;
  }, [onSave]);

  const persist = useCallback(async (snapshot: ClinicalIntakeEditableFields, silent?: boolean) => {
    if (!silent) setSaveStatus('saving');
    try {
      await onSaveRef.current(snapshot);
      isDirtyRef.current = false;
      setIsDirty(false);
      setSaveStatus('saved');
      window.setTimeout(() => setSaveStatus((s) => (s === 'saved' ? 'idle' : s)), 2400);
    } catch {
      setSaveStatus('error');
      window.setTimeout(() => setSaveStatus('idle'), 3000);
    }
  }, []);

  const debouncedAutoSave = useDebouncedCallback(() => {
    if (!autoSave || readOnly || !isDirtyRef.current) return;
    void persist(fieldsRef.current, true);
  }, AUTO_SAVE_DELAY_MS);

  const patch = useCallback(
    (partial: Partial<ClinicalIntakeEditableFields>) => {
      if (readOnly) return;
      isDirtyRef.current = true;
      setIsDirty(true);
      const next = { ...fieldsRef.current, ...partial };
      fieldsRef.current = next;
      onFieldsChange(next);
      debouncedAutoSave();
    },
    [readOnly, onFieldsChange, debouncedAutoSave]
  );

  const handleBlurSave = useCallback(() => {
    if (!autoSave || readOnly || !isDirtyRef.current) return;
    void persist(fieldsRef.current, true);
  }, [autoSave, readOnly, persist]);

  const noop = () => undefined;
  const noopList = () => undefined;

  const protocolContext = useMemo(() => {
    if (!patient || !clinicalToday) return null;
    const dailyHistoryForPatient = dailyHistoryByPatient?.[patient.id];
    const sessionDates = collectPatientSessionDates({
      patient,
      dailyHistoryForPatient,
      dailySessions,
    });
    const activeStreak = resolveClinicalActiveStreak(sessionDates, clinicalToday);
    const plan = getExercisePlan(patient.id);
    return computeClinicalProtocolContext({
      protocolStartDate: resolveProtocolStartDateForPatient(
        patient,
        activeStreak.actualStartDate
      ),
      clinicalToday,
      treatmentProtocol: fields.treatmentProtocol,
      sessionDatesChronological: sessionDates,
      targetWorkoutsPerWeek: clampTargetWorkoutsPerWeek(plan?.targetWorkoutsPerWeek),
    });
  }, [
    patient,
    clinicalToday,
    fields.treatmentProtocol,
    dailyHistoryByPatient,
    dailySessions,
    getExercisePlan,
  ]);

  const currentProtocolWeek = protocolContext?.currentProtocolWeek ?? null;

  const saveIndicator =
    !readOnly && saveStatus === 'saving' ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-teal-700">
        <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden />
        שומר…
      </span>
    ) : !readOnly && saveStatus === 'saved' ? (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden />
        נשמר
      </span>
    ) : !readOnly && isDirty && autoSave ? (
      <span className="text-xs text-slate-500">שינויים שלא נשמרו</span>
    ) : null;

  return (
    <div className={`space-y-4 ${className}`} onBlur={readOnly ? undefined : handleBlurSave}>
      {saveIndicator && (
        <div className="flex items-center min-h-[1.25rem]">
          <span className="sr-only" aria-live="polite">
            {saveStatus === 'saving' ? 'שומר' : saveStatus === 'saved' ? 'נשמר' : ''}
          </span>
          {saveIndicator}
        </div>
      )}

      <MedicalIntakeSectionedReport
        compact={compact}
        readOnly={readOnly}
        showRedFlags
        caseStory={fields.caseStory}
        onCaseStoryChange={readOnly ? noop : (caseStory) => patch({ caseStory })}
        vasScore={fields.vasScore}
        onVasScoreChange={readOnly ? noop : (vasScore) => patch({ vasScore })}
        clinicalDiagnosis={fields.diagnosis}
        onClinicalDiagnosisChange={readOnly ? noop : (diagnosis) => patch({ diagnosis })}
        differentialDiagnosis={fields.differentialDiagnosis}
        onDifferentialChange={readOnly ? noopList : (differentialDiagnosis) => patch({ differentialDiagnosis })}
        clinicalConclusionsHe={fields.clinicalConclusionsHe}
        onClinicalConclusionsChange={
          readOnly ? noopList : (clinicalConclusionsHe) => patch({ clinicalConclusionsHe })
        }
        precautionsHe={fields.precautionsHe}
        onPrecautionsChange={readOnly ? noopList : (precautionsHe) => patch({ precautionsHe })}
        recommendedTestsHe={fields.recommendedTestsHe}
        onRecommendedTestsChange={
          readOnly ? noopList : (recommendedTestsHe) => patch({ recommendedTestsHe })
        }
        redFlags={fields.redFlags}
        onRedFlagsChange={readOnly ? noopList : (redFlags) => patch({ redFlags })}
        profile={fields.clinicalIntakeProfile}
        onProfileChange={
          readOnly
            ? undefined
            : (clinicalIntakeProfile: PatientClinicalIntakeProfile) => patch({ clinicalIntakeProfile })
        }
        objectiveEditable={!readOnly}
        showAiInsights={false}
      />

      <TreatmentProtocolPrognosisCard
        treatmentProtocol={fields.treatmentProtocol}
        prognosisHypothesis={fields.prognosisHypothesis}
        protocolTrackingState={fields.protocolTrackingState}
        currentProtocolWeek={currentProtocolWeek}
        protocolProgressionFrozen={protocolContext?.protocolProgressionFrozen === true}
        readOnly={readOnly}
        onTrackingChange={
          readOnly ? undefined : (protocolTrackingState) => patch({ protocolTrackingState })
        }
        activeWeekBadgeLabel="המטופל כאן"
      />

      <ClinicalIntelligencePanel
        clinicalConclusionsHe={fields.clinicalConclusionsHe}
        onClinicalConclusionsChange={
          readOnly ? undefined : (clinicalConclusionsHe) => patch({ clinicalConclusionsHe })
        }
        redFlags={fields.redFlags}
        onRedFlagsChange={readOnly ? undefined : (redFlags) => patch({ redFlags })}
        recommendedTestsHe={fields.recommendedTestsHe}
        onRecommendedTestsChange={
          readOnly ? undefined : (recommendedTestsHe) => patch({ recommendedTestsHe })
        }
        discrepancies={comparativeMeta?.discrepancies}
        readOnly={readOnly}
        sourceGemini={sourceGemini}
      />

      {!readOnly && showSaveButton && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={() => void persist(fieldsRef.current)}
            disabled={saveStatus === 'saving'}
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 shadow-md"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            {saveStatus === 'saving' ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden />
                שומר…
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
