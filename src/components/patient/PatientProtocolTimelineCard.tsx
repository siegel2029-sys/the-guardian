import { useMemo } from 'react';
import type { Patient } from '../../types';
import { loadLatestIntakeFields } from '../../utils/clinicalIntakeVersions';
import { resolveClinicalActiveStreak } from '../../utils/clinicalActiveStreak';
import { computeClinicalProtocolContext } from '../../utils/clinicalProtocolWeek';
import TreatmentProtocolPrognosisCard from '../dashboard/clinical/TreatmentProtocolPrognosisCard';

type Props = {
  patient: Patient;
  clinicalToday: string;
  className?: string;
};

/** Patient portal — weekly recovery protocol with active-week highlight. */
export default function PatientProtocolTimelineCard({
  patient,
  clinicalToday,
  className = '',
}: Props) {
  const fields = useMemo(() => loadLatestIntakeFields(patient), [patient]);

  const protocolContext = useMemo(() => {
    const sessionDates = (patient.analytics?.sessionHistory ?? []).map((s) => s.date);
    const activeStreak = resolveClinicalActiveStreak(sessionDates, clinicalToday);
    return computeClinicalProtocolContext({
      protocolStartDate: activeStreak.actualStartDate,
      clinicalToday,
      treatmentProtocol: fields.treatmentProtocol,
    });
  }, [patient, clinicalToday, fields.treatmentProtocol]);

  const hasPrognosis = Boolean(fields.prognosisHypothesis?.trim());
  const hasProtocol = Boolean(fields.treatmentProtocol);

  if (!hasProtocol && !hasPrognosis) return null;

  return (
    <TreatmentProtocolPrognosisCard
      className={className}
      treatmentProtocol={fields.treatmentProtocol}
      prognosisHypothesis={fields.prognosisHypothesis}
      protocolTrackingState={fields.protocolTrackingState}
      currentProtocolWeek={protocolContext.currentProtocolWeek}
      readOnly
      showYouAreHereBadge
    />
  );
}
