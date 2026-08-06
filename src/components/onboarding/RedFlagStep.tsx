import { ShieldAlert } from 'lucide-react';
import {
  allRedFlagsAnswered,
  hasAnyRedFlag,
  RED_FLAG_QUESTIONS,
  type RedFlagAnswers,
  type RedFlagId,
} from '../../services/onboardingLeadService';
import { WIZARD_CARD_CLASS, WIZARD_PRIMARY_BUTTON_CLASS } from './wizardUi';

type RedFlagStepProps = {
  answers: RedFlagAnswers;
  onAnswer: (id: RedFlagId, answer: boolean) => void;
  /** Fired immediately when any question is answered "yes" (mandatory hard stop). */
  onHardStop: () => void;
  onContinue: () => void;
};

function AnswerToggle({
  questionId,
  value,
  onSelect,
}: {
  questionId: RedFlagId;
  value: boolean | null;
  onSelect: (answer: boolean) => void;
}) {
  const baseClass =
    'flex-1 min-h-[44px] rounded-xl border text-base font-semibold transition-colors touch-manipulation focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1';
  return (
    <div className="flex gap-2" role="radiogroup" aria-labelledby={`red-flag-q-${questionId}`}>
      <button
        type="button"
        role="radio"
        aria-checked={value === true}
        onClick={() => onSelect(true)}
        className={`${baseClass} ${
          value === true
            ? 'border-red-500 bg-red-50 text-red-700'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        כן
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={value === false}
        onClick={() => onSelect(false)}
        className={`${baseClass} ${
          value === false
            ? 'border-teal-500 bg-teal-50 text-teal-700'
            : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
        }`}
      >
        לא
      </button>
    </div>
  );
}

export default function RedFlagStep({
  answers,
  onAnswer,
  onHardStop,
  onContinue,
}: RedFlagStepProps) {
  const handleSelect = (id: RedFlagId, answer: boolean) => {
    onAnswer(id, answer);
    if (answer) {
      onHardStop();
    }
  };

  const canContinue = allRedFlagsAnswered(answers) && !hasAnyRedFlag(answers);

  return (
    <section dir="rtl" className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-teal-100">
          <ShieldAlert className="h-5 w-5 text-teal-700" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-lg font-bold text-slate-900">שאלון בטיחות רפואית</h1>
          <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
            כמה שאלות קצרות כדי לוודא שתרגול מרחוק בטוח עבורך. נא לענות בכנות על כולן.
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {RED_FLAG_QUESTIONS.map(({ id, question }) => (
          <div key={id} className={WIZARD_CARD_CLASS}>
            <p id={`red-flag-q-${id}`} className="mb-3 text-base font-medium leading-relaxed text-slate-800">
              {question}
            </p>
            <AnswerToggle questionId={id} value={answers[id]} onSelect={(a) => handleSelect(id, a)} />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={onContinue}
        disabled={!canContinue}
        className={WIZARD_PRIMARY_BUTTON_CLASS}
      >
        המשך
      </button>
      {!canContinue && (
        <p className="text-center text-sm text-slate-500">יש לענות על כל השאלות כדי להמשיך</p>
      )}
    </section>
  );
}
