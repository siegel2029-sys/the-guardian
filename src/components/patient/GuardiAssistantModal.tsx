import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { X } from 'lucide-react';

import imgFront from '../../assets/guardi/front.png';
import imgSuperman from '../../assets/guardi/supermen_pose_guardi.png';
import imgThumbUp from '../../assets/guardi/thumb_up_guardi.png';
import imgExcited from '../../assets/guardi/guardi_excited.png';
import imgSad from '../../assets/guardi/gurdi_sad.png';
import imgAfraid from '../../assets/guardi/gurdi_afraid.png';
import imgRelaxYoga from '../../assets/guardi/relax_yoga_guardi.png';
import imgLearning from '../../assets/guardi/gurdi_learning.png';
import type { GuardiSemanticKind } from '../../utils/guardiSemanticKinds';

export type { GuardiSemanticKind } from '../../utils/guardiSemanticKinds';

export type GuardiTransientAppearance = {
  key: string;
  mood: 'like' | 'joy' | 'concerned';
  /** מוצג כשאין `semantic` — אחרת נשענים על טקסט קנוני */
  bubble: string;
  until: number;
  /** מסנכרן תמונה + טקסט לפי מפת הקשר */
  semantic?: GuardiSemanticKind;
};

export type GuardiAssistantPlacement = 'bodyMap' | 'corner';

type Props = {
  eligible: boolean;
  exerciseSafetyLocked: boolean;
  redFlagPortalLock: boolean;
  transient: GuardiTransientAppearance | null;
  celebrateBurstKey?: number;
  contextAnimationName?: string;
  ambientEnvironmentBubble?: string | null;
  placement: GuardiAssistantPlacement;
  bodyMapAnchorRef?: RefObject<HTMLElement | null>;
  portalTab: 'home' | 'activity';
};

/**
 * טקסטים קנוניים (מיפוי לפי מצב) — תמונות: PNG ב־assets (שמות המקור ב־jpg בפרומפט).
 */
const GUARDI_CANONICAL: Record<GuardiSemanticKind, { imageSrc: string; text: string }> = {
  welcome: {
    imageSrc: imgFront,
    text: 'שלום! איזה כיף שחזרתם, בואו נתחיל.',
  },
  learning: {
    imageSrc: imgLearning,
    text: 'הידעת? פעילות גופנית מבוקרת מזרזת את תהליך ההחלמה!',
  },
  success: {
    imageSrc: imgThumbUp,
    text: 'כל הכבוד! ביצוע מעולה, המשך כך!',
  },
  pain: {
    imageSrc: imgSad,
    text: 'אוי, אני מצטער לשמוע. תרגישו טוב, בואו ננסה להבין איך להקל.',
  },
  pain_intense: {
    imageSrc: imgAfraid,
    text: 'אוי, אני מצטער לשמוע. תרגישו טוב, בואו ננסה להבין איך להקל.',
  },
  strength: {
    imageSrc: imgSuperman,
    text: 'קדימה, עוד קצת מאמץ וסיימנו!',
  },
};

export type GuardiResolvedPresentation = {
  imageSrc: string;
  bubbleText: string;
  bubbleTitle: string;
  bubbleProtective: boolean;
  /** מפתח ל־animation (תמונה + טקסט) */
  contentKey: string;
};

function moodFallbackImage(mood: GuardiTransientAppearance['mood']): string {
  if (mood === 'concerned') return imgAfraid;
  if (mood === 'joy') return imgExcited;
  return imgThumbUp;
}

/**
 * מחזיר תמונה + טקסט לבועה לפי מצב המטופל (שומר, transient, זמן, הקשר וכו׳).
 */
export function resolveGuardiPresentation(params: {
  protectiveSafety: boolean;
  protectiveRed: boolean;
  transientLive: boolean;
  transient: GuardiTransientAppearance | null;
  hasAmbient: boolean;
  ambientTrimmed: string;
  burstFlash: boolean;
  contextAnimationName?: string;
  portalTab: 'home' | 'activity';
}): GuardiResolvedPresentation {
  const {
    protectiveSafety,
    protectiveRed,
    transientLive,
    transient,
    hasAmbient,
    ambientTrimmed,
    burstFlash,
    contextAnimationName,
    portalTab,
  } = params;

  if (protectiveSafety) {
    return {
      imageSrc: imgAfraid,
      bubbleTitle: 'מצב שומר',
      bubbleProtective: true,
      bubbleText:
        'עצרתי את האימון לרגע למען הבטיחות — דווח כאב חזק מדי באזור השיקום. המטפל קיבל עדכון. נשארים בזהירות!',
      contentKey: 'prot-safety',
    };
  }

  if (protectiveRed) {
    return {
      imageSrc: imgSad,
      bubbleTitle: 'מצב שומר',
      bubbleProtective: true,
      bubbleText:
        'התרגול נעול כרגע לפי הנחיית הצוות. המטפל עודכן. אם יש חשד לחירום — התקשרו ל־101.',
      contentKey: 'prot-red',
    };
  }

  if (transientLive && transient) {
    if (transient.semantic) {
      const c = GUARDI_CANONICAL[transient.semantic];
      return {
        imageSrc: c.imageSrc,
        bubbleTitle: 'גארדי',
        bubbleProtective: false,
        bubbleText: c.text,
        contentKey: `sem-${transient.semantic}-${transient.key}`,
      };
    }
    return {
      imageSrc: moodFallbackImage(transient.mood),
      bubbleTitle: 'גארדי',
      bubbleProtective: false,
      bubbleText: transient.bubble,
      contentKey: `tr-${transient.key}-${transient.mood}`,
    };
  }

  /** חגיגת XP — מעל ambient כדי שייראה גם כשיש שורת הר/נוף */
  if (burstFlash && !protectiveSafety && !protectiveRed) {
    const c = GUARDI_CANONICAL.success;
    return {
      imageSrc: c.imageSrc,
      bubbleTitle: 'גארדי',
      bubbleProtective: false,
      bubbleText: c.text,
      contentKey: 'burst-success',
    };
  }

  if (hasAmbient) {
    return {
      imageSrc: portalTab === 'home' ? imgRelaxYoga : imgFront,
      bubbleTitle: 'גארדי',
      bubbleProtective: false,
      bubbleText: ambientTrimmed,
      contentKey: `amb-${portalTab}-${ambientTrimmed.slice(0, 24)}`,
    };
  }

  if (contextAnimationName === 'Exercise1') {
    const c = GUARDI_CANONICAL.strength;
    return {
      imageSrc: c.imageSrc,
      bubbleTitle: 'גארדי',
      bubbleProtective: false,
      bubbleText: c.text,
      contentKey: 'ctx-exercise-strength',
    };
  }

  if (contextAnimationName === 'Wave' || contextAnimationName === 'Like') {
    const c = GUARDI_CANONICAL.welcome;
    return {
      imageSrc: c.imageSrc,
      bubbleTitle: 'גארדי',
      bubbleProtective: false,
      bubbleText: c.text,
      contentKey: 'ctx-wave-welcome',
    };
  }

  if (portalTab === 'activity') {
    const c = GUARDI_CANONICAL.learning;
    return {
      imageSrc: c.imageSrc,
      bubbleTitle: 'גארדי',
      bubbleProtective: false,
      bubbleText: c.text,
      contentKey: 'fallback-activity-learning',
    };
  }

  const c = GUARDI_CANONICAL.welcome;
  return {
    imageSrc: c.imageSrc,
    bubbleTitle: 'גארדי',
    bubbleProtective: false,
    bubbleText: c.text,
    contentKey: 'fallback-home-welcome',
  };
}

function useAnchorRect(anchorRef: RefObject<HTMLElement | null> | undefined, enabled: boolean) {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useLayoutEffect(() => {
    if (!enabled || !anchorRef?.current) {
      setRect(null);
      return;
    }

    const el = anchorRef.current;

    const update = () => {
      setRect(el.getBoundingClientRect());
    };

    update();

    const ro = new ResizeObserver(update);
    ro.observe(el);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);

    return () => {
      ro.disconnect();
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [enabled, anchorRef]);

  return rect;
}

/**
 * גארדי כאווטאר 2D — בועה מעל מפת הגוף (או בפינה באימונים), נסגר בלחיצה על X או על הבועה.
 */
export default function GuardiAssistantModal({
  eligible,
  exerciseSafetyLocked,
  redFlagPortalLock,
  transient,
  celebrateBurstKey = 0,
  contextAnimationName,
  ambientEnvironmentBubble,
  placement,
  bodyMapAnchorRef,
  portalTab,
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

  const animKey = [
    protectiveSafety ? 's1' : '',
    protectiveRed ? 'r1' : '',
    transientLive && transient ? transient.key : '',
    hasAmbient ? `a:${ambientTrimmed.slice(0, 24)}` : '',
  ].join('-');

  const [dismissedKey, setDismissedKey] = useState<string | null>(null);

  useEffect(() => {
    if (!show) setDismissedKey(null);
  }, [show]);

  const prevBurstRef = useRef(0);
  const [burstFlash, setBurstFlash] = useState(false);

  useEffect(() => {
    if (celebrateBurstKey > 0 && celebrateBurstKey !== prevBurstRef.current) {
      prevBurstRef.current = celebrateBurstKey;
      setBurstFlash(true);
      const t = window.setTimeout(() => setBurstFlash(false), 1600);
      return () => clearTimeout(t);
    }
  }, [celebrateBurstKey]);

  const presentation = resolveGuardiPresentation({
    protectiveSafety,
    protectiveRed,
    transientLive,
    transient,
    hasAmbient,
    ambientTrimmed,
    burstFlash: burstFlash && !protectiveSafety && !protectiveRed,
    contextAnimationName,
    portalTab,
  });

  const visible = show && dismissedKey !== animKey;

  const overlayBodyMap = placement === 'bodyMap' && bodyMapAnchorRef != null;
  const rect = useAnchorRect(bodyMapAnchorRef, overlayBodyMap && visible);

  const handleDismiss = useCallback(() => {
    setDismissedKey(animKey);
  }, [animKey]);

  if (!visible) return null;

  if (overlayBodyMap && !rect) return null;

  const { imageSrc, bubbleText, bubbleTitle, bubbleProtective } = presentation;
  const swapKey = `${animKey}|${presentation.contentKey}`;

  const panel = (
    <div
      className={`flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:gap-3 ${overlayBodyMap ? 'max-h-[min(92%,420px)] w-[min(92%,min(100%,320px))]' : 'max-w-[min(300px,calc(100vw-2rem))]'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="guardi-assistant-title"
    >
      <div
        key={swapKey}
        className="animate-guardi-assistant-content-swap flex flex-col gap-2 sm:flex-1 sm:min-w-0 sm:flex-row sm:items-end sm:gap-3 w-full"
      >
        <div
          className="relative rounded-2xl border-2 px-3.5 py-2.5 pointer-events-auto cursor-pointer"
          style={{
            borderColor: bubbleProtective ? '#fecaca' : '#a7f3d0',
            background: bubbleProtective
              ? 'linear-gradient(145deg,#fef2f2,#fff)'
              : 'linear-gradient(145deg,#ecfdf5,#ffffff)',
            boxShadow: '0 12px 32px -10px rgba(15,23,42,0.25)',
          }}
          role="status"
          onClick={handleDismiss}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleDismiss();
            }
          }}
          tabIndex={0}
        >
          <p
            id="guardi-assistant-title"
            className="text-[10px] font-black uppercase tracking-wide text-slate-500 mb-0.5"
          >
            {bubbleTitle}
          </p>
          <p
            className={`text-xs sm:text-sm font-semibold leading-snug ${
              bubbleProtective ? 'text-red-950' : 'text-teal-950'
            }`}
          >
            {bubbleText}
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

        <div
          className="relative rounded-3xl p-2 shadow-lg bg-white/95 pointer-events-auto cursor-pointer shrink-0 mx-auto sm:mx-0"
          style={{
            boxShadow: '0 12px 32px -10px rgba(15, 23, 42, 0.2)',
          }}
          onClick={handleDismiss}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleDismiss();
            }
          }}
          tabIndex={0}
          aria-label="סגירת גארדי"
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleDismiss();
            }}
            className="absolute top-1.5 end-1.5 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-slate-900/75 text-white hover:bg-slate-900 shadow-md touch-manipulation"
            aria-label="סגירה"
          >
            <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </button>

          <div className="rounded-2xl overflow-hidden bg-gradient-to-b from-slate-50 to-white w-[min(240px,calc(100vw-4rem))] aspect-square shrink-0 mx-auto">
            <img
              key={imageSrc}
              src={imageSrc}
              alt=""
              className="h-full w-full object-contain object-bottom animate-guardi-assistant-image-fade-in"
              decoding="async"
              draggable={false}
            />
          </div>
        </div>
      </div>
    </div>
  );

  if (overlayBodyMap && rect) {
    return (
      <div
        className="fixed z-[60] flex flex-col items-center justify-center p-2 animate-guardi-companion-enter pointer-events-auto"
        style={{
          top: rect.top,
          left: rect.left,
          width: rect.width,
          height: rect.height,
        }}
        aria-live="polite"
      >
        <div className="absolute inset-0 rounded-[inherit] bg-slate-900/25 backdrop-blur-[1px]" aria-hidden />
        {panel}
      </div>
    );
  }

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
      <div className="pointer-events-auto">{panel}</div>
    </div>
  );
}
