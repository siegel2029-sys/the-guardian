import { useState, useCallback } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileBottomNav from './MobileBottomNav';
import PatientOverview from '../dashboard/PatientOverview';
import MessagesPanel from '../dashboard/MessagesPanel';
import ClinicalReportsPanel from '../dashboard/ClinicalReportsPanel';
import HistoryAnalyticsPanel from '../dashboard/HistoryAnalyticsPanel';
import TherapistSettingsPanel from '../dashboard/TherapistSettingsPanel';
import ManageKnowledgeBasePanel from '../dashboard/ManageKnowledgeBasePanel';
import { usePatient } from '../../context/PatientContext';
import type { NavSection } from '../../types';

export default function DashboardLayout() {
  const { activeSection } = usePatient();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  const openMobileDrawer = useCallback(() => setMobileDrawerOpen(true), []);
  const closeMobileDrawer = useCallback(() => setMobileDrawerOpen(false), []);

  const renderContent = () => {
    const raw = activeSection as string;
    const section: NavSection =
      raw === 'exercises' || raw === 'pain-report' ? 'overview' : activeSection;

    switch (section) {
      case 'overview':
        return <PatientOverview />;
      case 'clinical':
        return <ClinicalReportsPanel />;
      case 'analytics':
        return <HistoryAnalyticsPanel />;
      case 'messages':
        return <MessagesPanel />;
      case 'settings':
        return <TherapistSettingsPanel />;
      case 'knowledge':
        return <ManageKnowledgeBasePanel />;
      default:
        return <PatientOverview />;
    }
  };

  return (
    <div className="flex h-dvh overflow-hidden" style={{ background: '#F0F9FA' }}>
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:flex md:h-full md:shrink-0 md:sticky md:top-0 md:self-start">
        <Sidebar />
      </div>

      {/* Mobile sidebar drawer overlay */}
      <div
        className={`fixed inset-0 z-50 md:hidden transition-opacity duration-200 ${
          mobileDrawerOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        aria-hidden={!mobileDrawerOpen}
      >
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={closeMobileDrawer}
          aria-hidden
        />
        {/* Drawer panel — slides in from right (RTL: leading edge) */}
        <div
          className={`absolute inset-y-0 right-0 w-72 shadow-2xl transition-transform duration-200 ${
            mobileDrawerOpen ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <Sidebar mobileMode onClose={closeMobileDrawer} />
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Header onMenuToggle={openMobileDrawer} />

        <main className="flex-1 min-h-0 overflow-y-auto">
          {/* Extra bottom padding on mobile so content isn't hidden behind bottom nav */}
          <div className="h-full [padding-bottom:env(safe-area-inset-bottom)] pb-14 md:pb-0">
            {renderContent()}
          </div>
        </main>

        {/* Accessibility footer — desktop only */}
        <footer className="hidden md:flex items-center justify-center py-1.5 border-t border-slate-200/60 bg-transparent shrink-0">
          <a
            href="/accessibility"
            className="text-[11px] text-slate-400 hover:text-teal-600 underline underline-offset-2 transition-colors"
          >
            הצהרת נגישות
          </a>
        </footer>

        {/* Mobile bottom navigation */}
        <MobileBottomNav onOpenSidebar={openMobileDrawer} />
      </div>
    </div>
  );
}
