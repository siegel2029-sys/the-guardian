import { ChevronRight, Menu } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import type { NavSection } from '../../types';

/** Aligns with DashboardLayout: legacy sections render overview content */
function effectiveNavSection(raw: string): NavSection {
  if (raw === 'exercises' || raw === 'pain-report') return 'overview';
  return raw as NavSection;
}

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
  const { activeSection, setActiveSection } = usePatient();
  const rawSection = activeSection as string;
  const hubSection = effectiveNavSection(rawSection);
  const showBackToHub = hubSection !== 'overview';

  const title =
    sectionTitles[activeSection as NavSection] ??
    legacySectionTitle[activeSection] ??
    sectionTitles.overview;

  const scrollDashboardToTop = () => {
    const el = document.getElementById('therapist-dashboard-main');
    el?.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const goToPatientDashboard = () => {
    setActiveSection('overview');
    scrollDashboardToTop();
  };

  /** Scroll-to-top affordance only for the primary hub title */
  const canScrollTitleToTop = title === sectionTitles.overview;

  const titleClassName =
    'text-sm md:text-base font-semibold text-slate-800 text-center truncate max-w-[min(100%,28rem)] px-3';

  return (
    <header
      className="sticky top-0 z-20 relative h-14 border-b border-teal-100 flex items-center justify-center shrink-0 px-11 md:px-6"
      style={{ background: 'rgba(255,255,255,0.97)', backdropFilter: 'blur(8px)' }}
      dir="rtl"
    >
      <button
        type="button"
        onClick={onMenuToggle}
        className="md:hidden absolute start-3 top-1/2 -translate-y-1/2 flex items-center justify-center w-11 h-11 rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
        aria-label="פתח תפריט ניווט"
      >
        <Menu className="w-5 h-5" strokeWidth={2.5} aria-hidden />
      </button>

      {showBackToHub ? (
        <button
          type="button"
          onClick={goToPatientDashboard}
          className="absolute end-3 top-1/2 -translate-y-1/2 md:end-auto md:start-3 flex items-center justify-center w-11 h-11 rounded-xl text-slate-700 hover:bg-slate-100 active:bg-slate-200 transition-colors shrink-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600"
          aria-label="חזרה ללוח המטופל"
        >
          <ChevronRight className="w-5 h-5" strokeWidth={2.5} aria-hidden />
        </button>
      ) : null}

      {canScrollTitleToTop ? (
        <button
          type="button"
          onClick={scrollDashboardToTop}
          className={`${titleClassName} cursor-pointer rounded-lg hover:bg-slate-100 active:bg-slate-200 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-600`}
          aria-label="לוח מטופל — גלילה לראש העמוד"
        >
          {title}
        </button>
      ) : (
        <span className={titleClassName}>
          {title}
        </span>
      )}
    </header>
  );
}
