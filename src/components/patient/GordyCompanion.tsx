import GuardiMascotIcon, { type GuardiMood } from './GordyMascotIcon';

export type GuardiTransientAppearance = {
  key: string;
  mood: 'like' | 'joy' | 'concerned';
  bubble: string;
  until: number;
};

type Props = {
  eligible: boolean;
  exerciseSafetyLocked: boolean;
  redFlagPortalLock: boolean;
  transient: GuardiTransientAppearance | null;
  /** Increment when XP / rewards fire so the 3D mascot can celebrate in-frame. */
  celebrateBurstKey?: number;
  /**
   * Tab / screen context for default clips (e.g. `Exercise1` on workouts). Overridden by transient
   * bubble moods when those are active.
   */
  contextAnimationName?: string;
  /** הערת מזג/טבע יומית (מסע ההר) — יציבה ליום הקליני */
  ambientEnvironmentBubble?: string | null;
};

/**
 * גארדי למטה-ימין — מוסתר כברירת מחדל; מופיע בפייד עדין לאבני דרך או במצב שומר קליני.
 */
export default function GuardiCompanion({
  eligible,
  exerciseSafetyLocked,
  redFlagPortalLock,
  transient,
  celebrateBurstKey = 0,
  contextAnimationName,
  ambientEnvironmentBubble,
}: Props) {
  const protectiveSafety = exerciseSafetyLocked;
  const protectiveRed = redFlagPortalLock && !exerciseSafetyLocked;

  const transientLive =
    transient != null &&
    typeof transient.until === 'number' &&
    // eslint-disable-next-line react-hooks/purity -- TTL check for transient bubble (wall clock)
    Date.now() < transient.until;

  const ambientTrimmed =
    typeof ambientEnvironmentBubble === 'string' ? ambientEnvironmentBubble.trim() : '';
  const hasAmbient = ambientTrimmed.length > 0;

  const show =
    eligible &&
    (protectiveSafety || protectiveRed || transientLive || hasAmbient);

  if (!show) return null;

  let mascotMood: GuardiMood = 'default';
  let bubble: string | null = null;
  let bubbleTitle = 'גארדי';
  let bubbleProtective = false;

  if (protectiveSafety) {
    mascotMood = 'sad';
    bubbleTitle = 'מצב שומר';
    bubbleProtective = true;
    bubble =
      'עצרתי את האימון לרגע למען הבטיחות — דווח כאב חזק מדי באזור השיקום. המטפל קיבל עדכון. נשארים בזהירות!';
  } else if (protectiveRed) {
    mascotMood = 'sad';
    bubbleTitle = 'מצב שומר';
    bubbleProtective = true;
    bubble =
      'התרגול נעול כרגע לפי הנחיית הצוות. המטפל עודכן. אם יש חשד לחירום — התקשרו ל־101.';
  } else if (transientLive && transient) {
    mascotMood =
      transient.mood === 'concerned'
        ? 'sad'
        : transient.mood === 'joy'
          ? 'joy'
          : 'like';
    bubbleTitle = 'גארדי';
    bubble = transient.bubble;
  } else if (hasAmbient) {
    mascotMood = 'joy';
    bubbleTitle = 'גארדי';
    bubble = ambientTrimmed;
  }

  const showBubble = bubble != null;

  let resolvedAnimation: string | undefined;
  if (protectiveSafety || protectiveRed) {
    resolvedAnimation = 'Sad';
  } else if (transientLive && transient) {
    if (transient.mood === 'joy') resolvedAnimation = 'Wave';
    else if (transient.mood === 'like') resolvedAnimation = 'Like';
    else resolvedAnimation = 'Sad';
  } else if (hasAmbient) {
    resolvedAnimation = 'Wave';
  } else {
    resolvedAnimation = contextAnimationName;
  }

  const poseForCanvas =
    mascotMood === 'joy' || mascotMood === 'like' ? ('default' as const) : ('sad' as const);

  const animKey = [
    protectiveSafety ? 's1' : '',
    protectiveRed ? 'r1' : '',
    transientLive && transient ? transient.key : '',
  ].join('-');

  return (
    <div
      className="fixed z-[62] flex flex-col items-end gap-2 pointer-events-none max-w-[min(300px,calc(100vw-2rem))] animate-guardi-companion-enter"
      style={{
        bottom: 'calc(5.75rem + env(safe-area-inset-bottom, 0px))',
        right: 'max(12px, env(safe-area-inset-right, 0px))',
        left: 'auto',
      }}
      key={animKey}
      aria-live="polite"
    >
      {showBubble && (
        <div
          className="pointer-events-none relative rounded-2xl border-2 px-3.5 py-2.5 animate-guardi-welcome-in"
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
            className="absolute -bottom-1.5 end-8 w-3 h-3 rotate-45 border-2 border-t-0 border-e-0"
            style={{
              background: '#ffffff',
              borderColor: bubbleProtective ? '#fecaca' : '#a7f3d0',
            }}
            aria-hidden
          />
        </div>
      )}

      <div
        className="pointer-events-none flex items-center justify-center rounded-3xl p-2 shadow-lg bg-white/95"
        style={{
          boxShadow: '0 12px 32px -10px rgba(15, 23, 42, 0.2)',
        }}
      >
        <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-slate-50 to-white w-[min(280px,calc(100vw-3rem))] h-[min(280px,calc(100vw-3rem))] shrink-0">
          <GuardiMascotIcon
            mood={mascotMood}
            animationName={resolvedAnimation}
            className="h-full w-full"
            celebrateBurstKey={celebrateBurstKey}
            therapistMaterialAlert={bubbleProtective}
            displayScaleFactor={5}
            poseVariant={poseForCanvas}
            stylizedEyes
          />
        </div>
      </div>
    </div>
  );
}
