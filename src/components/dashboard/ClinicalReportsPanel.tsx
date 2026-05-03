import { usePatient } from '../../context/PatientContext';
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
      <PainAnalytics analytics={p.analytics} primaryBodyArea={p.primaryBodyArea} />
    </div>
  );
}
