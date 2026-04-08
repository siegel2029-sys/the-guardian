import { useMemo } from 'react';
import type { Patient, PatientExerciseFinishReport } from '../../../types';
import { usePatient } from '../../../context/PatientContext';

const SOURCE_LABEL: Record<string, string> = {
  therapist: 'שיקום (מטפל)',
  'self-care': 'טיפול עצמי',
  unknown: 'לא מסווג',
};

function normalizeRow(r: PatientExerciseFinishReport) {
  const sourceRaw =
    r.source ??
    (r.isClinical === true ? 'therapist' : r.isClinical === false ? 'self-care' : undefined);
  const sourceKey = (sourceRaw ?? 'unknown') as 'therapist' | 'self-care' | 'unknown';
  const zone = r.zone ?? r.zoneName ?? '—';
  const exerciseName = r.exerciseName ?? '—';
  const painLevel = r.painLevel;
  const selfCareTierDisplay =
    r.selfCareDifficultyLabel?.trim() ||
    (r.selfCareDifficultyTier != null
      ? r.selfCareDifficultyTier === 0
        ? 'קל (L1)'
        : r.selfCareDifficultyTier === 1
          ? 'בינוני (L2)'
          : 'קשה (L3)'
      : null);
  return {
    id: r.id,
    timestamp: r.timestamp,
    exerciseName,
    zone,
    difficultyScore: r.difficultyScore,
    painDisplay:
      painLevel != null && painLevel >= 1 && painLevel <= 10 ? `${painLevel}/10` : '—',
    sourceKey,
    sourceLabel: SOURCE_LABEL[sourceKey] ?? sourceKey,
    selfCareTierDisplay: selfCareTierDisplay ?? '—',
  };
}

export default function TherapistReportsView({ patient }: { patient: Patient }) {
  const { getPatientExerciseFinishReports } = usePatient();
  const rows = useMemo(() => {
    const raw = getPatientExerciseFinishReports(patient.id);
    return raw.map(normalizeRow);
  }, [getPatientExerciseFinishReports, patient.id]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 leading-relaxed">
        רשומות נשמרות אוטומטית לאחר שמטופל לוחץ «סיים תרגול» במודאל האימון (מאמץ, רמת כאב; בתרגילי כוח
        — גם רמת הקושי שנבחרה במחוון).
      </p>
      <div className="rounded-lg border border-slate-200 overflow-x-auto max-h-[min(520px,60vh)] overflow-y-auto">
        <table className="w-full text-xs text-end min-w-[640px]">
          <thead className="bg-slate-50 text-slate-600 font-semibold sticky top-0 z-[1]">
            <tr>
              <th className="p-2.5">מועד</th>
              <th className="p-2.5">תרגיל</th>
              <th className="p-2.5">אזור</th>
              <th className="p-2.5">מאמץ (1–5)</th>
              <th className="p-2.5">כאב (1–10)</th>
              <th className="p-2.5">רמת קושי (כוח)</th>
              <th className="p-2.5">מקור</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-slate-400 text-sm">
                  אין דיווחי סיום תרגול עדיין
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-t border-slate-100 hover:bg-slate-50/80">
                  <td className="p-2.5 whitespace-nowrap font-mono text-[11px]">
                    {new Date(row.timestamp).toLocaleString('he-IL', {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </td>
                  <td className="p-2.5 font-medium text-slate-800">{row.exerciseName}</td>
                  <td className="p-2.5 text-slate-700">{row.zone}</td>
                  <td className="p-2.5 tabular-nums">{row.difficultyScore}/5</td>
                  <td className="p-2.5 tabular-nums font-mono">{row.painDisplay}</td>
                  <td className="p-2.5 text-slate-600 text-[11px]">{row.selfCareTierDisplay}</td>
                  <td className="p-2.5">
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        row.sourceKey === 'therapist'
                          ? 'bg-red-100 text-red-900'
                          : row.sourceKey === 'self-care'
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {row.sourceLabel}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
