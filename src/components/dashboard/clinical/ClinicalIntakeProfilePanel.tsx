import { useMemo, useState } from 'react';
import {
  Activity,
  Target,
  Stethoscope,
  FlaskConical,
  HeartPulse,
} from 'lucide-react';
import type { Patient, PatientClinicalIntakeProfile } from '../../../types';
import {
  buildClinicalIntakeProfileSlots,
  resolvePatientClinicalIntakeProfile,
  type ClinicalIntakeProfileSlot,
  type ClinicalIntakeProfileSlotId,
} from '../../../utils/clinicalIntakeProfileDisplay';

const SLOT_ICONS: Record<
  ClinicalIntakeProfileSlotId,
  typeof Activity
> = {
  ranges: Activity,
  strength: HeartPulse,
  special_tests: FlaskConical,
  medical_history: Stethoscope,
  goals: Target,
};

type Props = {
  patient?: Patient;
  /** תצוגה ישירה (למשל שלב סקירה באשף) — ללא patient */
  profile?: PatientClinicalIntakeProfile;
  compact?: boolean;
  className?: string;
};

function SlotCard({ slot, compact }: { slot: ClinicalIntakeProfileSlot; compact?: boolean }) {
  const Icon = SLOT_ICONS[slot.id];
  return (
    <article
      className={`rounded-xl border bg-white shadow-sm overflow-hidden ${
        slot.hasData ? 'border-teal-200/90' : 'border-slate-200'
      }`}
    >
      <header
        className={`flex items-center gap-2 px-3.5 py-2.5 border-b ${
          slot.hasData ? 'bg-teal-50/80 border-teal-100' : 'bg-slate-50 border-slate-100'
        }`}
      >
        <Icon
          className={`w-4 h-4 shrink-0 ${slot.hasData ? 'text-teal-700' : 'text-slate-400'}`}
          aria-hidden
        />
        <h4 className="text-xs font-bold text-slate-800">{slot.titleHe}</h4>
      </header>
      <div className={`px-3.5 ${compact ? 'py-2.5' : 'py-3'} min-h-[4.5rem]`}>
        {slot.hasData ? (
          slot.lines.length === 1 ? (
            <p className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">{slot.lines[0]}</p>
          ) : (
            <ul className="text-sm text-slate-800 space-y-1.5 leading-relaxed list-disc list-inside">
              {slot.lines.map((line, i) => (
                <li key={i} className="whitespace-pre-wrap">
                  {line}
                </li>
              ))}
            </ul>
          )
        ) : (
          <p className="text-xs text-slate-400 italic leading-relaxed">{slot.emptyHe}</p>
        )}
      </div>
    </article>
  );
}

export default function ClinicalIntakeProfilePanel({
  patient,
  profile: profileProp,
  compact = false,
  className = '',
}: Props) {
  const [activeTab, setActiveTab] = useState<ClinicalIntakeProfileSlotId>('ranges');

  const profile = useMemo(() => {
    if (profileProp) return profileProp;
    if (patient) return resolvePatientClinicalIntakeProfile(patient);
    return undefined;
  }, [patient, profileProp]);

  const slots = useMemo(() => buildClinicalIntakeProfileSlots(profile), [profile]);
  const filledCount = slots.filter((s) => s.hasData).length;

  if (compact) {
    const active = slots.find((s) => s.id === activeTab) ?? slots[0];
    return (
      <section
        className={`rounded-xl border border-slate-200 bg-slate-50/50 overflow-hidden ${className}`}
        aria-label="פרופיל אינטייק מובנה"
        dir="rtl"
      >
        <div className="flex flex-wrap border-b border-slate-200 bg-white/90">
          {slots.map((slot) => {
            const Icon = SLOT_ICONS[slot.id];
            const active = activeTab === slot.id;
            return (
              <button
                key={slot.id}
                type="button"
                onClick={() => setActiveTab(slot.id)}
                className={`flex-1 min-w-[88px] flex flex-col items-center gap-0.5 py-2 px-1 text-[10px] font-semibold transition-colors ${
                  active
                    ? 'text-teal-800 bg-teal-50 border-b-2 border-teal-600 -mb-px'
                    : slot.hasData
                      ? 'text-slate-700 hover:bg-slate-50'
                      : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                <Icon className="w-3.5 h-3.5" aria-hidden />
                <span className="truncate max-w-full px-0.5">{slot.titleHe.split(' ')[0]}</span>
              </button>
            );
          })}
        </div>
        <div className="p-3">
          <SlotCard slot={active} compact />
        </div>
      </section>
    );
  }

  return (
    <section
      className={`rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden ${className}`}
      aria-label="פרופיל אינטייק קליני מובנה"
      dir="rtl"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/80">
        <div>
          <h3 className="text-sm font-black text-slate-900">נתוני אינטייק מובנים</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {filledCount > 0
              ? `${filledCount} מתוך ${slots.length} קטגוריות מאוכלסות`
              : 'השלימו אינטייק קליני כדי למלא את הפרופיל'}
          </p>
        </div>
      </div>
      <div className="p-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {slots.map((slot) => (
          <SlotCard key={slot.id} slot={slot} />
        ))}
      </div>
    </section>
  );
}
