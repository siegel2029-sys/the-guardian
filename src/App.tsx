import { Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PatientProvider } from './context/PatientContext';
import LoginPage from './components/auth/LoginPage';
import DashboardLayout from './components/layout/DashboardLayout';
import PatientDailyView from './components/patient/PatientDailyView';

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
    <PatientProvider therapistScopeId={null} restrictPatientSessionId={patientSessionId}>
      <PatientDailyView />
    </PatientProvider>
  );
}

function TherapistRoute() {
  const { isAuthenticated, sessionRole, therapist } = useAuth();
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  if (sessionRole === 'patient') {
    return <Navigate to="/patient-portal" replace />;
  }
  return (
    <PatientProvider therapistScopeId={therapist?.id ?? null} restrictPatientSessionId={null}>
      <DashboardLayout />
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
      <Route path="/shop" element={<Navigate to="/patient-portal/gear" replace />} />
      <Route path="/patient-portal/*" element={<PatientPortalRoute />} />
      <Route path="/therapist" element={<TherapistRoute />} />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <div className="min-h-dvh antialiased text-base text-slate-900">
        <AppRoutes />
      </div>
    </AuthProvider>
  );
}
