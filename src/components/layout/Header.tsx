import { Bell, AlertTriangle, Search } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import { useAuth } from '../../context/AuthContext';
import type { NavSection } from '../../types';

const sectionTitles: Record<NavSection, string> = {
  overview: 'סקירה קלינית',
  clinical: 'דוחות קליניים',
  analytics: 'היסטוריה ואנליטיקה',
  messages: 'הודעות וצ׳אט',
  settings: 'הגדרות',
};

/** תאימות לסשן ישן לפני שינוי NavSection */
const legacySectionTitle: Record<string, string> = {
  exercises: 'תכנית תרגילים (הועבר לפורטל)',
  'pain-report': 'דוח כאב (הועבר ללשונית קליני)',
};

export default function Header() {
  const { selectedPatient, activeSection, patients } = usePatient();
  const { therapist } = useAuth();
  const totalRedFlags = patients.filter((p) => p.hasRedFlag).length;

  return (
    <header
      className="h-14 border-b border-teal-100 flex items-center justify-between px-6 shrink-0"
      style={{ background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)' }}
      dir="rtl"
    >
      {/* Left: Section + Patient */}
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold text-slate-800">
          {sectionTitles[activeSection as NavSection] ??
            legacySectionTitle[activeSection] ??
            sectionTitles.overview}
        </h2>
        {selectedPatient && (
          <>
            <span className="text-slate-300 text-lg leading-none">·</span>
            <span className="text-sm text-teal-600 font-medium">{selectedPatient.name}</span>
          </>
        )}
      </div>

      {/* Right: Search + Alerts + Greeting */}
      <div className="flex items-center gap-3">
        {/* Search placeholder */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-400 text-xs">
          <Search className="w-3.5 h-3.5" />
          <span>חפש מטופל...</span>
        </div>

        {/* Red flag bell */}
        {totalRedFlags > 0 && (
          <div className="relative">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: '#fff1f2' }}
            >
              <AlertTriangle className="w-4 h-4 text-red-500" />
            </div>
            <span className="absolute -top-1 -left-1 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
              {totalRedFlags}
            </span>
          </div>
        )}

        {/* Bell */}
        <div className="w-8 h-8 rounded-xl flex items-center justify-center bg-teal-50 cursor-pointer hover:bg-teal-100 transition-colors">
          <Bell className="w-4 h-4 text-teal-600" />
        </div>

        {/* Therapist name */}
        <div className="hidden md:flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'linear-gradient(135deg, #0d9488, #059669)' }}
          >
            {therapist?.avatarInitials}
          </div>
          <span className="text-xs font-medium text-slate-700">{therapist?.name}</span>
        </div>
      </div>
    </header>
  );
}
