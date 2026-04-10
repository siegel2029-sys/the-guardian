import { useState, useEffect } from 'react';
import { X, Settings } from 'lucide-react';
import type { Patient } from '../../types';
import { bodyAreaLabels } from '../../types';
import type {
  PatientLoginChangeResult,
  PatientPasswordChangeResult,
} from '../../context/authPersistence';

type Props = {
  open: boolean;
  onClose: () => void;
  patient: Patient;
  patientLoginId: string | null;
  changePatientLoginId: (
    currentPassword: string,
    newLoginId: string
  ) => PatientLoginChangeResult;
  completePatientPasswordChange: (
    currentPassword: string,
    newPassword: string
  ) => PatientPasswordChangeResult;
};

function formatJoinDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export default function PatientPortalSettingsModal({
  open,
  onClose,
  patient,
  patientLoginId,
  changePatientLoginId,
  completePatientPasswordChange,
}: Props) {
  const [newLoginIdInput, setNewLoginIdInput] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    if (!open) return;
    setNewLoginIdInput('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFormError(null);
    setSavedOk(false);
  }, [open, patient.id]);

  if (!open) return null;

  const wantLoginChange =
    newLoginIdInput.trim() !== '' &&
    newLoginIdInput.trim().toUpperCase() !== (patientLoginId ?? '').toUpperCase();
  const wantPasswordChange = newPassword.trim() !== '';

  const handleSave = () => {
    setFormError(null);
    setSavedOk(false);

    if (!wantLoginChange && !wantPasswordChange) {
      setFormError('אין שינויים לשמירה.');
      return;
    }

    if (!currentPassword.trim()) {
      setFormError('יש להזין את הסיסמה הנוכחית לאימות.');
      return;
    }

    if (wantPasswordChange) {
      if (newPassword !== confirmPassword) {
        setFormError('הסיסמאות החדשות אינן תואמות.');
        return;
      }
    }

    const pw = currentPassword;

    if (wantLoginChange) {
      const r = changePatientLoginId(pw, newLoginIdInput.trim());
      if (r !== 'ok') {
        if (r === 'invalid_id') {
          setFormError('מזהה לא תקין. נדרש פורמט PT- עם לפחות 4 תווים אחרי המקף.');
        } else if (r === 'bad_password') {
          setFormError('סיסמה נוכחית שגויה.');
        } else if (r === 'taken') {
          setFormError('מזהה זה כבר בשימוש.');
        } else {
          setFormError('לא ניתן לעדכן את מזהה הכניסה.');
        }
        return;
      }
    }

    if (wantPasswordChange) {
      const r = completePatientPasswordChange(pw, newPassword);
      if (r !== 'ok') {
        if (r === 'bad_current') {
          setFormError('סיסמה נוכחית שגויה.');
          return;
        }
        if (r === 'invalid_new') {
          setFormError('סיסמה חדשה קצרה מדי (לפחות 6 תווים).');
          return;
        }
        setFormError('לא ניתן לעדכן את הסיסמה.');
        return;
      }
    }

    setSavedOk(true);
    setNewLoginIdInput('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  };

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(15, 23, 42, 0.45)' }}
      dir="rtl"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md max-h-[min(92dvh,720px)] overflow-y-auto rounded-3xl border border-slate-200/90 shadow-2xl bg-white"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-settings-title"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-5 pt-4 pb-3 border-b border-slate-100 bg-white/95 backdrop-blur-sm">
          <div className="flex items-center gap-2 min-w-0">
            <Settings className="w-5 h-5 shrink-0 text-slate-600" strokeWidth={2} aria-hidden />
            <h2 id="patient-settings-title" className="text-base font-bold text-slate-900 truncate">
              הגדרות חשבון
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:bg-slate-100 shrink-0"
            aria-label="סגור"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-5">
          <section className="rounded-2xl border border-slate-200/80 bg-slate-50/80 px-4 py-3 space-y-2.5">
            <h3 className="text-xs font-bold text-slate-600">פרטי מטופל</h3>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-xs text-slate-500">שם מלא</dt>
                <dd className="font-semibold text-slate-900">{patient.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">תאריך תחילת טיפול</dt>
                <dd className="font-semibold text-slate-900">{formatJoinDate(patient.joinDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-slate-500">מוקד שיקום</dt>
                <dd className="font-semibold text-slate-900">
                  {bodyAreaLabels[patient.primaryBodyArea]}
                </dd>
              </div>
            </dl>
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-600">ניהול התחברות</h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              מזהה נוכחי:{' '}
              <span className="font-mono font-semibold text-slate-700">{patientLoginId ?? '—'}</span>
            </p>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              לשינוי מזהה: פורמט PT- ואז אותיות ומספרים באנגלית (למשל PT-MYID01). השאר ריק אם אין
              שינוי.
            </p>
            <div>
              <label htmlFor="settings-new-login" className="block text-xs font-medium text-slate-600 mb-1">
                שם משתמש / מזהה כניסה חדש
              </label>
              <input
                id="settings-new-login"
                type="text"
                value={newLoginIdInput}
                onChange={(e) => setNewLoginIdInput(e.target.value.toUpperCase())}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-mono"
                placeholder="השאר ריק או PT-..."
                autoComplete="username"
              />
            </div>
            <div>
              <label htmlFor="settings-current-pw" className="block text-xs font-medium text-slate-600 mb-1">
                סיסמה נוכחית (לאימות)
              </label>
              <input
                id="settings-current-pw"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                autoComplete="current-password"
              />
            </div>
            <div>
              <label htmlFor="settings-new-pw" className="block text-xs font-medium text-slate-600 mb-1">
                סיסמה חדשה (אופציונלי)
              </label>
              <input
                id="settings-new-pw"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                autoComplete="new-password"
              />
            </div>
            <div>
              <label htmlFor="settings-confirm-pw" className="block text-xs font-medium text-slate-600 mb-1">
                אימות סיסמה חדשה
              </label>
              <input
                id="settings-confirm-pw"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                autoComplete="new-password"
              />
            </div>
          </section>

          {formError && <p className="text-sm text-red-600">{formError}</p>}
          {savedOk && !formError && (
            <p className="text-sm font-medium text-medical-success">השינויים נשמרו בהצלחה.</p>
          )}

          <div className="flex flex-col-reverse sm:flex-row gap-2 pt-1 pb-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-3 rounded-2xl font-semibold text-slate-700 border border-slate-200 hover:bg-slate-50"
            >
              סגירה
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex-1 py-3 rounded-2xl font-semibold text-white bg-medical-primary hover:bg-medical-primary/90 shadow-sm"
            >
              שמור שינויים
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
