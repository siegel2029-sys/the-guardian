import { useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { UserPlus, KeyRound, Copy, X, RefreshCw } from 'lucide-react';
import { randomPatientPassword } from '../../context/PatientContext';
import {
  usePatientRoster,
  usePatientClinical,
  usePatientCloudSync,
} from '../../context/patientDomainHooks';
import ClinicalAiIntakeWizard from '../dashboard/ClinicalAiIntakeWizard';
import ErrorBoundary from '../ui/error-boundary';
import { validateNewPassword } from '../../lib/passwordPolicy';

type SidebarNewPatientProps = {
  compact?: boolean;
  /** `dashboard`: header-style primary button only (no sidebar chrome). Default: sidebar strip. */
  layout?: 'sidebar' | 'dashboard';
};

function ModalPortal({ children }: { children: ReactNode }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}

export default function SidebarNewPatient({ compact = false, layout = 'sidebar' }: SidebarNewPatientProps) {
  const { createPatientWithAccess } = usePatientRoster();
  const { applyInitialClinicalProfile } = usePatientClinical();
  const { savePersistedStateToCloud } = usePatientCloudSync();
  const [open, setOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [portalUsername, setPortalUsername] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftPatientId, setDraftPatientId] = useState<string | null>(null);
  const [lockedPortalUsername, setLockedPortalUsername] = useState<string | null>(null);
  const [created, setCreated] = useState<{ loginId: string; password: string } | null>(null);
  const savedDraftRef = useRef(false);

  const genPassword = () => setPortalPassword(randomPatientPassword());

  const openCredentials = () => {
    setPortalUsername('');
    setPortalPassword('');
    setCredentialsError(null);
    setCredentialsOpen(true);
  };

  const initialPatientDisplayName = () => portalUsername.trim() || 'מטופל חדש';

  const submitCredentials = async () => {
    setCredentialsError(null);
    const trimmedPassword = portalPassword.trim();
    if (trimmedPassword.length > 0) {
      const passwordPolicyError = validateNewPassword(trimmedPassword);
      if (passwordPolicyError) {
        setCredentialsError(passwordPolicyError);
        return;
      }
    }
    setCreating(true);
    try {
      const r = await createPatientWithAccess(initialPatientDisplayName(), {
        portalUsername,
        password: trimmedPassword.length > 0 ? trimmedPassword : undefined,
      });
      if (!r.ok) {
        console.error('[SidebarNewPatient] createPatientWithAccess failed', {
          message: r.message,
        });
        setCredentialsError(r.message);
        setCreating(false);
        return;
      }
      savedDraftRef.current = false;
      setDraftPatientId(r.patientId);
      setLockedPortalUsername(r.loginId);
      setCreated({ loginId: r.loginId, password: r.password });
      setCredentialsOpen(false);
      setCreating(false);
    } catch (e) {
      console.error('[SidebarNewPatient] submitCredentials threw', {
        message: e instanceof Error ? e.message : String(e),
      });
      setCredentialsError('שגיאה ביצירת המטופל. נסו שוב.');
      setCreating(false);
    }
  };

  const onWizardClose = () => {
    if (savedDraftRef.current) {
      savedDraftRef.current = false;
      return;
    }
    if (draftPatientId) {
      setDraftPatientId(null);
      setLockedPortalUsername(null);
      if (created) {
        setOpen(true);
      }
    }
  };

  const onWizardSave = (
    primaryBodyArea: Parameters<typeof applyInitialClinicalProfile>[1],
    libraryExerciseIds: Parameters<typeof applyInitialClinicalProfile>[2],
    extras?: Parameters<typeof applyInitialClinicalProfile>[3]
  ) => {
    if (!draftPatientId) return;
    savedDraftRef.current = true;
    applyInitialClinicalProfile(draftPatientId, primaryBodyArea, libraryExerciseIds, extras);
    void savePersistedStateToCloud({ immediate: true });
    setDraftPatientId(null);
    setLockedPortalUsername(null);
    setOpen(true);
  };

  const copy = async (t: string) => {
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      /* ignore */
    }
  };

  const dashboardButton = (
    <button
      type="button"
      onClick={openCredentials}
      title="מטופל חדש"
      className="w-full md:w-auto inline-flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-bold text-white shadow-sm bg-teal-600 hover:bg-teal-700 transition-colors min-h-[44px]"
    >
      <UserPlus className="w-4 h-4 shrink-0" />
      מטופל חדש
    </button>
  );

  return (
    <>
      {layout === 'dashboard' ? (
        dashboardButton
      ) : compact ? (
        <div className="px-2 py-2 border-b border-teal-50 shrink-0">
          <button
            type="button"
            onClick={openCredentials}
            title="מטופל חדש"
            className="w-full flex items-center justify-center py-2.5 rounded-xl text-white shadow-sm bg-teal-600 hover:bg-teal-700 transition-colors"
          >
            <UserPlus className="w-5 h-5 shrink-0" />
          </button>
        </div>
      ) : (
        <div className="px-3 pt-3 pb-2 border-b border-teal-50 shrink-0">
          <button
            type="button"
            onClick={openCredentials}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold text-white shadow-sm bg-teal-600 hover:bg-teal-700 transition-colors"
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            מטופל חדש
          </button>
        </div>
      )}

      {credentialsOpen && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.5)' }}
          dir="rtl"
          onClick={() => !creating && setCredentialsOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-teal-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-patient-creds-title"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-teal-100">
              <h2 id="new-patient-creds-title" className="text-sm font-bold text-slate-800">
                מטופל חדש
              </h2>
              <button
                type="button"
                disabled={creating}
                onClick={() => setCredentialsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
                aria-label="סגור"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-sm">
              <div>
                <label htmlFor="new-patient-portal-username" className="block text-xs font-semibold text-slate-600 mb-1">
                  שם - <span className="text-red-600">ר&quot;ת בלבד</span>
                </label>
                <input
                  id="new-patient-portal-username"
                  value={portalUsername}
                  onChange={(e) => setPortalUsername(e.target.value.toUpperCase())}
                  placeholder="JD"
                  autoComplete="off"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm uppercase placeholder:text-slate-300 placeholder:font-normal"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="new-patient-portal-password" className="text-xs font-semibold text-slate-600">סיסמא ראשונית</label>
                  <button
                    type="button"
                    onClick={genPassword}
                    className="text-[11px] text-teal-700 font-semibold flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    יצירה אקראית
                  </button>
                </div>
                <input
                  id="new-patient-portal-password"
                  type="text"
                  value={portalPassword}
                  onChange={(e) => setPortalPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm"
                  autoComplete="new-password"
                />
              </div>
              {credentialsError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {credentialsError}
                </p>
              )}
              <button
                type="button"
                disabled={creating}
                onClick={() => void submitCredentials()}
                className="w-full py-2.5 rounded-xl font-bold text-white bg-teal-600 hover:bg-teal-700 disabled:opacity-60"
              >
                {creating ? 'יוצר…' : 'המשך לאינטייק קליני'}
              </button>
            </div>
          </div>
        </div>
        </ModalPortal>
      )}

      {draftPatientId && lockedPortalUsername && (
        <ErrorBoundary
          variant="section"
          scopeLabel="SidebarNewPatient.ClinicalAiIntakeWizard"
          fallback={(reset) => (
            <div
              className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40"
              role="alertdialog"
              aria-modal="true"
              dir="rtl"
            >
              <div className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-xl">
                <p className="text-sm font-semibold text-slate-900">אשף האינטייק אינו זמין</p>
                <p className="mt-1 text-xs text-slate-600">שאר לוח המטפל ממשיך לעבוד.</p>
                <button
                  type="button"
                  onClick={reset}
                  className="mt-4 rounded-lg bg-teal-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-teal-700"
                >
                  נסה שוב
                </button>
              </div>
            </div>
          )}
        >
          <ClinicalAiIntakeWizard
            clinicalIntakeMode="create"
            lockedPortalUsername={lockedPortalUsername}
            initialPatientName={initialPatientDisplayName()}
            onClose={onWizardClose}
            onSave={onWizardSave}
          />
        </ErrorBoundary>
      )}

      {open && (
        <ModalPortal>
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ background: 'rgba(15, 23, 42, 0.5)' }}
          dir="rtl"
          onClick={() => setOpen(false)}
          role="presentation"
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white shadow-2xl border border-teal-100 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sidebar-new-patient-title"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-teal-100">
              <h2 id="sidebar-new-patient-title" className="text-sm font-bold text-slate-800 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-teal-600" />
                מטופל חדש וגישה
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"
                aria-label="סגור"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {created && (
                <>
                  <p className="text-xs font-semibold text-teal-900">העתיקו למטופל (שמרו במקום מאובטח):</p>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-2 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">מזהה פורטל</span>
                      <code className="font-mono font-bold">{created.loginId}</code>
                      <button type="button" onClick={() => copy(created.loginId)} className="p-1 text-teal-600">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">סיסמה</span>
                      <code className="font-mono font-bold">{created.password}</code>
                      <button type="button" onClick={() => copy(created.password)} className="p-1 text-teal-600">
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    בכניסה ל־/login יש להזין את <strong>מזהה הפורטל</strong> (לא דוא״ל) ואת הסיסמה.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      setCreated(null);
                    }}
                    className="w-full py-2 rounded-xl border border-slate-200 text-slate-700 text-sm font-medium"
                  >
                    סגירה
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
        </ModalPortal>
      )}
    </>
  );
}
