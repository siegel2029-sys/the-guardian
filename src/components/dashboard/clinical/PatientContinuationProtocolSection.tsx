import { useCallback, useMemo } from 'react';
import type { Patient, ProtocolTrackingState } from '../../../types';
import {
  usePatientClinical,
  usePatientCloudSync,
  usePatientExercisePlans,
} from '../../../context/patientDomainHooks';
import {
  buildPatchForLatestVersionSave,
  loadLatestIntakeFields,
} from '../../../utils/clinicalIntakeVersions';
import { resolveClinicalActiveStreak } from '../../../utils/clinicalActiveStreak';
import {
  computeClinicalProtocolContext,
  PROTOCOL_PROGRESSION_FROZEN_BADGE_HE,
  resolveProtocolStartDateForPatient,
} from '../../../utils/clinicalProtocolWeek';
import { collectPatientSessionDates } from '../../../utils/collectPatientSessionDates';
import { clampTargetWorkoutsPerWeek } from '../../../utils/targetWorkoutsPerWeek';
import TreatmentProtocolPrognosisCard from './TreatmentProtocolPrognosisCard';

type Props = {
  patient: Patient;
  clinicalToday: string;
  onEditClick?: () => void;
  className?: string;
};

/** Therapist dashboard — same interactive protocol accordion as Full Intake Summary. */
export default function PatientContinuationProtocolSection({
  patient,
  clinicalToday,
  onEditClick,
  className = '',
}: Props) {
  const { updatePatient } = usePatientClinical();
  const { saveSinglePatientPayloadToCloud } = usePatientCloudSync();
  const { getExercisePlan, dailyHistoryByPatient, dailySessions } = usePatientExercisePlans();

  const fields = useMemo(() => loadLatestIntakeFields(patient), [patient]);
  const plan = useMemo(() => getExercisePlan(patient.id), [getExercisePlan, patient.id]);

  const protocolContext = useMemo(() => {
    const dailyHistoryForPatient = dailyHistoryByPatient?.[patient.id];
    const sessionDates = collectPatientSessionDates({
      patient,
      dailyHistoryForPatient,
      dailySessions,
    });
    const activeStreak = resolveClinicalActiveStreak(sessionDates, clinicalToday);
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
    plan?.targetWorkoutsPerWeek,
  ]);

  const onTrackingChange = useCallback(
    (protocolTrackingState: ProtocolTrackingState) => {
      const latestFields = loadLatestIntakeFields(patient);
      const updatedFields = { ...latestFields, protocolTrackingState };
      const patch = buildPatchForLatestVersionSave(patient, updatedFields);
      updatePatient(patient.id, patch);
      void saveSinglePatientPayloadToCloud({ ...patient, ...patch });
    },
    [patient, updatePatient, saveSinglePatientPayloadToCloud]
  );

  const hasPrognosis = Boolean(fields.prognosisHypothesis?.trim());
  const hasProtocol = Boolean(fields.treatmentProtocol);
  const hasContent = hasProtocol || hasPrognosis;

  if (!hasContent) {
    return (
      <section
        dir="rtl"
        className={`rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden ${className}`}
        aria-label="פרוטוקול המשך טיפול ופרוגנוזה"
      >
        <div className="border-b border-slate-200/80 px-4 py-4 sm:px-5 bg-gradient-to-l from-violet-50/50 to-slate-50/80">
          <h3 className="text-sm font-black text-slate-900">פרוטוקול המשך טיפול ופרוגנוזה</h3>
        </div>
        <p className="p-4 sm:p-5 text-sm text-purple-400/90 leading-relaxed">
          טרם הוגדר פרוטוקול המשך או פרוגנוזה
          {onEditClick && (
            <>
              {' — '}
              <button
                type="button"
                onClick={onEditClick}
                className="font-semibold text-purple-600 underline underline-offset-2 hover:text-purple-800 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-500"
              >
                עדכון בסיכום אינטייק מלא
              </button>
            </>
          )}
        </p>
      </section>
    );
  }

  return (
    <div className={className}>
      {protocolContext.protocolProgressionFrozen && (
        <div
          className="mb-2 rounded-xl border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-950"
          role="status"
        >
          {PROTOCOL_PROGRESSION_FROZEN_BADGE_HE}
          {protocolContext.chronologicalProtocolWeek != null &&
            protocolContext.currentProtocolWeek != null && (
              <span className="font-semibold text-amber-900/80">
                {' '}
                (שבוע אפקטיבי {protocolContext.currentProtocolWeek}
                {protocolContext.chronologicalProtocolWeek !==
                protocolContext.currentProtocolWeek
                  ? ` · לוח שנה: שבוע ${protocolContext.chronologicalProtocolWeek}`
                  : ''}
                )
              </span>
            )}
        </div>
      )}
      <TreatmentProtocolPrognosisCard
        treatmentProtocol={fields.treatmentProtocol}
        prognosisHypothesis={fields.prognosisHypothesis}
        protocolTrackingState={fields.protocolTrackingState}
        currentProtocolWeek={protocolContext.currentProtocolWeek}
        protocolProgressionFrozen={protocolContext.protocolProgressionFrozen}
        readOnly={false}
        onTrackingChange={onTrackingChange}
        showYouAreHereBadge
        activeWeekBadgeLabel="המטופל כאן"
      />
      {onEditClick && (
        <p className="mt-2 text-xs text-slate-500 text-end">
          <button
            type="button"
            onClick={onEditClick}
            className="font-semibold text-purple-600 underline underline-offset-2 hover:text-purple-800 transition-colors"
          >
            עריכת פרוטוקול באינטייק
          </button>
        </p>
      )}
    </div>
  );
}
