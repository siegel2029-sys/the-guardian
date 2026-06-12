import { useMemo } from 'react';
import { Target } from 'lucide-react';
import type { Patient } from '../../types';
import { loadLatestIntakeFields } from '../../utils/clinicalIntakeVersions';

type Props = {
  patient: Patient;
  className?: string;
};

/** Patient portal — prognosis only (no week-by-week protocol details). */
export default function PatientTwoMonthGoalCard({ patient, className = '' }: Props) {
  const prognosis = useMemo(() => {
    const fields = loadLatestIntakeFields(patient);
    return fields.prognosisHypothesis?.trim() ?? '';
  }, [patient]);

  if (!prognosis) return null;

  return (
    <section
      dir="rtl"
      className={`mt-4 rounded-2xl border-2 border-emerald-200/90 bg-gradient-to-br from-emerald-50/95 via-white to-teal-50/50 shadow-md shadow-emerald-900/5 overflow-hidden ${className}`}
      aria-label="פרוגנוזה — יעד ההחלמה שלך"
    >
      <div className="px-4 py-3.5 border-b border-emerald-100/90 bg-gradient-to-l from-emerald-50 to-teal-50/60">
        <div className="flex items-center gap-2.5">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-emerald-100 border border-emerald-200/80"
            aria-hidden
          >
            <Target className="w-5 h-5 text-emerald-700" />
          </div>
          <div>
            <h2 className="text-sm font-black text-emerald-950">פרוגנוזה</h2>
            <p className="text-[11px] text-emerald-800/80 font-medium">יעד ההחלמה שלך</p>
          </div>
        </div>
      </div>
      <p className="px-4 py-4 text-base leading-relaxed text-slate-800 font-medium">{prognosis}</p>
    </section>
  );
}
