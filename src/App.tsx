import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PatientProvider, usePatient } from './context/PatientContext';
import LoginPage from './components/auth/LoginPage';
import DashboardLayout from './components/layout/DashboardLayout';
import PatientDailyView from './components/patient/PatientDailyView';

function TherapistShell() {
  const { viewMode } = usePatient();
  if (viewMode === 'patient') {
    return <PatientDailyView />;
  }
  return <DashboardLayout />;
}

function LoginRoute() {
  const { isAuthenticated, sessionRole } = useAuth();
  if (isAuthenticated) {
    if (sessionRole === 'patient') {
      return <Navigate to="/patient-portal" replace />;
    }
    return <Navigate to="/therapist" replace />;
  }
  return <LoginPage />;
}

function PatientPortalRoute() {
  const { isAuthenticated, sessionRole, patientSessionId } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (sessionRole !== 'patient' || !patientSessionId) {
    return <Navigate to="/therapist" replace />;
  }
  return (
    <PatientProvider restrictPatientSessionId={patientSessionId}>
      <PatientDailyView variant="portal" />
    </PatientProvider>
  );
}

function TherapistRoute() {
  const { isAuthenticated, sessionRole } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (sessionRole === 'patient') {
    return <Navigate to="/patient-portal" replace />;
  }
  return (
    <PatientProvider restrictPatientSessionId={null}>
      <TherapistShell />
    </PatientProvider>
  );
}

function RootRedirect() {
  const { isAuthenticated, sessionRole } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (sessionRole === 'patient') {
    return <Navigate to="/patient-portal" replace />;
  }
  return <Navigate to="/therapist" replace />;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/patient-portal" element={<PatientPortalRoute />} />
      <Route path="/therapist" element={<TherapistRoute />} />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
