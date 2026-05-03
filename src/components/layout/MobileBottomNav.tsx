import { LayoutDashboard, FileText, BarChart3, MessageSquare, Menu } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import type { NavSection } from '../../types';

type Props = {
  onOpenSidebar: () => void;
};

const navItems: { id: NavSection; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'overview', label: 'סקירה', icon: LayoutDashboard },
  { id: 'clinical', label: 'קליני', icon: FileText },
  { id: 'analytics', label: 'אנליטיקה', icon: BarChart3 },
  { id: 'messages', label: 'הודעות', icon: MessageSquare },
];

export default function MobileBottomNav({ onOpenSidebar }: Props) {
  const { activeSection, setActiveSection, patients, getPatientMessages } = usePatient();

  const totalUnread = patients.reduce((sum, p) => {
    return (
      sum +
      getPatientMessages(p.id).filter((m) => !m.isRead && (m.fromPatient || m.aiClinicalAlert)).length
    );
  }, 0);

  return (
    <nav
      className="fixed bottom-0 inset-x-0 md:hidden z-40 bg-white/95 backdrop-blur-sm border-t-2 border-slate-200 safe-area-bottom"
      dir="rtl"
      aria-label="ניווט ראשי"
    >
      <div className="flex items-stretch h-14">
        {navItems.map(({ id, label, icon: Icon }) => {
          const isActive = activeSection === id;
          const showBadge = id === 'messages' && totalUnread > 0;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSection(id)}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 relative min-h-[44px] transition-colors ${
                isActive ? 'text-slate-900' : 'text-slate-400 hover:text-slate-700'
              }`}
              aria-label={label}
              aria-current={isActive ? 'page' : undefined}
            >
              {isActive && (
                <span className="absolute top-0 inset-x-3 h-0.5 rounded-full bg-slate-900" />
              )}
              <div className="relative">
                <Icon className={`w-5 h-5 ${isActive ? 'stroke-[2.5]' : 'stroke-2'}`} />
                {showBadge && (
                  <span className="absolute -top-1 -left-1 min-w-[14px] h-3.5 px-0.5 rounded-full bg-emerald-600 text-white text-[8px] font-black flex items-center justify-center leading-none">
                    {totalUnread > 9 ? '9+' : totalUnread}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-semibold leading-none ${isActive ? 'font-black' : ''}`}>
                {label}
              </span>
            </button>
          );
        })}

        {/* More / Sidebar toggle */}
        <button
          type="button"
          onClick={onOpenSidebar}
          className="flex-1 flex flex-col items-center justify-center gap-0.5 text-slate-400 hover:text-slate-700 transition-colors min-h-[44px]"
          aria-label="עוד אפשרויות"
        >
          <Menu className="w-5 h-5 stroke-2" />
          <span className="text-[10px] font-semibold leading-none">עוד</span>
        </button>
      </div>
    </nav>
  );
}
