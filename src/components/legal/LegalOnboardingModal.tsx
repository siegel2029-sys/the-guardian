import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Loader2, ScrollText, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  acceptLegalTerms,
  fetchLegalConsentStatus,
  hasAcceptedAllLegalTerms,
} from '../../services/legalConsent';
import { isLegalPagePath } from './legalPaths';

/**
 * Mandatory legal onboarding gate.
 *
 * Renders a non-dismissible, full-screen modal for authenticated users whose
 * `profiles` row does not yet have all legal-consent flags set. There is no
 * close button and no backdrop dismiss — the only way through is checking all
 * three boxes and pressing "Continue", which persists the consent via
 * {@link acceptLegalTerms}.
 *
 * Self-gating: safe to mount unconditionally inside <BrowserRouter>; it renders
 * nothing for unauthenticated visitors or users who already accepted.
 */

type GateState = 'checking' | 'required' | 'accepted';

export default function LegalOnboardingModal() {
  const { sessionRole, hasSupabaseSession, therapist } = useAuth();
  const location = useLocation();
  const isLegalPage = isLegalPagePath(location.pathname);

  // Consent lives on public.profiles, which only therapist accounts own
  // (patients are blocked by RLS and have no profiles row).
  const userId = sessionRole === 'therapist' && hasSupabaseSession ? (therapist?.id ?? null) : null;

  const [gate, setGate] = useState<GateState>('checking');
  const [isOver18, setIsOver18] = useState(false);
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const [acceptsDisclaimer, setAcceptsDisclaimer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId || !isSupabaseConfigured) {
      setGate('checking');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const status = await fetchLegalConsentStatus(userId);
        if (cancelled) return;
        // Missing row / missing flags both mean the user must go through the gate.
        setGate(status && hasAcceptedAllLegalTerms(status) ? 'accepted' : 'required');
      } catch (err) {
        if (cancelled) return;
        // Fail open on read errors: never lock users out because a status fetch failed.
        console.error('[LegalOnboardingModal] Failed to load consent status', err);
        setGate('accepted');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  // Legal document pages must remain readable without accepting terms first.
  if (!userId || gate !== 'required' || isLegalPage) return null;

  const allChecked = isOver18 && acceptsTerms && acceptsDisclaimer;

  const handleContinue = async () => {
    if (!allChecked || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await acceptLegalTerms(userId);
      setGate('accepted');
    } catch (err) {
      console.error('[LegalOnboardingModal] Failed to save consent', err);
      setSaveError('שמירת האישור נכשלה. בדקו את החיבור לאינטרנט ונסו שוב.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-onboarding-title"
      dir="rtl"
      lang="he"
    >
      <div className="w-full max-w-2xl max-h-[92dvh] flex flex-col bg-white rounded-2xl shadow-2xl border border-teal-100 overflow-hidden">
        <header className="px-6 py-4 border-b border-teal-100 bg-gradient-to-l from-teal-50 to-emerald-50 flex items-center gap-3">
          <div
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl shadow shrink-0"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            <ScrollText className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div>
            <h2 id="legal-onboarding-title" className="text-lg font-bold text-slate-800">
              תנאי שימוש והצהרה רפואית
            </h2>
            <p className="text-xs text-slate-500">
              כדי להמשיך להשתמש ב־PHYSIOSHIELD יש לקרוא ולאשר את התנאים הבאים.
            </p>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-5">
          <section aria-labelledby="legal-disclaimer-heading">
            <h3
              id="legal-disclaimer-heading"
              className="flex items-center gap-2 text-sm font-semibold text-slate-700 mb-2"
            >
              <ShieldAlert className="w-4 h-4 text-amber-600" aria-hidden="true" />
              הצהרה רפואית (Medical Disclaimer)
            </h3>
            <div
              className="h-44 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 leading-relaxed"
              tabIndex={0}
              role="document"
              aria-label="נוסח ההצהרה הרפואית"
            >
              {/* TODO: Insert Hebrew Legal Text — full Medical Disclaimer goes here */}
              <p>
                [כאן יופיע הנוסח המלא של ההצהרה הרפואית: האפליקציה אינה מהווה ייעוץ רפואי, אינה
                מחליפה טיפול רפואי מקצועי או טיפול חירום, ויש להתאמן בסביבה בטוחה בהתאם להנחיות
                המטפל/ת.]
              </p>
            </div>
          </section>

          <fieldset className="space-y-3">
            <legend className="sr-only">אישורים נדרשים</legend>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 hover:border-teal-200 transition-colors p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isOver18}
                onChange={(e) => setIsOver18(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              />
              <span className="text-sm text-slate-700 leading-relaxed">אני מעל גיל 18.</span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 hover:border-teal-200 transition-colors p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptsTerms}
                onChange={(e) => setAcceptsTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              />
              <span className="text-sm text-slate-700 leading-relaxed">
                אני מקבל/ת את{' '}
                <Link
                  to="/legal/terms-of-use"
                  className="text-teal-700 underline underline-offset-2 hover:text-teal-800"
                >
                  תנאי השימוש
                </Link>
                ,{' '}
                <Link
                  to="/legal/privacy-policy"
                  className="text-teal-700 underline underline-offset-2 hover:text-teal-800"
                >
                  מדיניות הפרטיות
                </Link>
                ,{' '}
                <Link
                  to="/legal/medical-disclaimer"
                  className="text-teal-700 underline underline-offset-2 hover:text-teal-800"
                >
                  ההצהרה הרפואית
                </Link>{' '}
                ו
                <Link
                  to="/legal/refund-policy"
                  className="text-teal-700 underline underline-offset-2 hover:text-teal-800"
                >
                  מדיניות הביטולים וההחזרים
                </Link>
                .
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 hover:border-teal-200 transition-colors p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptsDisclaimer}
                onChange={(e) => setAcceptsDisclaimer(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              />
              <span className="text-sm text-slate-700 leading-relaxed">
                קראתי את ההצהרה הרפואית, אני מבין/ה שהאפליקציה אינה מחליפה טיפול רפואי חירום, ואני
                מתחייב/ת להתאמן בסביבה בטוחה.
              </span>
            </label>
          </fieldset>

          {saveError && (
            <p role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              {saveError}
            </p>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-slate-100 bg-white">
          <button
            type="button"
            onClick={handleContinue}
            disabled={!allChecked || saving}
            className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-3 shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                שומרים את האישור...
              </span>
            ) : (
              'אישור והמשך'
            )}
          </button>
          {!allChecked && (
            <p className="text-center text-xs text-slate-400 mt-2">
              יש לסמן את שלוש התיבות כדי להמשיך.
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
