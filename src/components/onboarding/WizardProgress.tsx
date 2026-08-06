import { ONBOARDING_STEP_ORDER, type OnboardingStep } from '../../hooks/useOnboardingWizard';

const STEP_LABELS: Record<OnboardingStep, string> = {
  redFlags: 'שאלון בטיחות',
  clinical: 'פרופיל קליני',
  contact: 'פרטי התקשרות',
  disclaimer: 'אישור והצהרה',
  plans: 'בחירת מסלול',
};

export default function WizardProgress({ step }: { step: OnboardingStep }) {
  const index = ONBOARDING_STEP_ORDER.indexOf(step);
  const total = ONBOARDING_STEP_ORDER.length;
  const percent = ((index + 1) / total) * 100;

  return (
    <div dir="rtl" aria-label={`שלב ${index + 1} מתוך ${total}: ${STEP_LABELS[step]}`}>
      <div className="flex items-baseline justify-between mb-1.5">
        <span className="text-sm font-semibold text-teal-700">{STEP_LABELS[step]}</span>
        <span className="text-xs font-medium text-slate-500 tabular-nums">
          שלב {index + 1} מתוך {total}
        </span>
      </div>
      <div
        className="h-2 w-full rounded-full bg-slate-200 overflow-hidden"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={index + 1}
      >
        <div
          className="h-full rounded-full bg-teal-600 transition-all duration-300"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
