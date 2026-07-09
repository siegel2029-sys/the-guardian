import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { hasPersistedSupabaseAuthSession } from '../lib/supabase';
import LoginPage from './auth/LoginPage';
import AccessibilityPage from './AccessibilityPage';
import TermsOfUse from './legal/TermsOfUse';
import PrivacyPolicy from './legal/PrivacyPolicy';
import MedicalDisclaimer from './legal/MedicalDisclaimer';
import RefundPolicy from './legal/RefundPolicy';
import PatientLegalGate from './legal/PatientLegalGate';
import PatientPortalLayout from './patient/PatientPortalLayout';
import { LEGAL_PAGE_PATHS } from './legal/legalPaths';

// Route-level code splitting: the therapist dashboard and patient portal pull in
// Three.js, Recharts and large feature trees — keep them out of the login bundle.
const DashboardLayout = lazy(() => import('./layout/DashboardLayout'));
const PatientDailyView = lazy(() => import('./patient/PatientDailyView'));

function AuthLoadingFallback() {
  return (
    <div className="min-h-dvh flex items-center justify-center bg-slate-50">
      <Loader2 className="w-8 h-8 animate-spin text-slate-400" aria-label="טוען" />
    </div>
  );
}

/**
 * Gate access to a route: `allow` means a credential exists; `waitForBootstrap` means
 * auth is still resolving and we should show a spinner rather than redirect.
 *
 * A 300 ms grace period is applied when `allow` transitions from true → false.
 * This covers the brief SIGNED_OUT → SIGNED_IN window that Supabase fires during
 * every `signInWithPassword` call (old session is evicted before the new one arrives).
 * Without this, ProtectedRoute would redirect to /login for ~50–200 ms mid-login.
 */
function useRouteAccess() {
  const { isAuthenticated, hasSupabaseSession, isLoading } = useAuth();
  const persistedJwt = hasPersistedSupabaseAuthSession();
  const allow = isAuthenticated || hasSupabaseSession || persistedJwt;

  // Debounced "stable allow" — only acts on allow=false after a 300 ms cooldown.
  const [stableAllow, setStableAllow] = useState(allow);
  const [gracePending, setGracePending] = useState(false);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (allow) {
      // Immediately propagate allow=true and cancel any pending grace timer.
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
      setStableAllow(true);
      setGracePending(false);
    } else {
      // Don't propagate allow=false immediately — give auth a chance to stabilise.
      setGracePending(true);
      graceTimerRef.current = setTimeout(() => {
        setStableAllow(false);
        setGracePending(false);
        graceTimerRef.current = null;
      }, 300);
    }
    return () => {
      if (graceTimerRef.current) {
        clearTimeout(graceTimerRef.current);
        graceTimerRef.current = null;
      }
    };
  }, [allow]);

  // Always wait while Supabase is bootstrapping OR during the grace period.
  const waitForBootstrap = isLoading || gracePending;
  return { allow: stableAllow, waitForBootstrap, isAuthenticated, hasSupabaseSession, persistedJwt };
}

function RedirectToLogin({ reason }: { reason: string }) {
  if (import.meta.env.DEV) {
    console.log(`KICKING USER OUT BECAUSE: ${reason}`);
  }
  return <Navigate to="/login" replace />;
}

function LoginRoute() {
  const { sessionRole } = useAuth();
  const { allow, waitForBootstrap } = useRouteAccess();

  if (waitForBootstrap) {
    return <AuthLoadingFallback />;
  }
  if (allow) {
    if (sessionRole === 'patient') {
      return <Navigate to="/patient-portal" replace />;
    }
    return <Navigate to="/therapist" replace />;
  }
  return <LoginPage />;
}

function PatientPortalRoute() {
  const { sessionRole, patientSessionId } = useAuth();
  const { allow, waitForBootstrap } = useRouteAccess();

  if (waitForBootstrap) {
    return <AuthLoadingFallback />;
  }
  if (!allow) {
    return <RedirectToLogin reason="PatientPortalRoute: !allow (no session / not authenticated)" />;
  }
  if (sessionRole !== 'patient' || !patientSessionId) {
    return <Navigate to="/therapist" replace />;
  }
  return (
    <PatientLegalGate>
      <PatientPortalLayout>
        <Suspense fallback={<AuthLoadingFallback />}>
          <PatientDailyView />
        </Suspense>
      </PatientPortalLayout>
    </PatientLegalGate>
  );
}

function TherapistRoute() {
  const { sessionRole } = useAuth();
  const { allow, waitForBootstrap } = useRouteAccess();

  if (waitForBootstrap) {
    return <AuthLoadingFallback />;
  }
  if (!allow) {
    return <RedirectToLogin reason="TherapistRoute: !allow (no session / not authenticated)" />;
  }
  if (sessionRole === 'patient') {
    return <Navigate to="/patient-portal" replace />;
  }
  // Never mount therapist chrome until the role is positively confirmed —
  // during JWT hydration sessionRole can be null for a moment.
  if (sessionRole !== 'therapist') {
    return <AuthLoadingFallback />;
  }
  return (
    <Suspense fallback={<AuthLoadingFallback />}>
      <DashboardLayout />
    </Suspense>
  );
}

function RootRedirect() {
  const { sessionRole } = useAuth();
  const { allow, waitForBootstrap } = useRouteAccess();

  if (waitForBootstrap) {
    return <AuthLoadingFallback />;
  }
  if (!allow) {
    return <RedirectToLogin reason="RootRedirect: !allow (no session / not authenticated)" />;
  }
  if (sessionRole === 'patient') {
    return <Navigate to="/patient-portal" replace />;
  }
  return <Navigate to="/therapist" replace />;
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      {/* Public legal pages — accessible without consent acceptance. */}
      <Route path={LEGAL_PAGE_PATHS[0]} element={<TermsOfUse />} />
      <Route path={LEGAL_PAGE_PATHS[1]} element={<PrivacyPolicy />} />
      <Route path={LEGAL_PAGE_PATHS[2]} element={<MedicalDisclaimer />} />
      <Route path={LEGAL_PAGE_PATHS[3]} element={<RefundPolicy />} />
      <Route path={LEGAL_PAGE_PATHS[4]} element={<AccessibilityPage />} />
      {/* Legacy path redirects → canonical /legal/* URLs */}
      <Route path="/terms" element={<Navigate to="/legal/terms-of-use" replace />} />
      <Route path="/privacy" element={<Navigate to="/legal/privacy-policy" replace />} />
      <Route path="/medical-disclaimer" element={<Navigate to="/legal/medical-disclaimer" replace />} />
      <Route path="/refund-policy" element={<Navigate to="/legal/refund-policy" replace />} />
      <Route path="/accessibility" element={<Navigate to="/legal/accessibility" replace />} />
      <Route path="/shop" element={<Navigate to="/patient-portal/gear" replace />} />
      <Route path="/patient-portal/*" element={<PatientPortalRoute />} />
      <Route path="/therapist" element={<TherapistRoute />} />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
