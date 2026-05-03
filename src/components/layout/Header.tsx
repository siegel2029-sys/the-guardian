import { Bell, AlertTriangle, Search, Menu } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { getPatientDisplayName } from '../../utils/patientDisplayName';
import { useAuth } from '../../context/AuthContext';
import type { NavSection } from '../../types';

const sectionTitles: Record<NavSection, string> = {
  overview: 'סקירה קלינית',
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
  const { selectedPatient, activeSection, patients } = usePatient();
  const { therapist } = useAuth();
  const totalRedFlags = patients.filter((p) => p.hasRedFlag).length;

  return (
    <header
      className="h-14 border-b border-teal-100 flex items-center justify-between px-3 md:px-6 shrink-0 gap-2"
      style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)' }}
      dir="rtl"
    >
      {/* Right: Hamburger (mobile only) + Section title + Patient */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Hamburger — mobile only */}
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

      {/* Left: Search + Alerts + Greeting */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Search — desktop only */}
        <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-400 text-xs">
          <Search className="w-3.5 h-3.5" />
          <span>חפש מטופל...</span>
        </div>

        {/* Red flag bell */}
        {totalRedFlags > 0 && (
          <div className="relative">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-red-50">
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {totalRedFlags}
            </span>
          </div>
        )}

        {/* Bell */}
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-teal-50 cursor-pointer hover:bg-teal-100 transition-colors">
          <Bell className="w-4 h-4 text-teal-600" />
        </div>

        {/* Therapist avatar — desktop only */}
        <div className="hidden md:flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'linear-gradient(135deg, #0d9488, #059669)' }}
          >
            {therapist?.avatarInitials}
          </div>
          <span className="hidden lg:inline text-xs font-medium text-slate-700">{therapist?.name}</span>
        </div>
      </div>
    </header>
  );
}
