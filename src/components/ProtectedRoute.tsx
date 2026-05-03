import { Navigate, Route, Routes } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { hasPersistedSupabaseAuthSession } from '../lib/supabase';
import LoginPage from './auth/LoginPage';
import DashboardLayout from './layout/DashboardLayout';
import PatientDailyView from './patient/PatientDailyView';
import AccessibilityPage from './AccessibilityPage';

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
 * Always waits for the Supabase bootstrap to finish so sessionRole is known before routing.
 */
function useRouteAccess() {
  const { isAuthenticated, hasSupabaseSession, isLoading } = useAuth();
  const persistedJwt = hasPersistedSupabaseAuthSession();
  const allow = isAuthenticated || hasSupabaseSession || persistedJwt;
  // Always wait while Supabase is bootstrapping — this prevents routing before sessionRole is known.
  const waitForBootstrap = isLoading;
  return { allow, waitForBootstrap, isAuthenticated, hasSupabaseSession, persistedJwt };
}

function RedirectToLogin({ reason }: { reason: string }) {
  console.log(`KICKING USER OUT BECAUSE: ${reason}`);
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
  return <PatientDailyView />;
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
  return <DashboardLayout />;
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
      <Route path="/accessibility" element={<AccessibilityPage />} />
      <Route path="/shop" element={<Navigate to="/patient-portal/gear" replace />} />
      <Route path="/patient-portal/*" element={<PatientPortalRoute />} />
      <Route path="/therapist" element={<TherapistRoute />} />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}
