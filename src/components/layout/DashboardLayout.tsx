import Sidebar from './Sidebar';
import Header from './Header';
import PatientOverview from '../dashboard/PatientOverview';
import MessagesPanel from '../dashboard/MessagesPanel';
import ExercisesPanel from '../dashboard/ExercisesPanel';
import TherapistSettingsPanel from '../dashboard/TherapistSettingsPanel';
import PlaceholderPanel from '../dashboard/PlaceholderPanel';
import { usePatient } from '../../context/PatientContext';

export default function DashboardLayout() {
  const { activeSection } = usePatient();

  const renderContent = () => {
    switch (activeSection) {
      case 'overview':
        return <PatientOverview />;
      case 'messages':
        return <MessagesPanel />;
      case 'exercises':
        return <ExercisesPanel />;
      case 'pain-report':
        return (
          <PlaceholderPanel
            title="דוח כאב מתקדם"
            description="ניתוח כאב מפורט עם גרפים, מגמות, ודגלים אדומים ייבנו בשלב 2."
            phase="שלב 2 – בפיתוח"
          />
        );
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
        <main className="flex-1 overflow-hidden">
          {renderContent()}
        </main>
      </div>
    </div>
  );
}
