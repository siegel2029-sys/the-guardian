import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { leadContactSchema, type LeadContact } from '../../services/onboardingLeadService';
import type { ContactDraft } from '../../hooks/useOnboardingWizard';
import {
  WIZARD_CARD_CLASS,
  WIZARD_ERROR_CLASS,
  WIZARD_INPUT_CLASS,
  WIZARD_LABEL_CLASS,
  WIZARD_PRIMARY_BUTTON_CLASS,
  WIZARD_SECONDARY_BUTTON_CLASS,
} from './wizardUi';

type LeadCaptureStepProps = {
  contact: ContactDraft;
  onUpdate: (partial: Partial<ContactDraft>) => void;
  /** Persists the lead; resolves to an error message, or null on success. */
  onSubmit: (contact: LeadContact) => Promise<string | null>;
  onBack: () => void;
};

type FieldErrors = Partial<Record<keyof ContactDraft, string>>;

export default function LeadCaptureStep({
  contact,
  onUpdate,
  onSubmit,
  onBack,
}: LeadCaptureStepProps) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    const result = leadContactSchema.safeParse(contact);
    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const field = issue.path[0] as keyof ContactDraft | undefined;
        if (field && !next[field]) {
          next[field] = issue.message;
        }
      }
      setErrors(next);
      return;
    }
    setErrors({});
    setSubmitError(null);
    setSubmitting(true);
    try {
      const errorMessage = await onSubmit(result.data);
      if (errorMessage) {
        setSubmitError(errorMessage);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const clearError = (field: keyof ContactDraft) => {
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
  };

  return (
    <section dir="rtl" className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">פרטי התקשרות</h1>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
          עוד רגע מציגים לך את המסלולים — נשמח לפרטים כדי שנוכל לחזור אליך ולסייע.
        </p>
      </div>

      <form
        className={`${WIZARD_CARD_CLASS} space-y-5`}
        onSubmit={(e) => {
          e.preventDefault();
          void handleSubmit();
        }}
        noValidate
      >
        <div>
          <label htmlFor="lead-full-name" className={WIZARD_LABEL_CLASS}>
            שם מלא
          </label>
          <input
            id="lead-full-name"
            type="text"
            autoComplete="name"
            value={contact.fullName}
            onChange={(e) => {
              onUpdate({ fullName: e.target.value });
              clearError('fullName');
            }}
            placeholder="שם פרטי ומשפחה"
            className={WIZARD_INPUT_CLASS}
            aria-invalid={Boolean(errors.fullName)}
          />
          {errors.fullName && <p className={WIZARD_ERROR_CLASS}>{errors.fullName}</p>}
        </div>

        <div>
          <label htmlFor="lead-phone" className={WIZARD_LABEL_CLASS}>
            טלפון נייד
          </label>
          <input
            id="lead-phone"
            type="tel"
            inputMode="tel"
            dir="ltr"
            autoComplete="tel"
            value={contact.phone}
            onChange={(e) => {
              onUpdate({ phone: e.target.value });
              clearError('phone');
            }}
            placeholder="050-1234567"
            className={`${WIZARD_INPUT_CLASS} text-left`}
            aria-invalid={Boolean(errors.phone)}
          />
          {errors.phone && <p className={WIZARD_ERROR_CLASS}>{errors.phone}</p>}
        </div>

        <div>
          <label htmlFor="lead-email" className={WIZARD_LABEL_CLASS}>
            אימייל
          </label>
          <input
            id="lead-email"
            type="email"
            inputMode="email"
            dir="ltr"
            autoComplete="email"
            value={contact.email}
            onChange={(e) => {
              onUpdate({ email: e.target.value });
              clearError('email');
            }}
            placeholder="name@example.com"
            className={`${WIZARD_INPUT_CLASS} text-left`}
            aria-invalid={Boolean(errors.email)}
          />
          {errors.email && <p className={WIZARD_ERROR_CLASS}>{errors.email}</p>}
        </div>

        {submitError && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
            {submitError}
          </p>
        )}

        <div className="flex flex-col gap-2">
          <button type="submit" disabled={submitting} className={WIZARD_PRIMARY_BUTTON_CLASS}>
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                שומר...
              </span>
            ) : (
              'המשך'
            )}
          </button>
          <button
            type="button"
            onClick={onBack}
            disabled={submitting}
            className={WIZARD_SECONDARY_BUTTON_CLASS}
          >
            חזרה
          </button>
        </div>
      </form>
    </section>
  );
}
