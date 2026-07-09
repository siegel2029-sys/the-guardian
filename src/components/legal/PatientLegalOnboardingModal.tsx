import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, Loader2, ScrollText, ShieldAlert } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  acceptPatientLegalTerms,
  fetchPatientLegalConsentStatus,
  isPatientLegallyAccepted,
  PATIENT_LEGAL_NETWORK_ERROR,
} from '../../services/patientLegalConsent';
import {
  MedicalDisclaimerBody,
  PrivacyPolicyBody,
  TermsOfUseBody,
} from './legalDocumentBodies';

type GateView = 'loading' | 'error' | 'consent';

type LegalSectionProps = {
  id: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
};

function LegalSection({ id, title, icon, children }: LegalSectionProps) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white overflow-hidden open:shadow-sm">
      <summary className="flex items-center gap-2 px-4 py-3 cursor-pointer select-none hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-teal-500 [&::-webkit-details-marker]:hidden list-none">
        <span className="shrink-0" aria-hidden="true">
          {icon}
        </span>
        <span id={id} className="flex-1 text-sm font-semibold text-slate-700">
          {title}
        </span>
        <ChevronDown
          className="w-4 h-4 text-slate-400 shrink-0 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div
        className="max-h-56 overflow-y-auto border-t border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600 leading-relaxed"
        role="document"
        aria-labelledby={id}
      >
        {children}
      </div>
    </details>
  );
}

type PatientLegalOnboardingModalProps = {
  patientId: string;
  onAccepted: () => void;
};

/**
 * Mandatory patient legal consent gate.
 * Fetches consent status from Supabase once on mount; no localStorage / offline fallback.
 */
export default function PatientLegalOnboardingModal({
  patientId,
  onAccepted,
}: PatientLegalOnboardingModalProps) {
  const { sessionRole } = useAuth();
  const [view, setView] = useState<GateView>('loading');
  const [isOver18, setIsOver18] = useState(false);
  const [acceptsTerms, setAcceptsTerms] = useState(false);
  const [acceptsDisclaimer, setAcceptsDisclaimer] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const allChecked = isOver18 && acceptsTerms && acceptsDisclaimer;

  const loadConsentStatus = useCallback(async () => {
    setView('loading');
    setSaveError(null);
    try {
      const status = await fetchPatientLegalConsentStatus(patientId);
      if (isPatientLegallyAccepted(status)) {
        onAccepted();
        return;
      }
      setView('consent');
    } catch (err) {
      console.error('[PatientLegalOnboardingModal] Consent status fetch failed', {
        patientId,
        sessionRole,
        error: err,
      });
      setView('error');
    }
  }, [patientId, sessionRole, onAccepted]);

  useEffect(() => {
    void loadConsentStatus();
  }, [loadConsentStatus]);

  const handleSubmit = async () => {
    if (!allChecked || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await acceptPatientLegalTerms(patientId);
      onAccepted();
    } catch (err) {
      console.error('[PatientLegalOnboardingModal] Consent save failed', {
        patientId,
        sessionRole,
        error: err,
      });
      setSaveError(PATIENT_LEGAL_NETWORK_ERROR);
    } finally {
      setSaving(false);
    }
  };

  if (view === 'loading') {
    return (
      <div
        className="fixed inset-0 z-[210] flex flex-col items-center justify-center bg-slate-50 gap-3"
        dir="rtl"
        lang="he"
        role="status"
        aria-live="polite"
      >
        <Loader2 className="w-8 h-8 animate-spin text-teal-600" aria-hidden="true" />
        <p className="text-sm text-slate-500">טוען...</p>
      </div>
    );
  }

  if (view === 'error') {
    return (
      <div
        className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
        dir="rtl"
        lang="he"
        role="alertdialog"
        aria-labelledby="patient-legal-error-title"
        aria-describedby="patient-legal-error-desc"
      >
        <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl border border-red-100 p-8 text-center space-y-5">
          <h2 id="patient-legal-error-title" className="text-lg font-bold text-slate-800">
            לא ניתן להתחבר
          </h2>
          <p id="patient-legal-error-desc" className="text-sm text-slate-600 leading-relaxed">
            {PATIENT_LEGAL_NETWORK_ERROR}
          </p>
          <button
            type="button"
            onClick={() => void loadConsentStatus()}
            className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3 shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            נסה שנית
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="patient-legal-onboarding-title"
      dir="rtl"
      lang="he"
    >
      <div className="relative w-full max-w-2xl max-h-[92dvh] flex flex-col bg-white rounded-2xl shadow-2xl border border-teal-100 overflow-hidden">
        <header className="px-6 py-4 border-b border-teal-100 bg-gradient-to-l from-teal-50 to-emerald-50 flex items-center gap-3 shrink-0">
          <div
            className="inline-flex items-center justify-center w-10 h-10 rounded-xl shadow shrink-0"
            style={{ background: 'linear-gradient(135deg, #0d9488, #10b981)' }}
          >
            <ScrollText className="w-5 h-5 text-white" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 id="patient-legal-onboarding-title" className="text-lg font-bold text-slate-800">
              תנאי שימוש והצהרה רפואית
            </h2>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 py-5 space-y-3">
          <p className="text-sm text-slate-600 leading-relaxed">
            לפני המשך השימוש באפליקציה יש לקרוא ולאשר את המסמכים המשפטיים המקושרים להלן.
            לחצו על כל כותרת כדי לפתוח את הנוסח המלא.
          </p>

          <LegalSection
            id="patient-legal-terms"
            title="תנאי שימוש"
            icon={<ScrollText className="w-4 h-4 text-teal-600" />}
          >
            <TermsOfUseBody />
          </LegalSection>

          <LegalSection
            id="patient-legal-privacy"
            title="מדיניות פרטיות"
            icon={<ScrollText className="w-4 h-4 text-teal-600" />}
          >
            <PrivacyPolicyBody />
          </LegalSection>

          <LegalSection
            id="patient-legal-disclaimer"
            title="הצהרה רפואית"
            icon={<ShieldAlert className="w-4 h-4 text-amber-600" />}
          >
            <MedicalDisclaimerBody />
          </LegalSection>

          <fieldset className="space-y-3 pt-2">
            <legend className="sr-only">אישורים נדרשים</legend>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 hover:border-teal-200 transition-colors p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isOver18}
                onChange={(e) => setIsOver18(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              />
              <span className="text-sm text-slate-700 leading-relaxed">אני מעל גיל 18.</span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 hover:border-teal-200 transition-colors p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptsTerms}
                onChange={(e) => setAcceptsTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              />
              <span className="text-sm text-slate-700 leading-relaxed">
                אני מסכים/ה לתנאי השימוש, מדיניות הפרטיות והצהרת האחריות הרפואית
              </span>
            </label>

            <label className="flex items-start gap-3 rounded-xl border border-slate-200 hover:border-teal-200 transition-colors p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={acceptsDisclaimer}
                onChange={(e) => setAcceptsDisclaimer(e.target.checked)}
                className="mt-0.5 w-4 h-4 shrink-0 accent-teal-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
              />
              <span className="text-sm text-slate-700 leading-relaxed">
                קראתי את ההצהרה הרפואית ואני מבין/ה שהאפליקציה אינה מחליפה טיפול רפואי חירום,
                ואני מתחייב/ת להתאמן בסביבה בטוחה.
              </span>
            </label>
          </fieldset>

          {saveError && (
            <div role="alert" className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-xl px-4 py-3">
              <p>{saveError}</p>
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-slate-100 bg-white shrink-0">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!allChecked || saving}
            className="w-full rounded-xl bg-teal-600 hover:bg-teal-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-semibold py-3 shadow transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2"
          >
            {saving ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />
                שומרים את האישור...
              </span>
            ) : (
              'אישור והמשך'
            )}
          </button>
          {!allChecked && (
            <p className="text-center text-xs text-slate-400 mt-2">
              יש לסמן את שלוש התיבות כדי להמשיך.
            </p>
          )}
        </footer>
      </div>
    </div>
  );
}
