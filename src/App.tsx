import { AuthProvider, useAuth } from './context/AuthContext';
import { PatientProvider, usePatient } from './context/PatientContext';
import LoginPage from './components/auth/LoginPage';
import DashboardLayout from './components/layout/DashboardLayout';
import PatientDailyView from './components/patient/PatientDailyView';

function PatientShell() {
  const { viewMode } = usePatient();
  if (viewMode === 'patient') {
    return <PatientDailyView />;
  }
  return <DashboardLayout />;
}

function AppContent() {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  return (
    <PatientProvider>
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
