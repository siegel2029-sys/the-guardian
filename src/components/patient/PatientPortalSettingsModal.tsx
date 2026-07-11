import { useState, useEffect, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Settings, ChevronDown, Lock } from 'lucide-react';
import type { Patient } from '../../types';
import { bodyAreaLabels } from '../../types';
import type { PatientPasswordChangeResult } from '../../context/authPersistence';
import { validateNewPassword } from '../../lib/passwordPolicy';

const LEGAL_FOOTER_LINKS: { to: string; label: string }[] = [
  { to: '/legal/terms-of-use', label: 'תנאי שימוש' },
  { to: '/legal/privacy-policy', label: 'מדיניות פרטיות' },
  { to: '/legal/medical-disclaimer', label: 'הצהרה רפואית' },
  { to: '/legal/refund-policy', label: 'מדיניות ביטולים והחזרים' },
  { to: '/legal/accessibility', label: 'הצהרת נגישות' },
];

type Props = {
  open: boolean;
  onClose: () => void;
  patient: Patient;
  completePatientPasswordChange: (
    currentPassword: string,
    newPassword: string
  ) => Promise<PatientPasswordChangeResult>;
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
  completePatientPasswordChange,
}: Props) {
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [passwordExpanded, setPasswordExpanded] = useState(false);

  const patientDisplayName =
    patient.name.trim() || patient.portalUsername?.trim() || '—';

  useEffect(() => {
    if (!open) return;
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setFormError(null);
    setSavedOk(false);
    setPasswordExpanded(false);
  }, [open, patient.id]);

  if (!open) return null;

  const openLegalDoc = (to: string) => {
    onClose();
    navigate(to);
  };

  const handleSave = async () => {
    setFormError(null);
    setSavedOk(false);

    if (!currentPassword.trim()) {
      setFormError('יש להזין את הסיסמה הנוכחית לאימות.');
      return;
    }

    if (!newPassword.trim()) {
      setFormError('הזינו סיסמה חדשה לשמירה.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setFormError('הסיסמאות החדשות אינן תואמות.');
      return;
    }

    const newPasswordError = validateNewPassword(newPassword);
    if (newPasswordError) {
      setFormError(newPasswordError);
      return;
    }

    const r = await completePatientPasswordChange(currentPassword, newPassword);
    if (r !== 'ok') {
      if (r === 'bad_current') {
        setFormError('סיסמה נוכחית שגויה.');
        return;
      }
      if (r === 'invalid_new') {
        setFormError('סיסמה חדשה קצרה מדי (לפחות 8 תווים, אותיות ומספרים) או לא תקינה.');
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

        <div className="px-5 pt-5 pb-5 space-y-5">
          <section className="bg-slate-50 border border-slate-100 rounded-2xl p-4">
            <h3 className="text-sm font-semibold text-gray-500">פרטי מטופל</h3>
            <div className="text-lg font-bold text-gray-900 mt-1 mb-3">{patientDisplayName}</div>
            <dl className="space-y-2.5 text-sm">
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

          <section className="bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => setPasswordExpanded((v) => !v)}
              className="w-full flex items-center justify-between p-4 hover:bg-gray-50 active:bg-gray-100 transition-colors cursor-pointer touch-manipulation"
              aria-expanded={passwordExpanded}
              aria-controls="patient-settings-password-panel"
              id="patient-settings-password-toggle"
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Lock className="w-4 h-4 shrink-0 text-slate-400" strokeWidth={2} aria-hidden />
                <span className="text-sm font-medium text-gray-800">🔒 שינוי סיסמה</span>
              </span>
              <ChevronDown
                className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${
                  passwordExpanded ? 'rotate-180' : ''
                }`}
                strokeWidth={2}
                aria-hidden
              />
            </button>

            {passwordExpanded && (
              <div
                id="patient-settings-password-panel"
                role="region"
                aria-labelledby="patient-settings-password-toggle"
                className="border-t border-gray-100 px-4 pb-4 pt-3 space-y-3"
              >
                <div>
                  <label
                    htmlFor="settings-current-pw"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    סיסמה נוכחית
                  </label>
                  <input
                    id="settings-current-pw"
                    type="password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    autoComplete="current-password"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="settings-new-pw"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    סיסמה חדשה
                  </label>
                  <input
                    id="settings-new-pw"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    autoComplete="new-password"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="settings-confirm-pw"
                    className="block text-xs font-medium text-slate-600 mb-1"
                  >
                    אימות סיסמה חדשה
                  </label>
                  <input
                    id="settings-confirm-pw"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                    autoComplete="new-password"
                    required
                  />
                </div>

                {formError && <p className="text-sm text-red-600">{formError}</p>}
                {savedOk && !formError && (
                  <p className="text-sm font-medium text-medical-success">השינויים נשמרו בהצלחה.</p>
                )}

                <button
                  type="button"
                  onClick={() => void handleSave()}
                  className="w-full py-3 rounded-2xl font-semibold text-white bg-medical-primary hover:bg-medical-primary/90 shadow-sm"
                >
                  שמור סיסמה
                </button>
              </div>
            )}
          </section>

          <div className="pt-1 border-t border-gray-100 text-center">
            <div className="flex flex-wrap justify-center gap-x-2 gap-y-1 text-xs text-blue-600 font-medium">
              {LEGAL_FOOTER_LINKS.map((link, i) => (
                <Fragment key={link.to}>
                  {i > 0 && (
                    <span className="text-gray-300" aria-hidden="true">
                      •
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => openLegalDoc(link.to)}
                    className="hover:underline"
                  >
                    {link.label}
                  </button>
                </Fragment>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-2">
              © PHYSIOSHIELD 2026 · כל הזכויות שמורות
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
