import { Link } from 'react-router-dom';
import { LEGAL_PAGE_PATHS } from '../legal/legalPaths';
import {
  WIZARD_CARD_CLASS,
  WIZARD_PRIMARY_BUTTON_CLASS,
  WIZARD_SECONDARY_BUTTON_CLASS,
} from './wizardUi';

export const DISCLAIMER_TEXT =
  'אני מצהיר כי קראתי ואני מאשר שתוכנית זו הינה בגדר הדרכת כושר ותנועה מרחוק ואינה מהווה תחליף לאבחון רפואי פרונטלי. ביצוע התרגילים נעשה על אחריותי ובכל מקרה של החמרה, עליי להפסיק ולהיוועץ ברופא. בנוסף, ידוע לי כי המערכת נמצאת כעת בשלבי פיילוט (בטא), וייתכנו בה באגים או תקלות טכניות.';

type DisclaimerStepProps = {
  accepted: boolean;
  onAcceptedChange: (accepted: boolean) => void;
  onBack: () => void;
  onContinue: () => void;
};

export default function DisclaimerStep({
  accepted,
  onAcceptedChange,
  onBack,
  onContinue,
}: DisclaimerStepProps) {
  return (
    <section dir="rtl" className="space-y-4">
      <div>
        <h1 className="text-lg font-bold text-slate-900">הצהרה ואישור משפטי</h1>
        <p className="mt-0.5 text-sm leading-relaxed text-slate-600">
          לפני בחירת המסלול, יש לקרוא ולאשר את המסמכים וההצהרה הקלינית.
        </p>
      </div>

      <div className={`${WIZARD_CARD_CLASS} space-y-4`}>
        <div>
          <p className="text-sm font-semibold text-slate-800 mb-2">מסמכים משפטיים</p>
          <ul className="space-y-1.5 text-sm">
            <li>
              <Link
                to={LEGAL_PAGE_PATHS[0]}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded"
              >
                תנאי שימוש
              </Link>
            </li>
            <li>
              <Link
                to={LEGAL_PAGE_PATHS[1]}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded"
              >
                מדיניות פרטיות
              </Link>
            </li>
            <li>
              <Link
                to={LEGAL_PAGE_PATHS[2]}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-teal-700 underline underline-offset-2 hover:text-teal-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 rounded"
              >
                הצהרה רפואית
              </Link>
            </li>
          </ul>
        </div>

        <label className="flex cursor-pointer items-start gap-3 touch-manipulation">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => onAcceptedChange(e.target.checked)}
            className="mt-1 h-5 w-5 shrink-0 rounded border-slate-300 accent-teal-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-500"
          />
          <span className="text-sm leading-relaxed text-slate-700">
            קראתי ואני מסכים/ה ל
            <span className="font-semibold">תנאי השימוש</span>,{' '}
            <span className="font-semibold">מדיניות הפרטיות</span> ו
            <span className="font-semibold">ההצהרה הרפואית</span>. {DISCLAIMER_TEXT}
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onContinue}
          disabled={!accepted}
          className={WIZARD_PRIMARY_BUTTON_CLASS}
        >
          המשך לבחירת מסלול
        </button>
        <button type="button" onClick={onBack} className={WIZARD_SECONDARY_BUTTON_CLASS}>
          חזרה
        </button>
      </div>
      {!accepted && (
        <p className="text-center text-sm text-slate-500">יש לאשר את ההצהרה והמסמכים כדי להמשיך</p>
      )}
    </section>
  );
}
