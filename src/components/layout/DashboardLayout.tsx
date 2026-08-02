import { useState, useCallback, useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import MobileBottomNav from './MobileBottomNav';
import PatientOverview from '../dashboard/PatientOverview';
import MessagesPanel from '../dashboard/MessagesPanel';
import ClinicalReportsPanel from '../dashboard/ClinicalReportsPanel';
import HistoryAnalyticsPanel from '../dashboard/HistoryAnalyticsPanel';
import TherapistSettingsPanel from '../dashboard/TherapistSettingsPanel';
import ManageKnowledgeBasePanel from '../dashboard/ManageKnowledgeBasePanel';
import ManageExerciseCatalogPanel from '../dashboard/ManageExerciseCatalogPanel';
import ErrorBoundary from '../ui/error-boundary';
import { usePatientRoster } from '../../context/patientDomainHooks';
import { useTherapistPushInfrastructure } from '../../hooks/useTherapistPushInfrastructure';
import { prefetchExerciseCatalog } from '../../services/exerciseCatalogService';
import { isSupabaseConfigured } from '../../lib/supabase';
import type { NavSection } from '../../types';

export default function DashboardLayout() {
  const { activeSection } = usePatientRoster();
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);

  // Refresh + persist the therapist's push subscription on dashboard open (server-validated VAPID key).
  useTherapistPushInfrastructure();

  // Prefetch global exercise catalog into memory for plan builder + AI prompts (sync cache).
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    void prefetchExerciseCatalog({ includeInactive: true }).catch(() => {
      /* non-fatal — UI/AI degrade to empty catalog until retry */
    });
  }, []);

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
      case 'exerciseCatalog':
        return <ManageExerciseCatalogPanel />;
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

        <main id="therapist-dashboard-main" className="flex-1 min-h-0 overflow-y-auto">
          {/* Extra bottom padding on mobile so content isn't hidden behind bottom nav */}
          <div className="h-full [padding-bottom:env(safe-area-inset-bottom)] pb-14 md:pb-0">
            <ErrorBoundary variant="section" scopeLabel="סביבת עבודה">
              {renderContent()}
            </ErrorBoundary>
          </div>
        </main>

        {/* Mobile bottom navigation */}
        <MobileBottomNav onOpenSidebar={openMobileDrawer} />
      </div>
    </div>
  );
}
