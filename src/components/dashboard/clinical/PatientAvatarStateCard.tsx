import { UserRound } from 'lucide-react';
import type { Patient } from '../../../types';
import { getPatientAvatarPresentation } from './clinicalPatientPresentation';

export default function PatientAvatarStateCard({ patient }: { patient: Patient }) {
  const pres = getPatientAvatarPresentation(patient);

  return (
    <div
      className="rounded-xl border bg-white p-5 shadow-sm h-full flex flex-col items-center text-center"
      style={{ borderColor: '#e2e8f0' }}
      dir="rtl"
    >
      <p className="text-xs font-semibold text-slate-500 mb-3 w-full text-start">מצב תצוגת מטופל</p>
      <div
        className={`w-24 h-24 rounded-2xl flex items-center justify-center text-white text-3xl font-black shadow-inner ring-4 ${pres.ringClass}`}
        style={{
          background: 'linear-gradient(145deg, #1e40af 0%, #3b82f6 55%, #60a5fa 100%)',
        }}
      >
        {patient.name.charAt(0)}
      </div>
      <div
        className="mt-3 px-3 py-1 rounded-full text-xs font-bold"
        style={{ background: pres.badgeBg, color: pres.badgeText }}
      >
        {pres.labelHe}
      </div>
      <p className="text-xs text-slate-600 mt-2 leading-relaxed max-w-[220px]">{pres.subtitleHe}</p>
      <div className="mt-4 flex items-center gap-2 text-[11px] text-slate-400">
        <UserRound className="w-4 h-4" />
        <span>תצוגה מקדימה — עתידי: אווטאר דינמי לפי התקדמות</span>
      </div>
    </div>
  );
}
