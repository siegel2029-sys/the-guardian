/**
 * Patient portal path ↔ tab helpers + loading gate constants
 * (extracted from PatientDailyView for maintainability).
 */
import { useEffect, useState } from 'react';

export type PortalTab = 'home' | 'activity' | 'gear' | 'messages';

export function tabFromPortalPath(pathname: string): PortalTab {
  const idx = pathname.indexOf('/patient-portal');
  if (idx === -1) return 'home';
  const rest = pathname.slice(idx + '/patient-portal'.length).replace(/^\/+|\/+$/g, '');
  if (!rest) return 'home';
  if (rest === 'activity' || rest === 'gear' || rest === 'messages') return rest;
  return 'home';
}

export function portalHrefForTab(tab: PortalTab): string {
  if (tab === 'home') return '/patient-portal';
  return `/patient-portal/${tab}`;
}

/** אזור לחיצה נוח לאגודל + משוב ויזואלי לכרטיסי ניווט */
export const PORTAL_PROGRESS_NAV_SURFACE =
  'cursor-pointer touch-manipulation select-none motion-safe:transition-[transform,opacity] duration-200 ease-out motion-safe:hover:scale-[1.02] motion-safe:active:scale-[0.98] motion-safe:hover:opacity-[0.94] motion-safe:active:opacity-[0.88] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-medical-primary';

export function activateOnEnterSpace(
  e: { key: string; preventDefault: () => void },
  fn: () => void,
): void {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    fn();
  }
}

export function portalTrainingAiPlanModalAckKey(patientId: string, clinicalDay: string): string {
  return `portal_training_ai_adjustment_ack_${patientId}_${clinicalDay}`;
}

export const PATIENT_LOAD_TIMEOUT_MS = 18_000;

/**
 * Spinner shown while patient data loads from Supabase.
 * After PATIENT_LOAD_TIMEOUT_MS a fallback message + logout button appear so
 * the user can never be permanently frozen on a blank screen.
 */
export function PatientLoadingGate({ onLogout }: { onLogout: () => void }) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setTimedOut(true), PATIENT_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 bg-medical-bg font-sans"
      dir="rtl"
    >
      {!timedOut ? (
        <>
          <div
            className="w-10 h-10 rounded-full border-4 border-teal-400 border-t-transparent animate-spin"
            aria-label="טוען נתוני מטופל"
          />
          <p className="text-sm text-slate-500">טוען נתוני מטופל…</p>
        </>
      ) : (
        <>
          <p className="text-sm font-semibold text-slate-700">הטעינה נמשכת יותר מהצפוי.</p>
          <p className="text-xs text-slate-500 text-center max-w-xs">
            ייתכן שיש בעיית חיבור לשרת. נסו להתנתק ולהתחבר מחדש.
          </p>
        </>
      )}
      <button
        type="button"
        onClick={onLogout}
        className="mt-4 px-5 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold shadow-sm hover:bg-slate-50 active:scale-95 transition-transform"
      >
        התנתקות
      </button>
    </div>
  );
}
