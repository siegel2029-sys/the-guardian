import { useState, type FormEvent } from 'react';
import { Shield, Eye, EyeOff, Mail, Lock, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

export default function LoginPage() {
  const { login, isLoading, loginError } = useAuth();
  const [email, setEmail] = useState('michal.levi@guardian-clinic.co.il');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showHint, setShowHint] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    await login(email, password);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #e0f7f9 0%, #f0f9fa 50%, #e8f5f0 100%)' }}
    >
      {/* Background decoration */}
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
        {/* Logo / Brand */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl mb-4 shadow-lg"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}>
            <Shield className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-slate-800">The Guardian</h1>
          <p className="text-slate-500 mt-1 text-base">פורטל מטפלים מקצועי</p>
        </div>

        {/* Login Card */}
        <div className="bg-white rounded-2xl shadow-xl p-8 border border-teal-100">
          <h2 className="text-xl font-semibold text-slate-800 mb-1 text-right">ברוכים הבאים</h2>
          <p className="text-slate-500 text-sm mb-6 text-right">הכנסו לחשבונכם כדי להמשיך</p>

          <form onSubmit={handleSubmit} className="space-y-5" dir="rtl">
            {/* Email Field */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">
                כתובת דוא"ל
              </label>
              <div className="relative">
                <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder='your@email.com'
                  required
                  className="w-full pr-10 pl-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm
                    focus:outline-none focus:ring-2 focus:border-transparent transition-all
                    placeholder:text-slate-400"
                  style={{ '--tw-ring-color': '#0d9488' } as React.CSSProperties}
                  onFocus={(e) => {
                    e.target.style.borderColor = '#0d9488';
                    e.target.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '';
                    e.target.style.boxShadow = '';
                  }}
                />
              </div>
            </div>

            {/* Password Field */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">סיסמה</label>
              <div className="relative">
                <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="הכנס סיסמה"
                  required
                  className="w-full pr-10 pl-10 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm
                    focus:outline-none transition-all placeholder:text-slate-400"
                  onFocus={(e) => {
                    e.target.style.borderColor = '#0d9488';
                    e.target.style.boxShadow = '0 0 0 3px rgba(13,148,136,0.1)';
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = '';
                    e.target.style.boxShadow = '';
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-teal-600 transition-colors"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error Message */}
            {loginError && (
              <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{loginError}</span>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 rounded-xl text-white font-semibold text-base transition-all duration-200
                disabled:opacity-60 disabled:cursor-not-allowed shadow-md"
              style={{
                background: isLoading
                  ? '#94a3b8'
                  : 'linear-gradient(135deg, #0d9488, #10b981)',
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
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  מתחבר...
                </span>
              ) : (
                'כניסה למערכת'
              )}
            </button>

            {/* Forgot password */}
            <div className="text-center">
              <button
                type="button"
                onClick={() => setShowHint((v) => !v)}
                className="text-sm text-teal-600 hover:text-teal-800 hover:underline transition-colors"
              >
                שכחת סיסמה?
              </button>
            </div>

            {/* Demo hint */}
            {showHint && (
              <div className="p-3 rounded-xl bg-teal-50 border border-teal-200 text-sm text-teal-800 text-center space-y-1">
                <p className="font-medium">פרטי כניסה לדמו:</p>
                <p className="font-mono text-xs">michal.levi@guardian-clinic.co.il</p>
                <p className="font-mono text-xs">guardian2024</p>
              </div>
            )}
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-400 mt-6">
          © 2026 The Guardian · כל הזכויות שמורות
        </p>
      </div>
    </div>
  );
}
