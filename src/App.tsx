import { BrowserRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { PatientProvider } from './context/PatientContext';
import { AppRoutes } from './components/ProtectedRoute';
import { PatientDidYouKnowProvider } from './components/patient/PatientDidYouKnowPortal';
import CookieBanner from './components/legal/CookieBanner';
import LegalOnboardingModal from './components/legal/LegalOnboardingModal';
import GlobalModalScrollLock from './components/ui/GlobalModalScrollLock';
import { hasPersistedSupabaseAuthSession } from './lib/supabase';
import { FREEMIUM_GUEST_SESSION_LOCK } from './context/patientContextRoster';

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
  // Clinic pro: lock to patient id. Freemium (patient role, no clinic id): sentinel empty roster.
  const restrictPatientSessionId =
    sessionRole === 'patient'
      ? patientSessionId?.trim() || FREEMIUM_GUEST_SESSION_LOCK
      : null;
  const isFreemiumGuest = restrictPatientSessionId === FREEMIUM_GUEST_SESSION_LOCK;

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

  const routes = (
    <div className="min-h-dvh antialiased text-base text-slate-900">
      <AppRoutes />
      <CookieBanner />
      {/* Mandatory legal gate — self-hides for users who already accepted. */}
      <LegalOnboardingModal />
    </div>
  );

  return (
    <PatientProvider therapistScopeIds={therapistScopeIds} restrictPatientSessionId={restrictPatientSessionId}>
      <BrowserRouter>
        {/* Freemium has no clinic patient — skip DidYouKnow (needs selected patient + KB). */}
        {isFreemiumGuest ? routes : <PatientDidYouKnowProvider>{routes}</PatientDidYouKnowProvider>}
      </BrowserRouter>
    </PatientProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      {/* Freezes document scroll whenever any modal/dialog/drawer is open. */}
      <GlobalModalScrollLock />
      <PatientRouterShell />
    </AuthProvider>
  );
}
