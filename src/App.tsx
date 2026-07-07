import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PatientProvider } from './context/PatientContext';
import { AppRoutes } from './components/ProtectedRoute';
import { PatientDidYouKnowProvider } from './components/patient/PatientDidYouKnowPortal';
import CookieBanner from './components/legal/CookieBanner';
import LegalOnboardingModal from './components/legal/LegalOnboardingModal';
import { hasPersistedSupabaseAuthSession } from './lib/supabase';

/**
 * Patient list scope follows auth: therapist dashboard vs patient portal.
 * Must render inside AuthProvider.
 */
function PatientRouterShell() {
  const { sessionRole, patientSessionId, therapistPatientScopeIds, isAuthenticated, hasSupabaseSession } = useAuth();
  const therapistScopeIds =
    sessionRole === 'patient'
      ? null
      : therapistPatientScopeIds.length > 0
        ? therapistPatientScopeIds
        : null;
  const restrictPatientSessionId = sessionRole === 'patient' ? patientSessionId : null;

  // Unauthenticated visitors (login page) don't need the heavy PatientProvider —
  // skipping it avoids roster bootstrap, timers and cloud sync work before login.
  const hasAnyCredential = isAuthenticated || hasSupabaseSession || hasPersistedSupabaseAuthSession();
  if (!hasAnyCredential) {
    return (
      <BrowserRouter>
        <div className="min-h-dvh antialiased text-base text-slate-900">
          <AppRoutes />
          <CookieBanner />
        </div>
      </BrowserRouter>
    );
  }

  return (
    <PatientProvider therapistScopeIds={therapistScopeIds} restrictPatientSessionId={restrictPatientSessionId}>
      <BrowserRouter>
        <PatientDidYouKnowProvider>
          <div className="min-h-dvh antialiased text-base text-slate-900">
            <AppRoutes />
            <CookieBanner />
            {/* Mandatory legal gate — self-hides for users who already accepted. */}
            <LegalOnboardingModal />
          </div>
        </PatientDidYouKnowProvider>
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
