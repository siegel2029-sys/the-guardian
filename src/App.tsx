import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PatientProvider } from './context/PatientContext';
import { AppRoutes } from './components/ProtectedRoute';

/**
 * Patient list scope follows auth: therapist dashboard vs patient portal.
 * Must render inside AuthProvider.
 */
function PatientRouterShell() {
  const { sessionRole, patientSessionId, therapistPatientScopeIds } = useAuth();
  const therapistScopeIds =
    sessionRole === 'patient'
      ? null
      : therapistPatientScopeIds.length > 0
        ? therapistPatientScopeIds
        : null;
  const restrictPatientSessionId = sessionRole === 'patient' ? patientSessionId : null;

  return (
    <PatientProvider therapistScopeIds={therapistScopeIds} restrictPatientSessionId={restrictPatientSessionId}>
      <BrowserRouter>
        <div className="min-h-dvh antialiased text-base text-slate-900">
          <AppRoutes />
        </div>
      </BrowserRouter>
    </PatientProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <PatientRouterShell />
    </AuthProvider>
  );
}
