import { Activity } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { getPatientDisplayName } from '../../utils/patientDisplayName';
import PainAnalytics from './PainAnalytics';

/** דוחות קליניים למטופל נבחר — כאב ואזורים (ללא מפת גוף / תרגילים — בפורטל בלבד) */
export default function ClinicalReportsPanel() {
  const { selectedPatient } = usePatient();

  if (!selectedPatient) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400 text-sm" dir="rtl">
        בחרו מטופל מהרשימה בצד
      </div>
    );
  }

  const p = selectedPatient;

  return (
    <div className="h-full overflow-y-auto p-6" dir="rtl">
      <h2 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2">
        <Activity className="w-5 h-5 text-teal-600" />
        דוחות קליניים
      </h2>
      <p className="text-sm text-slate-500 mb-5">{getPatientDisplayName(p)}</p>
      <PainAnalytics analytics={p.analytics} primaryBodyArea={p.primaryBodyArea} />
    </div>
  );
}
