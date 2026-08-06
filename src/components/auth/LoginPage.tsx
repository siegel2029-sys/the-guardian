import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Shield,
  Eye,
  EyeOff,
  Mail,
  Lock,
  AlertCircle,
  UserRound,
  CheckCircle2,
  ArrowLeft,
  ClipboardList,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { THERAPIST_LOGIN_HUB_LANDING_SESSION_KEY } from '../../context/PatientContext';

type AuthCardMode = 'login' | 'signup';

/** UX gate only — real gate is Edge REGISTER_THERAPIST_SECRET (same value in .env). */
const THERAPIST_REGISTRATION_SECRET =
  (import.meta.env.VITE_THERAPIST_REGISTER_SECRET as string | undefined)?.trim() ?? '';

const VERIFY_EMAIL_SUCCESS_HE =
  'נשלח אליכם מייל לאימות כתובת הדוא״ל. לאחר לחיצה על הקישור במייל תוכלו לחזור לכאן ולהתחבר. אם אינכם רואים את המייל, בדקו גם בתיקיית הספאם.';

const INPUT_CLASS =
  'w-full min-h-[48px] pr-10 pl-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus:border-teal-500 transition-colors';

const PRIMARY_BTN_CLASS =
  'w-full min-h-[48px] rounded-xl bg-teal-600 text-white font-semibold text-base transition-colors hover:bg-teal-700 active:bg-teal-800 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 shadow-sm';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, signUp, isLoading, loginError, clearLoginError } = useAuth();

  const [mode, setMode] = useState<AuthCardMode>('login');
  const [signUpStep, setSignUpStep] = useState<'form' | 'check_email'>('form');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showHint, setShowHint] = useState(false);
  const [pinGateError, setPinGateError] = useState(false);

  const [fullName, setFullName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [showSignUpPassword, setShowSignUpPassword] = useState(false);

  const switchMode = (next: AuthCardMode) => {
    clearLoginError();
    setSignUpStep('form');
    setMode(next);
    if (next === 'login') {
      setPinGateError(false);
    }
  };

  const handleTherapistRegistrationClick = () => {
    setPinGateError(false);
    if (!THERAPIST_REGISTRATION_SECRET) {
      setPinGateError(true);
      return;
    }
    const entered = window.prompt('הזינו קוד הרשמת מטפל');
    if (entered === null) return;
    const normalized = entered.trim();
    if (normalized === THERAPIST_REGISTRATION_SECRET) {
      switchMode('signup');
      return;
    }
    setPinGateError(true);
  };

  const handleLoginSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const role = await login(email, password);
    if (role === 'therapist') {
      try {
        sessionStorage.setItem(THERAPIST_LOGIN_HUB_LANDING_SESSION_KEY, '1');
      } catch {
        /* ignore */
      }
      navigate('/therapist', { replace: true });
    } else if (role === 'patient') {
      navigate('/patient-portal', { replace: true });
    }
  };

  const handleSignUpSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await signUp(signUpEmail, signUpPassword, fullName);
    if (result === 'session') {
      try {
        sessionStorage.setItem(THERAPIST_LOGIN_HUB_LANDING_SESSION_KEY, '1');
      } catch {
        /* ignore */
      }
      navigate('/therapist', { replace: true });
      return;
    }
    if (result === 'verify_email') {
      setSignUpStep('check_email');
    }
  };

  return (
    <div
      dir="rtl"
      className="min-h-dvh flex items-center justify-center p-4 sm:p-6 bg-gradient-to-b from-teal-50 via-slate-50 to-white"
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
        <div
          className="absolute top-[-12%] right-[-8%] w-[380px] h-[380px] rounded-full opacity-25"
          style={{ background: 'radial-gradient(circle, #99f6e4, transparent 70%)' }}
        />
        <div
          className="absolute bottom-[-14%] left-[-10%] w-[320px] h-[320px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #cbd5e1, transparent 70%)' }}
        />
      </div>

      <div className="relative w-full max-w-md">
        <header className="text-center mb-6 sm:mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 sm:w-20 sm:h-20 rounded-2xl mb-3 sm:mb-4 shadow-md bg-gradient-to-br from-teal-600 to-emerald-600">
            <Shield className="w-8 h-8 sm:w-10 sm:h-10 text-white" aria-hidden />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
            PHYSIOSHIELD
          </h1>
          <p className="text-slate-600 mt-1.5 text-sm sm:text-base leading-relaxed">
            שיקום דיגיטלי מותאם אישית
          </p>
        </header>

        {mode === 'login' ? (
          <div className="space-y-4">
            {/* Returning users — login first */}
            <section
              aria-labelledby="login-form-title"
              className="relative rounded-2xl border border-teal-200 bg-white p-5 sm:p-6 shadow-sm"
            >
              <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex flex-col items-start gap-0.5">
                <button
                  type="button"
                  onClick={handleTherapistRegistrationClick}
                  className="text-xs text-slate-400 hover:text-slate-600 transition-colors min-h-[32px] px-1.5 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                >
                  רישום צוות
                </button>
                {pinGateError && (
                  <p className="text-xs text-red-500 px-1.5" role="status">
                    קוד שגוי
                  </p>
                )}
              </div>

              <div className="mb-5 text-right">
                <h2 id="login-form-title" className="text-lg font-bold text-slate-900">
                  כניסה למערכת
                </h2>
              </div>

              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label htmlFor="login-identifier" className="block text-sm font-semibold text-slate-800 mb-1.5">
                    שם משתמש
                  </label>
                  <div className="relative">
                    <UserRound
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                      aria-hidden
                    />
                    <input
                      id="login-identifier"
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="username"
                      placeholder="אימייל מטופל / מטפל, או מזהה פורטל ישן"
                      className={INPUT_CLASS}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-sm font-semibold text-slate-800 mb-1.5">
                    סיסמה
                  </label>
                  {/* Login: no minLength — existing accounts may use legacy shorter passwords. */}
                  <div className="relative">
                    <Lock
                      className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                      aria-hidden
                    />
                    <input
                      id="login-password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className={`${INPUT_CLASS} pl-10`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-700 transition-colors p-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                      tabIndex={-1}
                      aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                    >
                      {showPassword ? (
                        <EyeOff className="w-4 h-4" aria-hidden />
                      ) : (
                        <Eye className="w-4 h-4" aria-hidden />
                      )}
                    </button>
                  </div>
                </div>

                {loginError && (
                  <div
                    className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm"
                    role="alert"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
                    <span>{loginError}</span>
                  </div>
                )}

                <button type="submit" disabled={isLoading} className={PRIMARY_BTN_CLASS}>
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden>
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="4"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      מתחבר...
                    </span>
                  ) : (
                    'כניסה למערכת'
                  )}
                </button>

                <div className="text-center">
                  <button
                    type="button"
                    onClick={() => setShowHint((v) => !v)}
                    className="text-sm font-medium text-teal-700 hover:text-teal-900 hover:underline transition-colors min-h-[44px] px-2"
                  >
                    שכחת סיסמה?
                  </button>
                </div>

                {showHint && (
                  <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-sm text-teal-800 text-right space-y-2 leading-relaxed">
                    {import.meta.env.DEV && import.meta.env.VITE_USE_LEGACY_AUTH === 'true' ? (
                      <>
                        <p className="font-medium">מצב פיתוח — אימות legacy מקומי</p>
                        <p className="text-xs">
                          הגדירו סיסמאות בקובץ <span className="font-mono">.env</span> בלבד:{' '}
                          <span className="font-mono">VITE_DEMO_THERAPIST_A_PASSWORD</span>,{' '}
                          <span className="font-mono">VITE_DEMO_THERAPIST_B_PASSWORD</span>,{' '}
                          <span className="font-mono">VITE_DEMO_SEED_PATIENT_PORTAL_PASSWORD</span> — לא מוצגות כאן.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs">
                        אם שכחתם את הסיסמה, פנו למנהל המערכת או לאיפוס דרך הארגון. סיסמאות אינן מוצגות באפליקציה.
                      </p>
                    )}
                  </div>
                )}
              </form>
            </section>

            {/* New visitors — questionnaire CTA */}
            <section
              aria-labelledby="join-cta-title"
              className="rounded-2xl border border-teal-200 bg-white p-5 sm:p-6 shadow-sm"
            >
              <div className="flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-700 border border-teal-100">
                  <ClipboardList className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 text-right flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700">
                    חדשים כאן?
                  </p>
                  <h2 id="join-cta-title" className="mt-0.5 text-lg font-bold text-slate-900">
                    התחילו בשאלון קצר
                  </h2>
                  <p className="mt-1.5 text-sm text-slate-600 leading-relaxed">
                    מספר שאלות קליניות קצרות יעזרו לנו להבין את המצב ולהתאים לכם את המסלול הנכון.
                  </p>
                </div>
              </div>
              <Link
                to="/join"
                className={`${PRIMARY_BTN_CLASS} mt-4 inline-flex items-center justify-center gap-2 group`}
              >
                התחילו עכשיו
                <ArrowLeft
                  className="h-4 w-4 transition-transform group-hover:-translate-x-0.5"
                  aria-hidden
                />
              </Link>
            </section>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-sm">
            {signUpStep === 'check_email' ? (
              <div className="space-y-5 text-right">
                <div className="flex flex-col items-center gap-3 pt-1">
                  <div
                    className="flex h-14 w-14 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50"
                    aria-hidden
                  >
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                  </div>
                  <h2 className="text-xl font-semibold text-slate-800 w-full text-center">כמעט סיימנו</h2>
                </div>
                <p className="text-slate-600 text-sm leading-relaxed">{VERIFY_EMAIL_SUCCESS_HE}</p>
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className={PRIMARY_BTN_CLASS}
                >
                  מעבר למסך כניסה
                </button>
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-2 mb-6 text-right">
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="self-start text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors min-h-[40px]"
                  >
                    חזרה לכניסה
                  </button>
                  <h2 className="text-xl font-bold text-slate-900">יצירת חשבון מטפל</h2>
                </div>

                <form onSubmit={handleSignUpSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="signup-fullname" className="block text-sm font-semibold text-slate-800 mb-1.5">
                      שם מלא
                    </label>
                    <div className="relative">
                      <UserRound
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                        aria-hidden
                      />
                      <input
                        id="signup-fullname"
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        placeholder="לדוגמה: ד״ר מיכל לוי"
                        required
                        autoComplete="name"
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="signup-email" className="block text-sm font-semibold text-slate-800 mb-1.5">
                      דוא״ל מקצועי
                    </label>
                    <div className="relative">
                      <Mail
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                        aria-hidden
                      />
                      <input
                        id="signup-email"
                        type="email"
                        value={signUpEmail}
                        onChange={(e) => setSignUpEmail(e.target.value)}
                        placeholder="your.name@clinic.co.il"
                        required
                        autoComplete="email"
                        className={INPUT_CLASS}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="signup-password" className="block text-sm font-semibold text-slate-800 mb-1.5">
                      סיסמה
                    </label>
                    <div className="relative">
                      <Lock
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none"
                        aria-hidden
                      />
                      <input
                        id="signup-password"
                        type={showSignUpPassword ? 'text' : 'password'}
                        value={signUpPassword}
                        onChange={(e) => setSignUpPassword(e.target.value)}
                        placeholder="לפחות 8 תווים, אותיות ומספרים"
                        required
                        minLength={8}
                        autoComplete="new-password"
                        className={`${INPUT_CLASS} pl-10`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowSignUpPassword((v) => !v)}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-700 transition-colors p-1 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
                        tabIndex={-1}
                        aria-label={showSignUpPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                      >
                        {showSignUpPassword ? (
                          <EyeOff className="w-4 h-4" aria-hidden />
                        ) : (
                          <Eye className="w-4 h-4" aria-hidden />
                        )}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5 text-right">
                      הסיסמה נשמרת ב-Supabase ומוגנת לפי מדיניות האבטחה של השרת.
                    </p>
                  </div>

                  {loginError && (
                    <div
                      className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm"
                      role="alert"
                    >
                      <AlertCircle className="w-4 h-4 shrink-0" aria-hidden />
                      <span>{loginError}</span>
                    </div>
                  )}

                  <button type="submit" disabled={isLoading} className={PRIMARY_BTN_CLASS}>
                    {isLoading ? (
                      <span className="flex items-center justify-center gap-2">
                        <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24" aria-hidden>
                          <circle
                            className="opacity-25"
                            cx="12"
                            cy="12"
                            r="10"
                            stroke="currentColor"
                            strokeWidth="4"
                          />
                          <path
                            className="opacity-75"
                            fill="currentColor"
                            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                          />
                        </svg>
                        יוצרים חשבון...
                      </span>
                    ) : (
                      'הרשמה והמשך'
                    )}
                  </button>
                </form>
              </>
            )}
          </div>
        )}

        <footer className="text-center text-xs text-slate-400 mt-6">
          <nav
            aria-label="קישורים משפטיים"
            className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1"
          >
            {[
              { href: '/legal/terms-of-use', label: 'תנאי שימוש' },
              { href: '/legal/privacy-policy', label: 'מדיניות פרטיות' },
              { href: '/legal/medical-disclaimer', label: 'הצהרה רפואית' },
              { href: '/legal/refund-policy', label: 'מדיניות ביטולים והחזרים' },
              { href: '/legal/accessibility', label: 'הצהרת נגישות' },
            ].map((link, i) => (
              <span key={link.href} className="inline-flex items-center gap-2">
                {i > 0 && <span aria-hidden="true">·</span>}
                <Link
                  to={link.href}
                  className="hover:text-teal-700 underline underline-offset-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded"
                >
                  {link.label}
                </Link>
              </span>
            ))}
          </nav>
          <p className="mt-2">© 2026 PHYSIOSHIELD · כל הזכויות שמורות</p>
        </footer>
      </div>
    </div>
  );
}
