import { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertOctagon, Loader2, Video, Dumbbell } from 'lucide-react';
import {
  FINAL_LEGAL_CONSENT_TEXT,
  HIGH_PAIN_BLOCK_MESSAGE,
  isGenericPlanBlocked,
} from '../../services/onboardingLeadService';
import type { ChosenPlan } from '../../hooks/useOnboardingWizard';
import { LEGAL_PAGE_PATHS } from '../legal/legalPaths';
import { WIZARD_CARD_CLASS, WIZARD_PRIMARY_BUTTON_CLASS } from './wizardUi';

export const GENERIC_PLAN_TITLE = 'תוכנית תרגול עצמאית';
export const GENERIC_PLAN_DESCRIPTION =
  'הכלים, התרגילים וההנחיות שיעזרו לך לעודד תנועה נכונה ולתמוך בתהליך ההחלמה. מבוסס על פרוטוקולים מקצועיים להתקדמות בקצב שלך.';

export const PREMIUM_PLAN_TITLE = 'שיקום בליווי אישי מלא (בדיקת Zoom)';
export const PREMIUM_PLAN_DESCRIPTION =
  'לא עוד ניחושים. בדיקה מעמיקה מרחוק, תוכנית שיקום שתפורה בדיוק לנתונים שלך, מעקב קבוע וזמינות של פיזיותרפיסט מוסמך.';

type PlanSelectionStepProps = {
  painLevel: number | null;
  /** Persists the checkout intent; resolves to an error message, or null on success. */
  onChoosePlan: (plan: ChosenPlan) => Promise<string | null>;
};

export default function PlanSelectionStep({ painLevel, onChoosePlan }: PlanSelectionStepProps) {
  const [busyPlan, setBusyPlan] = useState<ChosenPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [legalAccepted, setLegalAccepted] = useState(false);
  const genericBlocked = isGenericPlanBlocked(painLevel);
  const actionsDisabled = busyPlan !== null || !legalAccepted;

  const choose = async (plan: ChosenPlan) => {
    if (busyPlan || !legalAccepted) return;
    setError(null);
    setBusyPlan(plan);
    try {
      const errorMessage = await onChoosePlan(plan);
      if (errorMessage) {
        setError(errorMessage);
      }
    } finally {
      setBusyPlan(null);
    }
  };

  return (
    <section dir="rtl" className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">בחירת מסלול</h1>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
          על סמך התשובות שלך, אלו המסלולים הזמינים עבורך.
        </p>
      </div>

      <div className={`${WIZARD_CARD_CLASS} space-y-3`}>
        <label className="flex cursor-pointer items-start gap-3 touch-manipulation">
          <input
            type="checkbox"
            checked={legalAccepted}
            onChange={(e) => setLegalAccepted(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 accent-teal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          />
          <span className="text-sm leading-relaxed text-slate-700">
            {FINAL_LEGAL_CONSENT_TEXT}{' '}
            <span className="block mt-1.5 text-xs text-slate-500">
              לעיון:{' '}
              <Link
                to={LEGAL_PAGE_PATHS[0]}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-teal-700 underline underline-offset-2"
                onClick={(e) => e.stopPropagation()}
              >
                תנאי שימוש
              </Link>
              {' · '}
              <Link
                to={LEGAL_PAGE_PATHS[1]}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-teal-700 underline underline-offset-2"
                onClick={(e) => e.stopPropagation()}
              >
                מדיניות פרטיות
              </Link>
              {' · '}
              <Link
                to={LEGAL_PAGE_PATHS[2]}
                target="_blank"
                rel="noopener noreferrer"
                className="font-semibold text-teal-700 underline underline-offset-2"
                onClick={(e) => e.stopPropagation()}
              >
                הצהרה רפואית
              </Link>
            </span>
          </span>
        </label>
        {!legalAccepted && (
          <p className="text-xs text-slate-500">
            יש לאשר את תנאי השימוש, הפרטיות, ההצהרה הרפואית ונכונות הפרטים כדי לבחור מסלול
          </p>
        )}
      </div>

      {genericBlocked ? (
        <div
          role="status"
          className="rounded-2xl border border-amber-300 bg-amber-50 p-5 flex items-start gap-3"
        >
          <AlertOctagon className="mt-0.5 h-6 w-6 shrink-0 text-amber-600" aria-hidden="true" />
          <p className="text-sm font-medium leading-relaxed text-amber-900">
            {HIGH_PAIN_BLOCK_MESSAGE}
          </p>
        </div>
      ) : (
        <div className={WIZARD_CARD_CLASS}>
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-100">
              <Dumbbell className="h-5 w-5 text-slate-600" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-bold text-slate-900">{GENERIC_PLAN_TITLE}</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                {GENERIC_PLAN_DESCRIPTION}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void choose('paybox')}
            disabled={actionsDisabled}
            className={`${WIZARD_PRIMARY_BUTTON_CLASS} mt-4`}
          >
            {busyPlan === 'paybox' ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                רק רגע...
              </span>
            ) : (
              'מעבר לתשלום בפייבוקס'
            )}
          </button>
        </div>
      )}

      <div className={`${WIZARD_CARD_CLASS} border-teal-300 ring-1 ring-teal-100`}>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100">
            <Video className="h-5 w-5 text-teal-700" aria-hidden="true" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-bold text-slate-900">{PREMIUM_PLAN_TITLE}</h2>
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-xs font-semibold text-teal-700">
                מומלץ
              </span>
            </div>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {PREMIUM_PLAN_DESCRIPTION}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void choose('zoom')}
          disabled={actionsDisabled}
          className={`${WIZARD_PRIMARY_BUTTON_CLASS} mt-4`}
        >
          {busyPlan === 'zoom' ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              רק רגע...
            </span>
          ) : (
            'תיאום בדיקת Zoom'
          )}
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
          {error}
        </p>
      )}
    </section>
  );
}
