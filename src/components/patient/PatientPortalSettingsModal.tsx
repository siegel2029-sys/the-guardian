import { useState, useEffect } from 'react';
import { X, Settings } from 'lucide-react';
import type { Patient } from '../../types';
import { bodyAreaLabels } from '../../types';
import type { PatientPasswordChangeResult } from '../../context/authPersistence';

type Props = {
  open: boolean;
  onClose: () => void;
  patient: Patient;
  /** מזהה פורטל (רמזים) — תצוגה בלבד */
  patientLoginId: string | null;
  completePatientPasswordChange: (
    currentPassword: string,
    newPassword: string
  ) => Promise<PatientPasswordChangeResult>;
  /** כאשר true — אין אימות סיסמה נוכחית בשרת (מעדכן סיסמה ישירות) */
  supabasePasswordMode?: boolean;
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
  completePatientPasswordChange,
  supabasePasswordMode = false,
}: Props) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    if (!open) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFormError(null);
    setSavedOk(false);
  }, [open, patient.id]);

  if (!open) return null;

  const wantPasswordChange = newPassword.trim() !== '';

  const handleSave = async () => {
    setFormError(null);
    setSavedOk(false);

    if (!wantPasswordChange) {
      setFormError('הזינו סיסמה חדשה לשמירה.');
      return;
    }

    if (!supabasePasswordMode && !currentPassword.trim()) {
      setFormError('יש להזין את הסיסמה הנוכחית לאימות.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError('הסיסמאות החדשות אינן תואמות.');
      return;
    }

    const r = await completePatientPasswordChange(
      supabasePasswordMode ? '' : currentPassword,
      newPassword
    );
    if (r !== 'ok') {
      if (r === 'bad_current') {
        setFormError('סיסמה נוכחית שגויה.');
        return;
      }
      if (r === 'invalid_new') {
        setFormError('סיסמה חדשה קצרה מדי (לפחות 6 תווים) או לא תקינה.');
        return;
      }
      setFormError('לא ניתן לעדכן את הסיסמה.');
      return;
    }

    setSavedOk(true);
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
                <dt className="text-xs text-slate-500">שם תצוגה</dt>
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
            <h3 className="text-xs font-bold text-slate-600">מזהה כניסה לפורטל</h3>
            <p className="text-[11px] text-slate-500 leading-relaxed">
              מזהה הפורטל (רמזים לפרטיות) נקבע על ידי המטפל בעת היצירה ואינו ניתן לשינוי.
            </p>
            <input
              type="text"
              readOnly
              value={patientLoginId ?? patient.portalUsername ?? '—'}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-mono text-slate-700 cursor-default"
              aria-label="מזהה פורטל (קריאה בלבד)"
            />
          </section>

          <section className="space-y-3">
            <h3 className="text-xs font-bold text-slate-600">שינוי סיסמה</h3>
            {!supabasePasswordMode && (
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
            )}
            <div>
              <label htmlFor="settings-new-pw" className="block text-xs font-medium text-slate-600 mb-1">
                סיסמה חדשה
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
              onClick={() => void handleSave()}
              className="flex-1 py-3 rounded-2xl font-semibold text-white bg-medical-primary hover:bg-medical-primary/90 shadow-sm"
            >
              שמור סיסמה
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
