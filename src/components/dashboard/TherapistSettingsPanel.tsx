import { useState, useEffect, type FormEvent } from 'react';
import { Mail, Lock, Save, AlertCircle, Shield, User, CloudUpload } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getTherapistRecord } from '../../context/authPersistence';
import { usePatient } from '../../context/PatientContext';

export default function TherapistSettingsPanel() {
  const { therapist, updateTherapistProfile, usesSupabaseSession } = useAuth();
  const {
    supabaseConfigured,
    supabaseSyncStatus,
    supabaseSyncError,
    supabaseLastSavedAt,
    savePersistedStateToCloud,
  } = usePatient();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!therapist) return;
    const rec = getTherapistRecord(therapist.id);
    setDisplayName(rec?.displayName ?? therapist.name);
    setEmail(therapist.email);
  }, [therapist]);

  if (!therapist) return null;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);
    const name = displayName.trim();
    if (name.length < 2) {
      setError('נא למלא שם תצוגה (לפחות 2 תווים).');
      return;
    }
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
    try {
      await updateTherapistProfile(name, em, password);
      setPassword('');
      setConfirm('');
      setSaved(true);
    } catch {
      setError('לא ניתן לעדכן את הפרופיל. נסו שוב.');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6" dir="rtl">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-6 h-6 text-teal-600" />
          <h2 className="text-lg font-bold text-slate-800">הגדרות מטפל</h2>
        </div>
        <p className="text-sm text-slate-500 mb-6">
          {usesSupabaseSession ? (
            <>
              חשבון מקושר ל־Supabase Auth. דוא״ל וסיסמה מעודכנים בשרת. מזהה פנימי (לא ניתן לשינוי):{' '}
              <span className="font-mono text-xs text-slate-600 break-all">{therapist.id}</span>
            </>
          ) : (
            <>
              שם תצוגה, דוא״ל וסיסמה נשמרים במכשיר זה (localStorage). מזהה מטפל:{' '}
              <span className="font-mono text-xs text-slate-600">{therapist.id}</span> — לסינון מטופלים בין
              מטפלים.
            </>
          )}
        </p>

        <form
          onSubmit={handleSubmit}
          className="bg-white rounded-2xl border border-teal-100 shadow-sm p-6 space-y-4"
        >
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">שם תצוגה (שם משתמש)</label>
            <div className="relative">
              <User className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="w-full pr-10 pl-3 py-2.5 rounded-xl border border-slate-200 text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">דוא״ל (לכניסה)</label>
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

        <div className="mt-8 bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-3">
          <div className="flex items-center gap-2">
            <CloudUpload className="w-5 h-5 text-slate-600" />
            <h3 className="text-base font-bold text-slate-800">Supabase (בדיקת חיבור)</h3>
          </div>
          <p className="text-sm text-slate-600 leading-relaxed">
            הנתונים הקליניים נטענים ונשמרים תחילה ב־localStorage. כפתור זה דוחף עותק למסד ב־Supabase
            (profiles, patients, exercise_plans, session_history) — לפני סנכרון אוטומטי מלא.
          </p>
          {!supabaseConfigured && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              לא מוגדר: הוסיפו <code className="text-xs">VITE_SUPABASE_URL</code> ו־
              <code className="text-xs"> VITE_SUPABASE_ANON_KEY</code> ל־.env והריצו מחדש את Vite.
            </p>
          )}
          {supabaseSyncError && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="whitespace-pre-wrap">{supabaseSyncError}</span>
            </div>
          )}
          {supabaseLastSavedAt && supabaseSyncStatus !== 'error' && (
            <p className="text-xs text-slate-500">
              שמירה אחרונה לענן:{' '}
              {new Date(supabaseLastSavedAt).toLocaleString('he-IL', {
                dateStyle: 'short',
                timeStyle: 'short',
              })}
            </p>
          )}
          <button
            type="button"
            disabled={!supabaseConfigured || supabaseSyncStatus === 'saving'}
            onClick={() => void savePersistedStateToCloud()}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm border-2 border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <CloudUpload className="w-4 h-4" />
            {supabaseSyncStatus === 'saving' ? 'שומר ל-Supabase…' : 'שמירה ל-Supabase'}
          </button>
        </div>
      </div>
    </div>
  );
}
