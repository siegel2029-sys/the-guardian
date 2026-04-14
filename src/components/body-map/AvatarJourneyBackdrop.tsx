import {
  useMemo,
  useState,
  useEffect,
  useLayoutEffect,
  useRef,
  useCallback,
  type CSSProperties,
  type AnimationEvent as ReactAnimationEvent,
} from 'react';
import {
  resolveAvatarScenicBackdrop,
  normalizePatientLevelForBackdrop,
  getAvatarStageAtmosphereStyle,
  AVATAR_SCENIC_MID_CLIP,
  type AvatarJourneyBackgroundDef,
  type AvatarJourneyStageId,
  type AvatarScenicBackdropSnapshot,
} from '../../utils/avatarDailyBackground';

export interface AvatarJourneyBackdropProps {
  clinicalYmd: string;
  level: number;
}

function backPlaneStyle(def: AvatarJourneyBackgroundDef): CSSProperties {
  return {
    background: def.cssBack,
    backgroundSize: 'cover',
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat',
  };
}

function midPlaneStyle(def: AvatarJourneyBackgroundDef): CSSProperties {
  return {
    background: def.cssMid,
    backgroundSize: 'cover',
    backgroundPosition: 'center bottom',
    backgroundRepeat: 'no-repeat',
  };
}

function ScenicSceneStack({
  def,
  stage,
  className,
  style,
  onAnimationEnd,
}: {
  def: AvatarJourneyBackgroundDef;
  stage: AvatarJourneyStageId;
  className?: string;
  style?: CSSProperties;
  onAnimationEnd?: (e: ReactAnimationEvent<HTMLDivElement>) => void;
}) {
  const [backImgLoaded, setBackImgLoaded] = useState(!def.imageSrc);
  const [midImgLoaded, setMidImgLoaded] = useState(!def.midImageSrc);

  useEffect(() => {
    setBackImgLoaded(!def.imageSrc);
  }, [def.id, def.imageSrc]);

  useEffect(() => {
    setMidImgLoaded(!def.midImageSrc);
  }, [def.id, def.midImageSrc]);

  const midClip = AVATAR_SCENIC_MID_CLIP[def.id];
  const midWrapperStyle: CSSProperties | undefined = midClip
    ? { clipPath: midClip, WebkitClipPath: midClip }
    : undefined;

  return (
    <div
      className={`absolute inset-0 h-full w-full overflow-hidden ${className ?? ''}`}
      style={style}
      onAnimationEnd={onAnimationEnd}
    >
      <div className="absolute inset-0">
        {/* Back plane — sky / distance */}
        <div
          className="absolute inset-0 animate-avatar-scenic-parallax-back"
          style={backPlaneStyle(def)}
        >
          {def.imageSrc ? (
            <img
              src={def.imageSrc}
              alt=""
              decoding="async"
              draggable={false}
              className="absolute inset-0 h-full w-full object-cover object-center"
              style={{
                opacity: backImgLoaded ? 1 : 0,
                transition: 'opacity 0.45s ease-out',
                mixBlendMode: 'soft-light',
              }}
              onLoad={() => setBackImgLoaded(true)}
              onError={() => setBackImgLoaded(true)}
            />
          ) : null}
        </div>

        {/* Mid plane — terrain / water / silhouettes */}
        {def.cssMid ? (
          <div
            className={`absolute inset-x-0 bottom-0 top-[22%] animate-avatar-scenic-parallax-mid ${def.midClassName ?? ''}`}
            style={midWrapperStyle}
          >
            <div className="absolute inset-0" style={midPlaneStyle(def)}>
              {def.midImageSrc ? (
                <img
                  src={def.midImageSrc}
                  alt=""
                  decoding="async"
                  draggable={false}
                  className="absolute inset-0 h-full w-full object-cover object-bottom"
                  style={{
                    opacity: midImgLoaded ? 1 : 0,
                    transition: 'opacity 0.45s ease-out',
                    mixBlendMode: 'soft-light',
                  }}
                  onLoad={() => setMidImgLoaded(true)}
                  onError={() => setMidImgLoaded(true)}
                />
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Stage atmosphere (warm / coastal / mist) */}
        <div
          className="pointer-events-none absolute inset-0 z-[1]"
          style={getAvatarStageAtmosphereStyle(stage)}
        />
      </div>
    </div>
  );
}

/**
 * Level-aware scenic backdrop with daily rotation inside the current stage and cross-fades
 * when the clinical day or level/stage changes.
 */
export default function AvatarJourneyBackdrop({ clinicalYmd, level }: AvatarJourneyBackdropProps) {
  const backdropLevel = normalizePatientLevelForBackdrop(level);
  const target = useMemo(
    () => resolveAvatarScenicBackdrop(backdropLevel, clinicalYmd),
    [backdropLevel, clinicalYmd]
  );
  const targetRef = useRef(target);
  targetRef.current = target;

  const [displayed, setDisplayed] = useState<AvatarScenicBackdropSnapshot>(() =>
    resolveAvatarScenicBackdrop(normalizePatientLevelForBackdrop(level), clinicalYmd)
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
    return () => window.clearTimeout(id);
  }, []);

  /** Lowlands ↔ Ascending ↔ Highlands: apply the new pool immediately (debug level-up, real progression). */
  useLayoutEffect(() => {
    if (displayed.stage === target.stage) return;
    setDisplayed(target);
    setAnimatingTo(null);
  }, [target, displayed.stage]);

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
    return () => window.clearTimeout(id);
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
      <ScenicSceneStack
        key={`bg-${displayed.level}-${displayed.stage}-${displayed.def.id}-${displayed.dayOfYear}`}
        def={displayed.def}
        stage={displayed.stage}
        className={`${baseFadeClass} ${baseIntroClass}`.trim()}
      />
      {animatingTo ? (
        <ScenicSceneStack
          key={`bg-in-${animatingTo.snapshot.level}-${animatingTo.snapshot.stage}-${animatingTo.snapshot.def.id}-${animatingTo.snapshot.dayOfYear}`}
          def={animatingTo.snapshot.def}
          stage={animatingTo.snapshot.stage}
          className={incomingClass}
          onAnimationEnd={onIncomingAnimationEnd}
        />
      ) : null}
    </div>
  );
}
