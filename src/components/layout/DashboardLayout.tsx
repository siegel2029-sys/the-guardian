import Sidebar from './Sidebar';
import Header from './Header';
import PatientOverview from '../dashboard/PatientOverview';
import MessagesPanel from '../dashboard/MessagesPanel';
import ClinicalReportsPanel from '../dashboard/ClinicalReportsPanel';
import HistoryAnalyticsPanel from '../dashboard/HistoryAnalyticsPanel';
import TherapistSettingsPanel from '../dashboard/TherapistSettingsPanel';
import { usePatient } from '../../context/PatientContext';
import type { NavSection } from '../../types';

export default function DashboardLayout() {
  const { activeSection } = usePatient();

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
      default:
        return <PatientOverview />;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: '#F0F9FA' }}>
      {/* Sidebar */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <Header />

        {/* Page Content */}
        <main className="flex-1 min-h-0 overflow-hidden flex flex-col">
          <div className="flex-1 min-h-0 overflow-hidden">{renderContent()}</div>
        </main>
      </div>
    </div>
  );
}
