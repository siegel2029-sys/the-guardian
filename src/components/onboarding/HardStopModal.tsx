import { AlertTriangle } from 'lucide-react';
import { RED_FLAG_HARD_STOP_MESSAGE } from '../../services/onboardingLeadService';
import { WIZARD_SECONDARY_BUTTON_CLASS } from './wizardUi';

/**
 * Mandatory clinical hard-stop shown when any red-flag question is answered "yes".
 * The flow is terminated; the only action offered is restarting the screening
 * (covers accidental taps) — there is no way to continue past this gate.
 */
export default function HardStopModal({ onRestart }: { onRestart: () => void }) {
  return (
    <div
      dir="rtl"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="hard-stop-title"
      aria-describedby="hard-stop-message"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="flex flex-col items-center text-center gap-3">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <AlertTriangle className="h-7 w-7 text-red-600" aria-hidden="true" />
          </span>
          <h2 id="hard-stop-title" className="text-lg font-bold text-slate-900">
            נדרשת בדיקה רפואית
          </h2>
          <p id="hard-stop-message" className="text-base leading-relaxed text-slate-700">
            {RED_FLAG_HARD_STOP_MESSAGE}
          </p>
        </div>
        <div className="mt-6">
          <button type="button" onClick={onRestart} className={WIZARD_SECONDARY_BUTTON_CLASS}>
            עניתי בטעות — מילוי השאלון מחדש
          </button>
        </div>
      </div>
    </div>
  );
}
