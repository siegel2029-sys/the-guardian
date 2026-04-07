import { AuthProvider, useAuth } from './context/AuthContext';
import { PatientProvider, usePatient } from './context/PatientContext';
import LoginPage from './components/auth/LoginPage';
import DashboardLayout from './components/layout/DashboardLayout';
import PatientDailyView from './components/patient/PatientDailyView';

function PatientShell() {
  const { sessionRole } = useAuth();
  const { viewMode } = usePatient();

  /** מטופל מחובר — תמיד תצוגת מטופל בלבד (לא ניתן לגשת לדשבורד מטפל) */
  if (sessionRole === 'patient') {
    return <PatientDailyView />;
  }

  if (viewMode === 'patient') {
    return <PatientDailyView />;
  }
  return <DashboardLayout />;
}

function AppContent() {
  const { isAuthenticated, sessionRole, patientSessionId } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  const restrictPatientId = sessionRole === 'patient' ? patientSessionId : null;

  return (
    <PatientProvider restrictPatientSessionId={restrictPatientId}>
      <PatientShell />
    </PatientProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
