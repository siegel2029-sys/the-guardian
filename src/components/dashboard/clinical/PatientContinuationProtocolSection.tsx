import { useCallback, useMemo } from 'react';
import type { Patient, ProtocolTrackingState } from '../../../types';
import { usePatient } from '../../../context/PatientContext';
import {
  buildPatchForLatestVersionSave,
  loadLatestIntakeFields,
} from '../../../utils/clinicalIntakeVersions';
import { resolveClinicalActiveStreak } from '../../../utils/clinicalActiveStreak';
import {
  computeClinicalProtocolContext,
  resolveProtocolStartDateForPatient,
} from '../../../utils/clinicalProtocolWeek';
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
  const { updatePatient, saveSinglePatientPayloadToCloud } = usePatient();

  const fields = useMemo(() => loadLatestIntakeFields(patient), [patient]);

  const protocolContext = useMemo(() => {
    const sessionDates = (patient.analytics?.sessionHistory ?? []).map((s) => s.date);
    const activeStreak = resolveClinicalActiveStreak(sessionDates, clinicalToday);
    return computeClinicalProtocolContext({
      protocolStartDate: resolveProtocolStartDateForPatient(
        patient,
        activeStreak.actualStartDate
      ),
      clinicalToday,
      treatmentProtocol: fields.treatmentProtocol,
    });
  }, [patient, clinicalToday, fields.treatmentProtocol]);

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
      <TreatmentProtocolPrognosisCard
        treatmentProtocol={fields.treatmentProtocol}
        prognosisHypothesis={fields.prognosisHypothesis}
        protocolTrackingState={fields.protocolTrackingState}
        currentProtocolWeek={protocolContext.currentProtocolWeek}
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
