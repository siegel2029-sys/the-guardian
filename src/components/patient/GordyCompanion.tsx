import { X } from 'lucide-react';
import GordyMascotIcon, { type GordyMood } from './GordyMascotIcon';

type Props = {
  /** מסך בית פעיל, בלי מודאלים חוסמים */
  visible: boolean;
  /** נעילת בטיחות (כאב גבוה במוקד פגיעה) */
  exerciseSafetyLocked: boolean;
  /** נעילת דגל אדום בפורטל */
  redFlagPortalLock: boolean;
  /** הצגת עידוד חצי־דרך */
  showHalfwayEncouragement: boolean;
  onDismissHalfway: () => void;
};

/**
 * גורדי כמלווה צף (סגנון Duolingo) — עידוד, מצב שומר, בועת טקסט.
 * חגיגת סיום מלאה מטופלת ב־GordyFullScreenCelebration נפרד.
 */
export default function GordyCompanion({
  visible,
  exerciseSafetyLocked,
  redFlagPortalLock,
  showHalfwayEncouragement,
  onDismissHalfway,
}: Props) {
  if (!visible) return null;

  const protectiveSafety = exerciseSafetyLocked;
  const protectiveRed = redFlagPortalLock && !exerciseSafetyLocked;

  let mood: GordyMood = 'default';
  let bubble: string | null = null;
  let bubbleTitle = 'גורדי';

  if (protectiveSafety) {
    mood = 'concerned';
    bubbleTitle = 'מצב שומר';
    bubble =
      'עצרתי את האימון לרגע למען הבטיחות — דווח כאב חזק מדי באזור השיקום. המטפל קיבל עדכון. נשארים בזהירות!';
  } else if (protectiveRed) {
    mood = 'concerned';
    bubbleTitle = 'מצב שומר';
    bubble =
      'התרגול נעול כרגע לפי הנחיית הצוות. המטפל עודכן. אם יש חשד לחירום — התקשרו ל־101.';
  } else if (showHalfwayEncouragement) {
    bubble = 'חצי דרך עברה, ממשיכים בכל הכוח!';
  }

  const showBubble = bubble != null;

  return (
    <div
      className="fixed z-[62] flex flex-col items-center gap-2 pointer-events-none max-w-[min(300px,calc(100vw-5.5rem))]"
      style={{
        bottom: 'calc(5.75rem + env(safe-area-inset-bottom, 0px))',
        insetInlineStart: 'max(12px, env(safe-area-inset-left, 0px))',
      }}
      aria-live="polite"
    >
      {showBubble && (
        <div
          className="pointer-events-auto relative rounded-2xl border-2 shadow-xl px-3.5 py-2.5 pe-9 animate-gordy-welcome-in"
          style={{
            borderColor: protectiveSafety || protectiveRed ? '#fecaca' : '#a7f3d0',
            background:
              protectiveSafety || protectiveRed
                ? 'linear-gradient(145deg,#fef2f2,#fff)'
                : 'linear-gradient(145deg,#ecfdf5,#ffffff)',
            boxShadow: '0 12px 32px -10px rgba(15,23,42,0.25)',
          }}
          role="status"
        >
          {!protectiveSafety && !protectiveRed && (
            <button
              type="button"
              onClick={onDismissHalfway}
              className="absolute top-2 end-2 p-1 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="סגור"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 mb-0.5">
            {bubbleTitle}
          </p>
          <p
            className={`text-xs sm:text-sm font-semibold leading-snug ${
              protectiveSafety || protectiveRed ? 'text-red-950' : 'text-teal-950'
            }`}
          >
            {bubble}
          </p>
          <span
            className="absolute -bottom-1.5 start-8 w-3 h-3 rotate-45 border-2 border-t-0 border-e-0"
            style={{
              background: protectiveSafety || protectiveRed ? '#fff' : '#ffffff',
              borderColor: protectiveSafety || protectiveRed ? '#fecaca' : '#a7f3d0',
            }}
            aria-hidden
          />
        </div>
      )}

      <div
        className={`pointer-events-none flex items-center justify-center rounded-3xl p-1.5 shadow-lg border-2 animate-gordy-companion-float ${
          protectiveSafety || protectiveRed
            ? 'border-red-300/90 bg-red-50/95'
            : 'border-amber-200/90 bg-gradient-to-br from-amber-50 to-white'
        }`}
        style={{
          boxShadow: '0 10px 28px -8px rgba(245, 158, 11, 0.45)',
        }}
      >
        <GordyMascotIcon mood={mood} className="w-14 h-14 sm:w-16 sm:h-16" />
      </div>
    </div>
  );
}
