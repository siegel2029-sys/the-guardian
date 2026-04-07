import { useState, useEffect, type FormEvent } from 'react';
import { Mail, Lock, Save, AlertCircle, Shield } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { loadAuthSnapshot } from '../../context/authPersistence';

export default function TherapistSettingsPanel() {
  const { therapist, updateTherapistProfile } = useAuth();
  const [email, setEmail] = useState(() => loadAuthSnapshot().therapistEmail);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (therapist?.email) setEmail(therapist.email);
  }, [therapist?.email]);

  if (!therapist) return null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const em = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError('כתובת דוא״ל לא תקינה.');
      return;
    }
    if (password.length > 0 && password.length < 6) {
      setError('סיסמה חדשה — לפחות 6 תווים, או השאירו ריק לשמירת הסיסמה הנוכחית.');
      return;
    }
    if (password !== confirm) {
      setError('אימות הסיסמה אינו תואם.');
      return;
    }
    const snap = loadAuthSnapshot();
    const newPw = password.length > 0 ? password : snap.therapistPassword;
    updateTherapistProfile(em, newPw);
    setPassword('');
    setConfirm('');
    setSaved(true);
  };

  return (
    <div className="h-full overflow-y-auto p-6" dir="rtl">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-6 h-6 text-teal-600" />
          <h2 className="text-lg font-bold text-slate-800">הגדרות מטפל</h2>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          עדכון דוא״ל וסיסמה נשמרים במכשיר זה (localStorage). לדמו בלבד — לא לאחסון רגיש בלי שרת.
        </p>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-teal-100 shadow-sm p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">דוא״ל</label>
            <div className="relative">
              <Mail className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              סיסמה חדשה (אופציונלי)
            </label>
            <div className="relative">
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="השאירו ריק אם אין שינוי"
                autoComplete="new-password"
                className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm placeholder:text-slate-400"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">אימות סיסמה</label>
            <input
              type="password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm"
            />
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {saved && (
            <p className="text-sm text-teal-700 font-medium">הפרטים נשמרו בהצלחה.</p>
          )}

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-white font-semibold text-sm"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            <Save className="w-4 h-4" />
            שמירה
          </button>
        </form>
      </div>
    </div>
  );
}
