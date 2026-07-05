import type { Patient } from '../../../types';
import { usePatient } from '../../../context/PatientContext';
import PatientProgressChartPanel from '../../charts/PatientProgressChartPanel';

type Props = {
  patient: Patient;
};

/** Therapist dashboard progress chart — navigable 30-day window with finish-report drill-down. */
export default function PatientProgressChart({ patient }: Props) {
  const { getPatientExerciseFinishReports, clinicalToday } = usePatient();
  const finishReports = getPatientExerciseFinishReports(patient.id);

  return (
    <section
      className="rounded-2xl border border-slate-200/80 bg-white shadow-sm overflow-hidden"
      aria-label="מעקב התקדמות"
      dir="rtl"
    >
      <PatientProgressChartPanel
        patient={patient}
        finishReports={finishReports}
        clinicalToday={clinicalToday}
        showFinishReportsButton
      />
    </section>
  );
}
