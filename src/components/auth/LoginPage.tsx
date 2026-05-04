import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  Eye,
  EyeOff,
  Mail,
  Lock,
  AlertCircle,
  UserRound,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { THERAPIST_LOGIN_HUB_LANDING_SESSION_KEY } from '../../context/PatientContext';

type AuthCardMode = 'login' | 'signup';

const THERAPIST_REGISTRATION_PIN = '1234';

const VERIFY_EMAIL_SUCCESS_HE =
  'נשלח אליכם מייל לאימות כתובת הדוא״ל. לאחר לחיצה על הקישור במייל תוכלו לחזור לכאן ולהתחבר. אם אינכם רואים את המייל, בדקו גם בתיקיית הספאם.';

const inputFocus = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = '#0d9488';
  e.target.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.1)';
};

const inputBlur = (e: React.FocusEvent<HTMLInputElement>) => {
  e.target.style.borderColor = '';
  e.target.style.boxShadow = '';
};

const ringStyle = { '--tw-ring-color': '#0d9488' } as React.CSSProperties;

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
    const entered = window.prompt('הזינו קוד PIN בארבע ספרות');
    if (entered === null) return;
    const normalized = entered.trim();
    if (normalized === THERAPIST_REGISTRATION_PIN) {
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
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #e0f7f9 0%, #f0f9fa 50%, #e8f5f0 100%)' }}
    >
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute top-[-10%] right-[-5%] w-[400px] h-[400px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #0d9488, transparent)' }}
        />
        <div
          className="absolute bottom-[-10%] left-[-5%] w-[350px] h-[350px] rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #10b981, transparent)' }}
        />
      </div>

      <div className="relative w-full max-w-md">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">PHYSIOSHIELD</h1>
          <p className="text-slate-500 mt-1 text-base">פורטל מטפלים מקצועי</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl p-8 border border-teal-100">
          {mode === 'login' ? (
            <>
              <h2 className="text-xl font-semibold text-slate-800 mb-6 text-right">ברוכים הבאים</h2>

              <form onSubmit={handleLoginSubmit} className="space-y-5" dir="rtl">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">שם משתמש</label>
                  <div className="relative">
                    <UserRound className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="username"
                      className="w-full pr-10 pl-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm
                        focus:outline-none focus:ring-2 focus:border-transparent transition-all
                        placeholder:text-slate-400"
                      style={ringStyle}
                      onFocus={inputFocus}
                      onBlur={inputBlur}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">סיסמה</label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                      className="w-full pr-10 pl-10 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm
                        focus:outline-none transition-all placeholder:text-slate-400"
                      onFocus={inputFocus}
                      onBlur={inputBlur}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-600 transition-colors"
                      tabIndex={-1}
                      aria-label={showPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {loginError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl text-white font-semibold text-base transition-all duration-200
                    disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
                  style={{
                    background: isLoading ? '#94a3b8' : 'linear-gradient(135deg, #0d9488, #10b981)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) {
                      (e.target as HTMLButtonElement).style.background =
                        'linear-gradient(135deg, #0f766e, #059669)';
                      (e.target as HTMLButtonElement).style.transform = 'translateY(-1px)';
                      (e.target as HTMLButtonElement).style.boxShadow =
                        '0 8px 20px rgba(13,148,136,0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading) {
                      (e.target as HTMLButtonElement).style.background =
                        'linear-gradient(135deg, #0d9488, #10b981)';
                      (e.target as HTMLButtonElement).style.transform = '';
                      (e.target as HTMLButtonElement).style.boxShadow = '';
                    }
                  }}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
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
                    className="text-sm text-teal-600 hover:text-teal-800 hover:underline transition-colors"
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

              <div className="mt-6 flex flex-col items-center gap-1">
                {pinGateError && (
                  <p className="text-xs text-red-400/90 text-center" role="status">
                    קוד שגוי
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleTherapistRegistrationClick}
                  className="text-xs text-gray-400 hover:text-gray-500 transition-colors"
                >
                  רישום צוות
                </button>
              </div>
            </>
          ) : signUpStep === 'check_email' ? (
            <div className="space-y-5 text-right" dir="rtl">
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
                className="w-full py-3 rounded-xl text-white font-semibold text-base transition-all duration-200 shadow-md"
                style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
              >
                מעבר למסך כניסה
              </button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-2 mb-6 text-right" dir="rtl">
                <button
                  type="button"
                  onClick={() => switchMode('login')}
                  className="self-start text-xs text-slate-400 hover:text-slate-600 transition-colors"
                >
                  חזרה לכניסה
                </button>
                <h2 className="text-xl font-semibold text-slate-800">יצירת חשבון מטפל</h2>
              </div>

              <form onSubmit={handleSignUpSubmit} className="space-y-5" dir="rtl">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">שם מלא</label>
                  <div className="relative">
                    <UserRound className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="לדוגמה: ד״ר מיכל לוי"
                      required
                      autoComplete="name"
                      className="w-full pr-10 pl-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm
                        focus:outline-none focus:ring-2 focus:border-transparent transition-all
                        placeholder:text-slate-400"
                      style={ringStyle}
                      onFocus={inputFocus}
                      onBlur={inputBlur}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">דוא״ל מקצועי</label>
                  <div className="relative">
                    <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email"
                      value={signUpEmail}
                      onChange={(e) => setSignUpEmail(e.target.value)}
                      placeholder="your.name@clinic.co.il"
                      required
                      autoComplete="email"
                      className="w-full pr-10 pl-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm
                        focus:outline-none focus:ring-2 focus:border-transparent transition-all
                        placeholder:text-slate-400"
                      style={ringStyle}
                      onFocus={inputFocus}
                      onBlur={inputBlur}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">סיסמה</label>
                  <div className="relative">
                    <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type={showSignUpPassword ? 'text' : 'password'}
                      value={signUpPassword}
                      onChange={(e) => setSignUpPassword(e.target.value)}
                      placeholder="לפחות 6 תווים"
                      required
                      minLength={6}
                      autoComplete="new-password"
                      className="w-full pr-10 pl-10 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm
                        focus:outline-none transition-all placeholder:text-slate-400"
                      onFocus={inputFocus}
                      onBlur={inputBlur}
                    />
                    <button
                      type="button"
                      onClick={() => setShowSignUpPassword((v) => !v)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-600 transition-colors"
                      tabIndex={-1}
                      aria-label={showSignUpPassword ? 'הסתר סיסמה' : 'הצג סיסמה'}
                    >
                      {showSignUpPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 text-right">הסיסמה נשמרת ב-Supabase ומוגנת לפי מדיניות האבטחה של השרת.</p>
                </div>

                {loginError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{loginError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full py-3 rounded-xl text-white font-semibold text-base transition-all duration-200
                    disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
                  style={{
                    background: isLoading ? '#94a3b8' : 'linear-gradient(135deg, #0d9488, #10b981)',
                  }}
                  onMouseEnter={(e) => {
                    if (!isLoading) {
                      (e.target as HTMLButtonElement).style.background =
                        'linear-gradient(135deg, #0f766e, #059669)';
                      (e.target as HTMLButtonElement).style.transform = 'translateY(-1px)';
                      (e.target as HTMLButtonElement).style.boxShadow =
                        '0 8px 20px rgba(13,148,136,0.3)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isLoading) {
                      (e.target as HTMLButtonElement).style.background =
                        'linear-gradient(135deg, #0d9488, #10b981)';
                      (e.target as HTMLButtonElement).style.transform = '';
                      (e.target as HTMLButtonElement).style.boxShadow = '';
                    }
                  }}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
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

        <p className="text-center text-xs text-slate-400 mt-6 space-x-1">
          <a
            href="/accessibility"
            className="hover:text-teal-600 underline underline-offset-2 transition-colors"
          >
            הצהרת נגישות
          </a>
          <span aria-hidden="true"> · </span>
          © 2026 PHYSIOSHIELD · כל הזכויות שמורות
        </p>
      </div>
    </div>
  );
}
