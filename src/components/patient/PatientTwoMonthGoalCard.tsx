import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import type { Patient } from '../../types';
import { loadLatestIntakeFields } from '../../utils/clinicalIntakeVersions';

type Props = {
  patient: Patient;
  className?: string;
};

export default function PatientTwoMonthGoalCard({ patient, className = '' }: Props) {
  const prognosis = useMemo(() => {
    const fields = loadLatestIntakeFields(patient);
    return fields.prognosisHypothesis?.trim() ?? '';
  }, [patient]);

  if (!prognosis) return null;

  return (
    <section
      className={`mt-4 rounded-2xl border-2 border-emerald-200/80 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/40 shadow-md shadow-emerald-900/5 overflow-hidden ${className}`}
      aria-label="היעד שלך לעוד חודשיים"
    >
      <div className="px-4 py-3 border-b border-emerald-100/80 bg-emerald-50/50">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-emerald-600 shrink-0" aria-hidden />
          <h2 className="text-sm font-bold text-emerald-950">היעד שלך לעוד חודשיים</h2>
        </div>
      </div>
      <p className="px-4 py-4 text-sm leading-relaxed text-slate-800 font-medium">{prognosis}</p>
    </section>
  );
}
