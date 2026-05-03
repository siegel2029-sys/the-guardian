import { Menu } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { getPatientDisplayName } from '../../utils/patientDisplayName';
import type { NavSection } from '../../types';

const sectionTitles: Record<NavSection, string> = {
  overview: 'לוח מטפל',
  clinical: 'דוחות קליניים',
  analytics: 'היסטוריה ואנליטיקה',
  messages: 'הודעות וצ׳אט',
  settings: 'הגדרות',
  knowledge: 'בסיס ידע — הידעת?',
};

/** תאימות לסשן ישן לפני שינוי NavSection */
const legacySectionTitle: Record<string, string> = {
  exercises: 'תכנית תרגילים (הועבר לפורטל)',
  'pain-report': 'דוח כאב (הועבר ללשונית קליני)',
};

type Props = {
  onMenuToggle: () => void;
};

export default function Header({ onMenuToggle }: Props) {
  const { selectedPatient, activeSection } = usePatient();

  return (
    <header
      className="h-14 border-b border-teal-100 flex items-center justify-between px-3 md:px-6 shrink-0 gap-2"
      style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)' }}
      dir="rtl"
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <button
          type="button"
          onClick={onMenuToggle}
          className="md:hidden flex items-center justify-center w-11 h-11 rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors shrink-0 -mr-1"
          aria-label="פתח תפריט ניווט"
        >
          <Menu className="w-5 h-5" strokeWidth={2.5} />
        </button>

        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm md:text-base font-semibold text-slate-800 truncate">
            {sectionTitles[activeSection as NavSection] ??
              legacySectionTitle[activeSection] ??
              sectionTitles.overview}
          </h2>
          {selectedPatient && (
            <>
              <span className="text-slate-300 text-lg leading-none hidden sm:inline">·</span>
              <span className="hidden sm:inline text-sm text-teal-600 font-medium truncate">
                {getPatientDisplayName(selectedPatient)}
              </span>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
