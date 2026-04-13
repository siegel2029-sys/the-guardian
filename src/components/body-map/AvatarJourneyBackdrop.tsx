import {
  useMemo,
  useState,
  useEffect,
  useRef,
  useCallback,
  type CSSProperties,
  type AnimationEvent as ReactAnimationEvent,
} from 'react';
import {
  resolveAvatarScenicBackdrop,
  type AvatarJourneyBackgroundDef,
  type AvatarScenicBackdropSnapshot,
} from '../../utils/avatarDailyBackground';

export interface AvatarJourneyBackdropProps {
  clinicalYmd: string;
  level: number;
}

function layerStyle(def: AvatarJourneyBackgroundDef): CSSProperties {
  return {
    background: def.cssBackground,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    backgroundRepeat: 'no-repeat',
    mixBlendMode: def.imageSrc ? ('soft-light' as const) : undefined,
  };
}

function ScenicGradientLayer({
  def,
  className,
  style,
  onAnimationEnd,
}: {
  def: AvatarJourneyBackgroundDef;
  className?: string;
  style?: CSSProperties;
  onAnimationEnd?: (e: ReactAnimationEvent<HTMLDivElement>) => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(!def.imageSrc);

  useEffect(() => {
    setImgLoaded(!def.imageSrc);
  }, [def.imageSrc]);

  return (
    <div
      className={`absolute inset-0 h-full w-full ${className ?? ''}`}
      style={style}
      onAnimationEnd={onAnimationEnd}
    >
      {def.imageSrc ? (
        <img
          src={def.imageSrc}
          alt=""
          decoding="async"
          draggable={false}
          className="absolute inset-0 h-full w-full object-cover object-center"
          style={{ opacity: imgLoaded ? 1 : 0, transition: 'opacity 0.45s ease-out' }}
          onLoad={() => setImgLoaded(true)}
          onError={() => setImgLoaded(true)}
        />
      ) : null}
      <div className="absolute inset-0 h-full w-full" style={layerStyle(def)} />
    </div>
  );
}

/**
 * Level-aware scenic backdrop with daily rotation inside the current stage and cross-fades
 * when the clinical day or level/stage changes.
 */
export default function AvatarJourneyBackdrop({ clinicalYmd, level }: AvatarJourneyBackdropProps) {
  const target = useMemo(
    () => resolveAvatarScenicBackdrop(level, clinicalYmd),
    [level, clinicalYmd]
  );
  const targetRef = useRef(target);
  targetRef.current = target;

  const [displayed, setDisplayed] = useState<AvatarScenicBackdropSnapshot>(() =>
    resolveAvatarScenicBackdrop(level, clinicalYmd)
  );
  const [animatingTo, setAnimatingTo] = useState<{
    snapshot: AvatarScenicBackdropSnapshot;
    kind: 'day' | 'stage';
  } | null>(null);
  const [introDone, setIntroDone] = useState(false);

  useEffect(() => {
    if (animatingTo) setIntroDone(true);
  }, [animatingTo]);

  useEffect(() => {
    const id = window.setTimeout(() => setIntroDone(true), 720);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const matches =
      target.def.id === displayed.def.id && target.stage === displayed.stage;
    if (matches) return;

    if (animatingTo) {
      const sameIncoming =
        animatingTo.snapshot.def.id === target.def.id &&
        animatingTo.snapshot.stage === target.stage;
      if (!sameIncoming) {
        setAnimatingTo({
          snapshot: target,
          kind: displayed.stage !== target.stage ? 'stage' : 'day',
        });
      }
      return;
    }

    setAnimatingTo({
      snapshot: target,
      kind: displayed.stage !== target.stage ? 'stage' : 'day',
    });
  }, [target, displayed.def.id, displayed.stage, animatingTo]);

  const commitTransition = useCallback(() => {
    setDisplayed(targetRef.current);
    setAnimatingTo(null);
  }, []);

  const onIncomingAnimationEnd = useCallback(
    (e: ReactAnimationEvent<HTMLDivElement>) => {
      if (e.target !== e.currentTarget) return;
      commitTransition();
    },
    [commitTransition]
  );

  useEffect(() => {
    if (!animatingTo) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (!mq.matches) return;
    const id = window.setTimeout(() => commitTransition(), 80);
    return () => clearTimeout(id);
  }, [animatingTo, commitTransition]);

  const incomingKind = animatingTo?.kind;
  const baseFadeClass =
    animatingTo && incomingKind === 'stage'
      ? 'motion-safe:animate-avatar-backdrop-fade-out-stage'
      : animatingTo && incomingKind === 'day'
        ? 'motion-safe:animate-avatar-backdrop-fade-out-day'
        : '';

  const incomingClass =
    incomingKind === 'stage'
      ? 'motion-safe:animate-avatar-stage-cross-in'
      : incomingKind === 'day'
        ? 'motion-safe:animate-avatar-day-cross-in'
        : '';

  const baseIntroClass =
    !animatingTo && !introDone ? 'motion-safe:animate-avatar-journey-bg-in' : '';

  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden" aria-hidden>
      <ScenicGradientLayer
        def={displayed.def}
        className={`${baseFadeClass} ${baseIntroClass}`.trim()}
      />
      {animatingTo ? (
        <ScenicGradientLayer
          def={animatingTo.snapshot.def}
          className={incomingClass}
          onAnimationEnd={onIncomingAnimationEnd}
        />
      ) : null}
    </div>
  );
}
