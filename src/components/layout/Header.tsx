import { Menu } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import type { NavSection } from '../../types';

const sectionTitles: Record<NavSection, string> = {
  overview: 'לוח מטופל',
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
  const { activeSection } = usePatient();

  const title =
    sectionTitles[activeSection as NavSection] ??
    legacySectionTitle[activeSection] ??
    sectionTitles.overview;

  return (
    <header
      className="relative h-14 border-b border-teal-100 flex items-center justify-center shrink-0 px-11 md:px-6"
      style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)' }}
      dir="rtl"
    >
      <button
        type="button"
        onClick={onMenuToggle}
        className="md:hidden absolute start-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-11 h-11 rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors shrink-0"
        aria-label="פתח תפריט ניווט"
      >
        <Menu className="w-5 h-5" strokeWidth={2.5} />
      </button>

      <h2 className="text-sm md:text-base font-semibold text-slate-800 text-center truncate max-w-[min(100%,28rem)]">
        {title}
      </h2>
    </header>
  );
}
