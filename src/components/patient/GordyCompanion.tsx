import GordyMascotIcon, { type GordyMood } from './GordyMascotIcon';

export type GordyTransientAppearance = {
  key: string;
  mood: 'like' | 'joy' | 'concerned';
  bubble: string;
  until: number;
};

type Props = {
  /** מסך בית/אימונים בלי מודאלים חוסמים */
  eligible: boolean;
  exerciseSafetyLocked: boolean;
  redFlagPortalLock: boolean;
  /** סיום תרגיל, דיווח יומי, או זיהוי מילות מפתח חירום בצ׳אט */
  transient: GordyTransientAppearance | null;
};

/**
 * גורדי למטה-ימין — מוסתר כברירת מחדל; מופיע בפייד עדין לאבני דרך או במצב שומר קליני.
 */
export default function GordyCompanion({
  eligible,
  exerciseSafetyLocked,
  redFlagPortalLock,
  transient,
}: Props) {
  const protectiveSafety = exerciseSafetyLocked;
  const protectiveRed = redFlagPortalLock && !exerciseSafetyLocked;

  const transientLive =
    transient != null && typeof transient.until === 'number' && Date.now() < transient.until;

  const show = eligible && (protectiveSafety || protectiveRed || transientLive);

  if (!show) return null;

  let mascotMood: GordyMood = 'default';
  let bubble: string | null = null;
  let bubbleTitle = 'גורדי';
  let bubbleProtective = false;

  if (protectiveSafety) {
    mascotMood = 'concerned';
    bubbleTitle = 'מצב שומר';
    bubbleProtective = true;
    bubble =
      'עצרתי את האימון לרגע למען הבטיחות — דווח כאב חזק מדי באזור השיקום. המטפל קיבל עדכון. נשארים בזהירות!';
  } else if (protectiveRed) {
    mascotMood = 'concerned';
    bubbleTitle = 'מצב שומר';
    bubbleProtective = true;
    bubble =
      'התרגול נעול כרגע לפי הנחיית הצוות. המטפל עודכן. אם יש חשד לחירום — התקשרו ל־101.';
  } else if (transientLive && transient) {
    mascotMood = transient.mood;
    bubbleTitle = 'גורדי';
    bubble = transient.bubble;
  }

  const showBubble = bubble != null;

  const animKey = [
    protectiveSafety ? 's1' : '',
    protectiveRed ? 'r1' : '',
    transientLive && transient ? transient.key : '',
  ].join('-');

  return (
    <div
      className="fixed z-[62] flex flex-col items-center gap-2 pointer-events-none max-w-[min(300px,calc(100vw-5.5rem))] animate-gordy-companion-enter"
      style={{
        bottom: 'calc(5.75rem + env(safe-area-inset-bottom, 0px))',
        insetInlineStart: 'max(12px, env(safe-area-inset-left, 0px))',
      }}
      key={animKey}
      aria-live="polite"
    >
      {showBubble && (
        <div
          className="pointer-events-none relative rounded-2xl border-2 px-3.5 py-2.5 animate-gordy-welcome-in"
          style={{
            borderColor: bubbleProtective ? '#fecaca' : '#a7f3d0',
            background: bubbleProtective
              ? 'linear-gradient(145deg,#fef2f2,#fff)'
              : 'linear-gradient(145deg,#ecfdf5,#ffffff)',
            boxShadow: '0 12px 32px -10px rgba(15,23,42,0.25)',
          }}
          role="status"
        >
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500 mb-0.5">
            {bubbleTitle}
          </p>
          <p
            className={`text-xs sm:text-sm font-semibold leading-snug ${
              bubbleProtective ? 'text-red-950' : 'text-teal-950'
            }`}
          >
            {bubble}
          </p>
          <span
            className="absolute -bottom-1.5 start-8 w-3 h-3 rotate-45 border-2 border-t-0 border-e-0"
            style={{
              background: '#ffffff',
              borderColor: bubbleProtective ? '#fecaca' : '#a7f3d0',
            }}
            aria-hidden
          />
        </div>
      )}

      <div
        className={`pointer-events-none flex items-center justify-center rounded-3xl p-1.5 shadow-lg border-2 animate-gordy-companion-float ${
          bubbleProtective
            ? 'border-red-300/90 bg-red-50/95'
            : 'border-amber-200/90 bg-gradient-to-br from-amber-50 to-white'
        }`}
        style={{
          boxShadow: '0 10px 28px -8px rgba(245, 158, 11, 0.45)',
        }}
      >
        <GordyMascotIcon mood={mascotMood} className="w-14 h-14 sm:w-16 sm:h-16" />
      </div>
    </div>
  );
}
