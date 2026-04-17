import { useRef, useState } from 'react';
import { UserPlus, KeyRound, Copy, X, RefreshCw } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import ClinicalAiIntakeWizard from '../dashboard/ClinicalAiIntakeWizard';
import { randomPatientPassword } from '../../context/PatientContext';

export default function SidebarNewPatient({ compact = false }: { compact?: boolean }) {
  const { createPatientWithAccess, applyInitialClinicalProfile, deletePatient } = usePatient();
  const [open, setOpen] = useState(false);
  const [credentialsOpen, setCredentialsOpen] = useState(false);
  const [portalUsername, setPortalUsername] = useState('');
  const [portalPassword, setPortalPassword] = useState('');
  const [displayNameDraft, setDisplayNameDraft] = useState('מטופל חדש');
  const [credentialsError, setCredentialsError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftPatientId, setDraftPatientId] = useState<string | null>(null);
  const [lockedPortalUsername, setLockedPortalUsername] = useState<string | null>(null);
  const [created, setCreated] = useState<{ loginId: string; password: string } | null>(null);
  const savedDraftRef = useRef(false);

  const genPassword = () => setPortalPassword(randomPatientPassword());

  const openCredentials = () => {
    setPortalUsername('');
    setPortalPassword(randomPatientPassword());
    setDisplayNameDraft('מטופל חדש');
    setCredentialsError(null);
    setCredentialsOpen(true);
  };

  const submitCredentials = async () => {
    setCredentialsError(null);
    setCreating(true);
    try {
      const r = await createPatientWithAccess(displayNameDraft.trim() || 'מטופל חדש', {
        portalUsername,
        password: portalPassword.trim().length >= 6 ? portalPassword : undefined,
      });
      if (!r.ok) {
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
    } catch {
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
      deletePatient(draftPatientId);
      setDraftPatientId(null);
      setLockedPortalUsername(null);
      setCreated(null);
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

  return (
    <>
      {compact ? (
        <div className="px-2 py-2 border-b border-teal-50 shrink-0">
          <button
            type="button"
            onClick={openCredentials}
            title="מטופל חדש + גישה"
            className="w-full flex items-center justify-center py-2.5 rounded-xl text-white shadow-sm transition-transform hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, #0d9488, #059669)',
              boxShadow: '0 6px 16px -6px rgba(13, 148, 136, 0.45)',
            }}
          >
            <UserPlus className="w-5 h-5 shrink-0" />
          </button>
        </div>
      ) : (
        <div className="px-3 pt-3 pb-2 border-b border-teal-50">
          <button
            type="button"
            onClick={openCredentials}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-bold text-white shadow-sm transition-transform hover:-translate-y-0.5"
            style={{
              background: 'linear-gradient(135deg, #0d9488, #059669)',
              boxShadow: '0 6px 16px -6px rgba(13, 148, 136, 0.45)',
            }}
          >
            <UserPlus className="w-4 h-4 shrink-0" />
            מטופל חדש + גישה
          </button>
          <p className="text-[10px] text-slate-500 mt-1.5 px-0.5 leading-snug text-center">
            רמזי פורטל (פרטיות), סיסמה, ואז אינטייק קליני
          </p>
        </div>
      )}

      {credentialsOpen && (
        <div
          className="fixed inset-0 z-[190] flex items-center justify-center p-4"
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
                מטופל חדש — מזהה פורטל
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
              <p className="text-[11px] text-slate-500 leading-relaxed">
                מזהה הפורטל נשמר <strong>לצמיתות</strong> ומשמש לכניסה (רמזים בלבד — לדוגמה JD). אי אפשר לשנות
                אחרי השמירה.
              </p>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  רמזי מטופל (לדוגמה JD) — לפרטיות
                </label>
                <input
                  value={portalUsername}
                  onChange={(e) => setPortalUsername(e.target.value.toUpperCase())}
                  placeholder="JD"
                  autoComplete="off"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 font-mono text-sm uppercase"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">שם תצוגה ראשוני</label>
                <input
                  value={displayNameDraft}
                  onChange={(e) => setDisplayNameDraft(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-semibold text-slate-600">סיסמה (מינימום 6 תווים)</label>
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
      )}

      {draftPatientId && lockedPortalUsername && (
        <ClinicalAiIntakeWizard
          clinicalIntakeMode="create"
          lockedPortalUsername={lockedPortalUsername}
          initialPatientName={displayNameDraft.trim() || 'מטופל חדש'}
          onClose={onWizardClose}
          onSave={onWizardSave}
        />
      )}

      {open && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4"
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
      )}
    </>
  );
}
