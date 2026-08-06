import { useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ExternalLink } from 'lucide-react';
import {
  buildQuestionnaireData,
  clinicalProfileSchema,
  FINAL_LEGAL_CONSENT_TEXT,
  saveOnboardingLead,
  updateOnboardingLeadStatus,
  type LeadContact,
} from '../../services/onboardingLeadService';
import { useOnboardingWizard, type ChosenPlan } from '../../hooks/useOnboardingWizard';
import WizardProgress from './WizardProgress';
import HardStopModal from './HardStopModal';
import RedFlagStep from './RedFlagStep';
import ClinicalProfileStep from './ClinicalProfileStep';
import LeadCaptureStep from './LeadCaptureStep';
import DisclaimerStep from './DisclaimerStep';
import PlanSelectionStep from './PlanSelectionStep';
import { WIZARD_CARD_CLASS, WIZARD_PRIMARY_BUTTON_CLASS } from './wizardUi';

export const PAYBOX_CONFIRMATION_MESSAGE =
  'לאחר התשלום בפייבוקס, נאשר את הרשמתך ונטעין את התוכנית לחשבונך.';

export const ZOOM_CONFIRMATION_MESSAGE =
  'מעולה! נשאר רק לתאם את בדיקת ה-Zoom — ניצור איתך קשר בהקדם לאישור המועד.';

function getPlanUrl(plan: ChosenPlan): string {
  const url =
    plan === 'paybox'
      ? import.meta.env.VITE_PAYBOX_PAYMENT_URL
      : import.meta.env.VITE_ZOOM_BOOKING_URL;
  return url?.trim() ?? '';
}

function CompletionView({ plan }: { plan: ChosenPlan }) {
  const url = getPlanUrl(plan);
  return (
    <section dir="rtl" className={`${WIZARD_CARD_CLASS} space-y-4 text-center`}>
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-100">
        <CheckCircle2 className="h-7 w-7 text-teal-700" aria-hidden="true" />
      </span>
      <h1 className="text-lg font-bold text-slate-900">
        {plan === 'paybox' ? 'הפרטים נקלטו!' : 'הבקשה נקלטה!'}
      </h1>
      <p className="text-base leading-relaxed text-slate-700">
        {plan === 'paybox' ? PAYBOX_CONFIRMATION_MESSAGE : ZOOM_CONFIRMATION_MESSAGE}
      </p>
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className={`${WIZARD_PRIMARY_BUTTON_CLASS} inline-flex items-center justify-center gap-2`}
        >
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
          {plan === 'paybox' ? 'לתשלום בפייבוקס' : 'לתיאום בדיקת ה-Zoom'}
        </a>
      ) : (
        <p className="text-sm text-slate-500">ניצור איתך קשר בהקדם עם קישור להמשך התהליך.</p>
      )}
    </section>
  );
}

export default function OnboardingWizardPage() {
  const {
    state,
    setStep,
    setRedFlagAnswer,
    updateClinical,
    updateContact,
    setDisclaimerAccepted,
    setLeadId,
    triggerHardStop,
    completeWizard,
    resetWizard,
  } = useOnboardingWizard();

  const handleContactSubmit = useCallback(
    async (contact: LeadContact): Promise<string | null> => {
      const clinicalParsed = clinicalProfileSchema.safeParse(state.clinical);
      if (!clinicalParsed.success) {
        setStep('clinical');
        return 'חלק מפרטי השאלון חסרים — נא להשלים אותם';
      }

      const result = await saveOnboardingLead({
        leadId: state.leadId,
        contact,
        painLevel: clinicalParsed.data.painLevel,
        questionnaire: buildQuestionnaireData(state.redFlags, clinicalParsed.data),
      });
      if (!result.ok) {
        return result.message;
      }
      setLeadId(result.data);
      setStep('disclaimer');
      return null;
    },
    [state.clinical, state.leadId, state.redFlags, setLeadId, setStep]
  );

  const handleChoosePlan = useCallback(
    async (plan: ChosenPlan): Promise<string | null> => {
      if (!state.leadId) {
        setStep('contact');
        return 'פרטי ההתקשרות לא נשמרו — נא למלא אותם שוב';
      }
      if (!state.disclaimerAccepted) {
        setStep('disclaimer');
        return 'יש לאשר את ההצהרה והמסמכים המשפטיים לפני בחירת מסלול';
      }

      const clinicalParsed = clinicalProfileSchema.safeParse(state.clinical);
      if (!clinicalParsed.success) {
        setStep('clinical');
        return 'חלק מפרטי השאלון חסרים — נא להשלים אותם';
      }

      // Persist legal + truthfulness into questionnaire_data.legal before checkout intent.
      const legalSave = await saveOnboardingLead({
        leadId: state.leadId,
        contact: {
          fullName: state.contact.fullName,
          phone: state.contact.phone,
          email: state.contact.email,
        },
        painLevel: clinicalParsed.data.painLevel,
        questionnaire: buildQuestionnaireData(state.redFlags, clinicalParsed.data, {
          termsAccepted: true,
          privacyAccepted: true,
          medicalDisclaimerAccepted: true,
          answersTruthful: true,
          declarationText: FINAL_LEGAL_CONSENT_TEXT,
          acceptedAt: new Date().toISOString(),
        }),
      });
      if (!legalSave.ok) {
        return legalSave.message;
      }

      const result = await updateOnboardingLeadStatus(
        state.leadId,
        plan === 'paybox' ? 'pending_paybox' : 'pending_zoom'
      );
      if (!result.ok) {
        return result.message;
      }

      completeWizard(plan);
      const url = getPlanUrl(plan);
      if (url) {
        // Best effort — popup blockers may stop this; CompletionView shows a fallback link.
        window.open(url, '_blank', 'noopener,noreferrer');
      }
      return null;
    },
    [
      state.leadId,
      state.disclaimerAccepted,
      state.clinical,
      state.contact,
      state.redFlags,
      completeWizard,
      setStep,
    ]
  );

  const renderStep = () => {
    if (state.completed && state.chosenPlan) {
      return <CompletionView plan={state.chosenPlan} />;
    }
    switch (state.step) {
      case 'redFlags':
        return (
          <RedFlagStep
            answers={state.redFlags}
            onAnswer={setRedFlagAnswer}
            onHardStop={triggerHardStop}
            onContinue={() => setStep('clinical')}
          />
        );
      case 'clinical':
        return (
          <ClinicalProfileStep
            clinical={state.clinical}
            onUpdate={updateClinical}
            onBack={() => setStep('redFlags')}
            onContinue={() => setStep('contact')}
          />
        );
      case 'contact':
        return (
          <LeadCaptureStep
            contact={state.contact}
            onUpdate={updateContact}
            onSubmit={handleContactSubmit}
            onBack={() => setStep('clinical')}
          />
        );
      case 'disclaimer':
        return (
          <DisclaimerStep
            accepted={state.disclaimerAccepted}
            onAcceptedChange={setDisclaimerAccepted}
            onBack={() => setStep('contact')}
            onContinue={() => setStep('plans')}
          />
        );
      case 'plans':
        return (
          <PlanSelectionStep
            painLevel={state.clinical.painLevel}
            onChoosePlan={handleChoosePlan}
          />
        );
    }
  };

  return (
    <div dir="rtl" className="min-h-dvh bg-gradient-to-b from-teal-50 via-slate-50 to-white">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)] pt-6">
        <header className="mb-5 text-center">
          <p className="text-xs font-bold tracking-widest text-teal-700">PHYSIOSHIELD</p>
          <h1 className="mt-1 text-xl font-bold text-slate-900">הצטרפות לתוכנית שיקום</h1>
        </header>

        {!state.completed && !state.hardStopped && (
          <div className="mb-5">
            <WizardProgress step={state.step} />
          </div>
        )}

        <main className="flex-1">{renderStep()}</main>

        <footer className="mt-8 flex items-center justify-center gap-4 text-xs text-slate-400">
          <Link to="/legal/terms-of-use" className="hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-teal-500 rounded">
            תנאי שימוש
          </Link>
          <Link to="/legal/privacy-policy" className="hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-teal-500 rounded">
            מדיניות פרטיות
          </Link>
          <Link to="/login" className="hover:text-slate-600 focus-visible:ring-2 focus-visible:ring-teal-500 rounded">
            כניסה לחשבון קיים
          </Link>
        </footer>
      </div>

      {state.hardStopped && <HardStopModal onRestart={resetWizard} />}
    </div>
  );
}
