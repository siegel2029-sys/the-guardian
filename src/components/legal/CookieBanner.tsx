import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Cookie } from 'lucide-react';

/**
 * Cookie-consent banner shown once per browser until the user accepts.
 * Consent is stored in localStorage under {@link COOKIE_CONSENT_STORAGE_KEY}.
 * Must render inside <BrowserRouter> (uses <Link> to the privacy policy).
 */
const COOKIE_CONSENT_STORAGE_KEY = 'physioshield-cookie-consent-v1';

function hasStoredCookieConsent(): boolean {
  try {
    return window.localStorage.getItem(COOKIE_CONSENT_STORAGE_KEY) !== null;
  } catch {
    // localStorage unavailable (private mode / blocked) — don't nag on every render.
    return true;
  }
}

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    setVisible(!hasStoredCookieConsent());
  }, []);

  const handleAccept = () => {
    try {
      window.localStorage.setItem(
        COOKIE_CONSENT_STORAGE_KEY,
        JSON.stringify({ accepted: true, at: new Date().toISOString() })
      );
    } catch {
      /* ignore — banner still hides for this session */
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="region"
      aria-label="הודעה על שימוש בעוגיות"
      dir="rtl"
      // z-[60]: above the patient portal nav (z-[35]) and therapist mobile nav (z-40),
      // below the legal onboarding modal (z-[210]).
      className="fixed bottom-0 inset-x-0 z-[60] border-t border-teal-100 bg-white/95 backdrop-blur shadow-[0_-4px_16px_rgba(15,23,42,0.08)]"
      style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
    >
      <div className="max-w-4xl mx-auto px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="flex items-start gap-3 flex-1">
          <Cookie className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-sm text-slate-600 leading-relaxed">
            {/* TODO: Insert Hebrew Legal Text — final cookie-usage wording */}
            אנחנו משתמשים בעוגיות (Cookies) ובאחסון מקומי כדי להפעיל את האפליקציה, לשמור על החיבור
            שלך ולשפר את חוויית השימוש. למידע נוסף ראו את{' '}
            <Link
              to="/privacy"
              className="text-teal-700 font-medium underline underline-offset-2 hover:text-teal-800 transition-colors"
            >
              מדיניות הפרטיות
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={handleAccept}
          className="shrink-0 self-end sm:self-auto rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-sm font-semibold px-5 py-2 shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
        >
          אישור
        </button>
      </div>
    </div>
  );
}
