import { AlertTriangle, X, CheckCircle } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import type { Patient } from '../../types';
import { getPatientDisplayName } from '../../utils/patientDisplayName';

interface RedFlagAlertProps {
  patient: Patient;
}

export default function RedFlagAlert({ patient }: RedFlagAlertProps) {
  const { resolveRedFlag } = usePatient();

  if (!patient.hasRedFlag) return null;

  const latestFlag = [...patient.analytics.painHistory]
    .reverse()
    .find((r) => r.notes);

  return (
    <div
      className="rounded-2xl p-4 border-2 border-red-300 shadow-md mb-4 animate-pulse"
      style={{ background: 'linear-gradient(135deg, #fff1f2, #fef2f2)' }}
      dir="rtl"
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-6 h-6 text-red-600" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-base font-bold text-red-700">דגל אדום – נדרשת תגובה דחופה</h3>
          </div>
          <p className="text-sm text-red-600 mb-1">
            המטופל <strong>{getPatientDisplayName(patient)}</strong> דיווח שמפעיל התראת בטיחות (כאב מוגבר ו/או קושי גבוה):
          </p>
          {latestFlag && (
            <p className="text-sm text-red-500 bg-red-50 rounded-lg px-3 py-2 mb-2">
              "{latestFlag.notes}" — {new Date(latestFlag.date).toLocaleDateString('he-IL')}
            </p>
          )}
          <p className="text-xs text-red-400">
            הודעה זו נשלחה כהתראת Push למכשירך.
          </p>
        </div>
        <button
          onClick={() => resolveRedFlag(patient.id)}
          title="סמן כטופל"
          className="p-2 rounded-xl bg-white border border-red-200 hover:bg-green-50 hover:border-green-300 transition-colors group shrink-0"
        >
          <CheckCircle className="w-5 h-5 text-red-400 group-hover:text-green-500 transition-colors" />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={() => resolveRedFlag(patient.id)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}
        >
          <CheckCircle className="w-4 h-4" />
          סמן כטופל
        </button>
        <button
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-red-600 bg-red-50 hover:bg-red-100 border border-red-200 transition-all"
        >
          <X className="w-4 h-4" />
          בטל התראה
        </button>
      </div>
    </div>
  );
}
