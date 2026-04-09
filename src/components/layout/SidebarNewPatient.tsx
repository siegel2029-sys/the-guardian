import { useRef, useState } from 'react';
import { UserPlus, KeyRound, Copy, X } from 'lucide-react';
import { usePatient } from '../../context/PatientContext';
import ClinicalAiIntakeWizard from '../dashboard/ClinicalAiIntakeWizard';

export default function SidebarNewPatient() {
  const { createPatientWithAccess, applyInitialClinicalProfile, deletePatient } = usePatient();
  const [open, setOpen] = useState(false);
  const [draftPatientId, setDraftPatientId] = useState<string | null>(null);
  const [created, setCreated] = useState<{ loginId: string; password: string } | null>(null);
  const savedDraftRef = useRef(false);

  const start = () => {
    const creds = createPatientWithAccess('מטופל חדש');
    savedDraftRef.current = false;
    setDraftPatientId(creds.patientId);
    setCreated({ loginId: creds.loginId, password: creds.password });
    setOpen(false);
  };

  const onWizardClose = () => {
    if (savedDraftRef.current) {
      savedDraftRef.current = false;
      return;
    }
    if (draftPatientId) {
      deletePatient(draftPatientId);
      setDraftPatientId(null);
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
    setCreated(null);
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
      <div className="px-3 pt-3 pb-2 border-b border-teal-50">
        <button
          type="button"
          onClick={start}
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
          יצירת מטופל, תוכנית ריקה, מזהה וסיסמה לכניסה
        </p>
      </div>

      {draftPatientId && (
        <ClinicalAiIntakeWizard
          initialPatientName="מטופל חדש"
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
                  <p className="text-xs font-semibold text-teal-900">העתיקו למטופל:</p>
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-2 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-slate-500">מזהה</span>
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
