import {
  useMemo,
  useState,
  useEffect,
  useId,
  type CSSProperties,
} from 'react';
import {
  normalizePatientLevelForBackdrop,
  getAvatarJourneyDayVariant,
  type AvatarJourneyDayVariant,
} from '../../utils/avatarDailyBackground';
import {
  getMountainBackdropContext,
  type MountainClimbEnvironmentState,
  type MountainDailyEnvironmentState,
} from '../../hooks/useGamification';

export interface AvatarJourneyBackdropProps {
  clinicalYmd: string;
  level: number;
}

const TRANSFORM_EASE =
  'transform 1.35s cubic-bezier(0.22, 0.82, 0.32, 1), opacity 1s ease-out';

/** Extra sky layers from the calendar day (hue / mood only — mountain stays level-driven). */
function skyDayAccents(preset: AvatarJourneyDayVariant['skyPreset']): string {
  switch (preset) {
    case 0:
      return [
        'linear-gradient(180deg, rgba(251,191,36,0.14) 0%, transparent 32%)',
        'linear-gradient(180deg, transparent 38%, rgba(251,113,133,0.2) 68%, rgba(249,115,22,0.1) 100%)',
      ].join(', ');
    case 1:
      return 'linear-gradient(180deg, rgba(56,189,248,0.14) 0%, transparent 48%)';
    case 2:
      return [
        'linear-gradient(180deg, rgba(76,29,149,0.18) 0%, transparent 28%)',
        'linear-gradient(180deg, transparent 32%, rgba(249,115,22,0.22) 70%, rgba(190,24,93,0.12) 100%)',
      ].join(', ');
    default:
      return 'linear-gradient(180deg, rgba(71,85,105,0.42) 0%, rgba(148,163,184,0.22) 52%, transparent 100%)';
  }
}

interface NarrativeLayers {
  sky: CSSProperties;
  /** Thin haze in upper sky only — suggests distance without blurring the SVG mountain. */
  distanceHaze: CSSProperties | null;
  /** אותה פסגה מושלגת — scale + translate מ־snowyPeakJourneyT בלבד */
  mountain: CSSProperties;
  ground: CSSProperties;
  mist: CSSProperties & { background?: string };
  clouds: { opacity: number; driftX: number; driftY: number };
  mountainEdgeStrength: number;
}

/** רמות 2→30: פסגה אחת מתקרבת (אותו נכס; ללא קפיצות בין מקטעים). */
function snowyPeakLayerStyle(state: MountainClimbEnvironmentState): CSSProperties {
  const pt = state.snowyPeakJourneyT;
  if (!state.mountainSvgVisible) {
    return { opacity: 0, pointerEvents: 'none' };
  }
  const scale = 0.15 + pt * 1.52;
  const ty = 22 - pt * 30;
  const blurPx = pt < 0.5 ? (1 - pt / 0.5) * 1.35 : 0;
  return {
    transform: `translate3d(0, ${ty}%, 0) scale(${scale})`,
    transformOrigin: '50% 100%',
    filter: blurPx > 0.04 ? `blur(${blurPx.toFixed(2)}px)` : undefined,
    transition: `${TRANSFORM_EASE}, filter 1.35s ease-out`,
    willChange: 'transform',
  };
}

function buildNarrativeLayers(
  state: MountainClimbEnvironmentState,
  day: AvatarJourneyDayVariant,
  daily: MountainDailyEnvironmentState
): NarrativeLayers {
  const { phase, segmentT: t, rockFaceDominant, thinAir, showVegetation } = state;
  const p = Math.min(1, Math.max(0, t));
  const pt = state.snowyPeakJourneyT;
  const accent = skyDayAccents(day.skyPreset);
  const stripe = day.groundStripePeriod;

  let sky: CSSProperties;
  let distanceHaze: CSSProperties | null = null;
  let ground: CSSProperties;
  const mist: CSSProperties & { background?: string } = {
    opacity: 0,
    pointerEvents: 'none' as const,
  };
  const clouds = {
    opacity: 0.14,
    driftX: day.cloudDriftX,
    driftY: day.cloudDriftY,
  };

  switch (phase) {
    case 'approach': {
      const far = 1 - p;
      distanceHaze = {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: '42%',
        background:
          'linear-gradient(180deg, rgba(226,232,240,0.38) 0%, rgba(191,219,254,0.12) 45%, transparent 100%)',
        opacity: far * 0.55 * (1 - pt * 0.35),
        pointerEvents: 'none',
        zIndex: 0,
        transition: 'opacity 1.2s ease-out',
      };
      sky = {
        background: [
          daily.skyGradientCss,
          `linear-gradient(180deg, rgba(15,23,42,${0.04 + p * 0.1}) 0%, transparent 44%)`,
          accent,
          'radial-gradient(ellipse 125% 50% at 50% 90%, rgba(74, 222, 128, 0.28) 0%, transparent 58%)',
        ].join(', '),
        transition: TRANSFORM_EASE,
      };
      ground = {
        background: [
          'linear-gradient(180deg, transparent 0%, rgba(254, 249, 195, 0.5) 26%, #d9f99d 34%, #bbf7d0 42%, #4ade80 60%, #16a34a 80%, #14532d 100%)',
          `repeating-linear-gradient(90deg, transparent 0 ${stripe}px, rgba(21, 128, 61, 0.12) ${stripe}px ${stripe + 1}px)`,
          `repeating-linear-gradient(95deg, rgba(253, 224, 71, 0.1) 0 ${stripe * 3}px, transparent ${stripe * 3}px ${stripe * 6}px)`,
          'linear-gradient(180deg, transparent 0%, rgba(34, 197, 94, 0.16) 100%)',
        ].join(', '),
        transform: 'translate3d(0, 0, 0) scale(1)',
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
        clipPath: 'polygon(0% 100%, 0% 52%, 100% 50%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 52%, 100% 50%, 100% 100%)',
      };
      clouds.opacity = 0.1 + p * 0.08 + (day.skyPreset % 2) * 0.04;
      break;
    }
    case 'path': {
      const grassFade = 1 - p;
      distanceHaze = {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: '38%',
        background:
          'linear-gradient(180deg, rgba(203,213,225,0.35) 0%, rgba(148,163,184,0.1) 50%, transparent 100%)',
        opacity: (0.28 + p * 0.2) * (1 - pt * 0.25),
        pointerEvents: 'none',
        zIndex: 0,
        transition: 'opacity 1.2s ease-out',
      };
      sky = {
        background: [
          daily.skyGradientCss,
          `linear-gradient(180deg, transparent 0%, ${grassFade > 0.35 ? 'rgba(187,247,208,0.35)' : 'rgba(100,116,139,0.45)'} 36%, rgba(51,65,85,0.55) 58%, rgba(15,23,42,0.35) 100%)`,
          `linear-gradient(180deg, rgba(15,23,42,${0.08 + p * 0.12}) 0%, transparent 50%)`,
          accent,
          'radial-gradient(ellipse 110% 45% at 50% 88%, rgba(74, 222, 128, 0.12) 0%, transparent 55%)',
        ].join(', '),
        transition: TRANSFORM_EASE,
      };
      ground = {
        background: [
          'linear-gradient(180deg, transparent 0%, rgba(217, 249, 157, 0.35) 22%, #86efac 32%, #4ade80 48%, #15803d 72%, #14532d 100%)',
          'linear-gradient(90deg, transparent 0%, transparent 32%, rgba(87, 83, 78, 0.45) 40%, rgba(120, 53, 15, 0.55) 50%, rgba(87, 83, 78, 0.45) 60%, transparent 68%, transparent 100%)',
          `repeating-linear-gradient(88deg, rgba(63, 63, 70, 0.2) 0 ${stripe + 2}px, transparent ${stripe + 2}px ${stripe * 4}px)`,
          'linear-gradient(180deg, transparent 0%, rgba(21, 128, 61, 0.12) 100%)',
        ].join(', '),
        transform: 'translate3d(0, 0, 0) scale(1)',
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
        clipPath: 'polygon(0% 100%, 0% 54%, 100% 51%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 54%, 100% 51%, 100% 100%)',
      };
      clouds.opacity = 0.12 + p * 0.1;
      break;
    }
    case 'mountain_base': {
      const baseRock = rockFaceDominant ? 1 : p;
      sky = {
        background: [
          daily.skyGradientCss,
          'linear-gradient(180deg, rgba(15,23,42,0.45) 0%, rgba(30,41,59,0.35) 42%, transparent 62%)',
          `linear-gradient(180deg, rgba(15,23,42,${0.22 + baseRock * 0.18}) 0%, transparent 42%)`,
          accent,
          'linear-gradient(180deg, transparent 55%, rgba(30, 41, 59, 0.45) 100%)',
        ].join(', '),
        transition: TRANSFORM_EASE,
      };
      ground = {
        background: [
          'linear-gradient(180deg, #a8a29e 0%, #78716c 18%, #57534e 40%, #44403c 62%, #292524 100%)',
          `repeating-linear-gradient(85deg, transparent 0 4px, rgba(41, 37, 36, 0.45) 4px 5px, transparent 5px ${9 + (stripe % 4)}px)`,
          'linear-gradient(180deg, rgba(254, 243, 199, 0.08) 0%, transparent 35%, rgba(28, 25, 23, 0.35) 100%)',
        ].join(', '),
        transform: `translate3d(0, ${6 + p * 8}%, 0) scale(${1 - p * 0.08})`,
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
        clipPath: 'polygon(0% 100%, 0% 56%, 100% 53%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 56%, 100% 53%, 100% 100%)',
      };
      mist.background =
        'linear-gradient(180deg, transparent 0%, transparent 38%, rgba(226, 232, 240, 0.06) 62%, rgba(241, 245, 249, 0.14) 100%)';
      mist.opacity = 0.08 + p * 0.14;
      clouds.opacity = 0.2 + p * 0.22;
      break;
    }
    case 'ascent': {
      const ap = state.summitApproachProgress;
      const gty = 20 + ap * 52 + p * 8;
      const gsc = 1 - ap * 0.26 - p * 0.06;
      sky = {
        background: [
          daily.skyGradientCss,
          'linear-gradient(180deg, rgba(15,23,42,0.5) 0%, rgba(30,41,59,0.4) 48%, transparent 72%)',
          `linear-gradient(180deg, rgba(2,6,23,${0.24 + (thinAir ? 0.12 : 0)}) 0%, transparent 46%)`,
          accent,
          showVegetation ? '' : 'linear-gradient(180deg, transparent 0%, rgba(15,23,42,0.25) 100%)',
        ]
          .filter(Boolean)
          .join(', '),
        transition: TRANSFORM_EASE,
      };
      ground = {
        background: [
          'linear-gradient(180deg, #57534e 0%, #44403c 24%, #292524 48%, #1c1917 100%)',
          `repeating-linear-gradient(82deg, transparent 0 2px, rgba(28, 25, 23, 0.55) 2px 3px, transparent 3px ${6 + (stripe % 4)}px)`,
          'linear-gradient(180deg, rgba(248, 250, 252, 0.08) 0%, transparent 22%, transparent 62%, rgba(226, 232, 240, 0.08) 100%)',
          'linear-gradient(180deg, transparent 0%, rgba(15, 23, 42, 0.55) 100%)',
        ].join(', '),
        transform: `translate3d(0, ${gty}%, 0) scale(${gsc})`,
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
        clipPath: 'polygon(0% 100%, 0% 58%, 100% 52%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 58%, 100% 52%, 100% 100%)',
      };
      mist.background =
        'linear-gradient(180deg, rgba(224, 242, 254, 0.06) 0%, transparent 28%, rgba(226, 232, 240, 0.1) 58%, rgba(241, 245, 249, 0.2) 100%)';
      mist.opacity = 0.14 + p * 0.22 + (thinAir ? 0.12 : 0);
      clouds.opacity = 0.18 + ap * 0.28 + p * 0.12;
      break;
    }
    case 'summit': {
      sky = {
        background: [
          daily.skyGradientCss,
          'radial-gradient(ellipse 90% 55% at 50% 28%, rgba(253, 224, 71, 0.22) 0%, transparent 55%)',
          'linear-gradient(180deg, rgba(15,23,42,0.35) 0%, rgba(30,27,75,0.25) 35%, transparent 58%)',
          'linear-gradient(180deg, rgba(251, 113, 133, 0.14) 28%, transparent 40%, rgba(251, 191, 36, 0.1) 50%, transparent 60%)',
          accent,
        ].join(', '),
        transition: TRANSFORM_EASE,
      };
      ground = {
        background: [
          'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 28%, #cbd5e1 55%, #94a3b8 85%, #64748b 100%)',
          `repeating-linear-gradient(92deg, #f1f5f9 0 ${stripe}px, #e2e8f0 ${stripe}px ${stripe + 1}px)`,
          'linear-gradient(165deg, transparent 0%, rgba(59, 130, 246, 0.06) 38%, transparent 52%)',
          'linear-gradient(180deg, transparent 0%, rgba(71, 85, 105, 0.2) 100%)',
        ].join(', '),
        transform: `translate3d(0, 0, 0) scale(${1.06})`,
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
        clipPath: 'polygon(0% 100%, 0% 62%, 100% 60%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 62%, 100% 60%, 100% 100%)',
      };
      mist.background =
        'linear-gradient(180deg, transparent 0%, rgba(255, 255, 255, 0.05) 42%, rgba(226, 232, 240, 0.26) 100%)';
      mist.opacity = 0.34;
      clouds.opacity = 0.34 + (day.skyPreset % 2) * 0.08;
      break;
    }
  }

  const mountain = snowyPeakLayerStyle(state);

  const cw = daily.weather === 'גשום' ? 1.55 : daily.weather === 'מעונן' ? 1.28 : 1;
  clouds.opacity = Math.min(0.95, clouds.opacity * cw);

  const mountainEdgeStrength = state.mountainSvgVisible
    ? Math.max(0.1, Math.min(1, 0.1 + pt * 0.9))
    : 0.08;

  return {
    sky,
    distanceHaze,
    mountain,
    ground,
    mist,
    clouds,
    mountainEdgeStrength,
  };
}

function PrimaryMountainSvg({
  rockGradId,
  snowCap,
  edgeStrength,
}: {
  rockGradId: string;
  snowCap: boolean;
  edgeStrength: number;
}) {
  const d =
    'M 100 8 L 124 52 L 148 38 L 168 58 L 182 48 L 196 78 L 200 210 L 0 210 L 0 88 L 24 58 L 48 72 L 76 42 L 100 8 Z';
  const strokeW = 0.45 + edgeStrength * 2;
  const strokeOp = 0.14 + edgeStrength * 0.48;
  const ridgeOp = 0.08 + edgeStrength * 0.32;
  return (
    <svg
      className="absolute bottom-0 left-1/2 h-[92%] w-[135%] max-w-[min(520px,104vw)] -translate-x-1/2"
      viewBox="0 0 200 210"
      preserveAspectRatio="xMidYMax meet"
      shapeRendering="geometricPrecision"
      aria-hidden
    >
      <defs>
        <linearGradient id={rockGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#94a3b8" />
          <stop offset="28%" stopColor="#64748b" />
          <stop offset="62%" stopColor="#475569" />
          <stop offset="100%" stopColor="#1e293b" />
        </linearGradient>
      </defs>
      <path fill={`url(#${rockGradId})`} d={d} />
      {edgeStrength > 0.12 ? (
        <path
          fill="none"
          d="M 76 42 L 100 8 L 124 52 M 48 72 L 24 58 M 168 58 L 182 48 L 196 78"
          stroke={`rgba(15,23,42,${ridgeOp})`}
          strokeWidth={0.55 + edgeStrength * 1.05}
          strokeLinecap="round"
          strokeLinejoin="miter"
          vectorEffect="nonScalingStroke"
        />
      ) : null}
      {snowCap ? (
        <>
          <path fill="#f8fafc" d="M 100 8 L 124 48 L 100 32 L 76 48 Z" opacity={0.98} />
          {edgeStrength > 0.45 ? (
            <path
              fill="none"
              d="M 100 8 L 124 48 M 100 8 L 76 48"
              stroke="rgba(148,163,184,0.55)"
              strokeWidth={0.45 + edgeStrength * 0.45}
              vectorEffect="nonScalingStroke"
            />
          ) : null}
        </>
      ) : null}
      <path
        fill="none"
        stroke={`rgba(15,23,42,${strokeOp})`}
        strokeWidth={strokeW}
        strokeLinejoin="miter"
        vectorEffect="nonScalingStroke"
        d={d}
      />
    </svg>
  );
}

function CloudLayer({
  opacity,
  driftX,
  driftY,
}: {
  opacity: number;
  driftX: number;
  driftY: number;
}) {
  if (opacity < 0.04) return null;
  const blob =
    'rounded-full bg-white/88 shadow-[inset_-3px_-3px_0_rgba(148,163,184,0.22)]';
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2]"
      style={{
        opacity,
        mixBlendMode: 'screen',
        transform: `translate3d(${driftX}%, ${driftY}%, 0)`,
        transition: 'transform 0.6s ease-out, opacity 0.8s ease-out',
      }}
    >
      <div
        className={`avatar-journey-cloud absolute -left-[8%] top-[12%] h-[14%] w-[42%] ${blob}`}
      />
      <div
        className={`avatar-journey-cloud-delayed absolute left-[38%] top-[22%] h-[11%] w-[36%] ${blob}`}
      />
      <div
        className={`avatar-journey-cloud absolute right-[-6%] top-[18%] h-[12%] w-[38%] ${blob}`}
      />
    </div>
  );
}

function SummitBirdsLayer() {
  return (
    <div
      className="avatar-journey-birds pointer-events-none absolute left-[8%] top-[10%] z-[4] opacity-90"
      aria-hidden
    >
      <svg width="120" height="48" viewBox="0 0 120 48" className="text-slate-800/85">
        <title>ציפורים</title>
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          d="M8 28 Q 16 22 24 28 M 20 24 Q 28 18 36 24"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          d="M52 18 Q 60 12 68 18 M 64 14 Q 72 8 80 14"
        />
        <path
          fill="none"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinecap="round"
          d="M88 32 Q 94 27 100 32 M 96 29 Q 102 24 108 29"
        />
      </svg>
    </div>
  );
}

function SummitRainLayer() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[4] overflow-hidden opacity-[0.42] mix-blend-overlay"
      aria-hidden
    >
      <div
        className="avatar-journey-rain absolute -inset-[40%] h-[180%] w-full"
        style={{
          backgroundImage: [
            'repeating-linear-gradient(100deg, transparent 0 5px, rgba(255,255,255,0.35) 5px 6px, transparent 6px 14px)',
            'repeating-linear-gradient(104deg, transparent 0 8px, rgba(147,197,253,0.25) 8px 9px, transparent 9px 20px)',
          ].join(', '),
        }}
      />
    </div>
  );
}

function DailyWildlifeLayer() {
  return (
    <div
      className="pointer-events-none absolute bottom-[14%] left-[6%] z-[4] opacity-[0.55]"
      aria-hidden
    >
      <svg width="100" height="44" viewBox="0 0 100 44" className="text-slate-900/70">
        <title>חיות</title>
        <ellipse cx="22" cy="34" rx="14" ry="6" fill="currentColor" />
        <ellipse cx="22" cy="22" rx="10" ry="12" fill="currentColor" />
        <circle cx="30" cy="16" r="5" fill="currentColor" />
        <ellipse cx="70" cy="32" rx="12" ry="5" fill="currentColor" />
        <ellipse cx="72" cy="22" rx="8" ry="10" fill="currentColor" />
        <circle cx="78" cy="15" r="4" fill="currentColor" />
      </svg>
    </div>
  );
}

function NarrativeMountScene({
  env,
  daily,
  clinicalYmd,
}: {
  env: MountainClimbEnvironmentState;
  daily: MountainDailyEnvironmentState;
  clinicalYmd: string;
}) {
  const uid = useId().replace(/:/g, '');
  const rockGradId = `aj-rock-${uid}`;

  const dayVariant = useMemo(
    () => getAvatarJourneyDayVariant(clinicalYmd),
    [clinicalYmd]
  );

  const layers = useMemo(
    () => buildNarrativeLayers(env, dayVariant, daily),
    [env, dayVariant, daily]
  );

  const snowCap = env.normalizedLevel >= 2;
  const phase = env.phase;
  const isSummitCelebration = phase === 'summit';
  const showRain = daily.weather === 'גשום';
  const showBirds = daily.visitors === 'ציפורים' && daily.weather !== 'גשום';
  const showWildlife = daily.visitors === 'חיות';

  return (
    <div
      className={`absolute inset-0 overflow-hidden motion-safe:animate-avatar-stage-cross-in ${
        isSummitCelebration ? 'avatar-journey-summit-celebration' : ''
      }`}
    >
      <div className="absolute inset-0 z-0" style={layers.sky} />

      {layers.distanceHaze ? (
        <div aria-hidden className="motion-safe:transition-opacity" style={layers.distanceHaze} />
      ) : null}

      <div
        className="absolute inset-x-0 bottom-0 top-[4%] z-[1]"
        style={layers.mountain}
      >
        {env.mountainSvgVisible ? (
          <PrimaryMountainSvg
            rockGradId={rockGradId}
            snowCap={snowCap}
            edgeStrength={layers.mountainEdgeStrength}
          />
        ) : null}
      </div>

      <div
        className="absolute inset-x-0 bottom-0 top-[38%] z-[2]"
        style={layers.ground}
      />

      {typeof layers.mist.opacity === 'number' && layers.mist.opacity > 0.02 && layers.mist.background ? (
        <div
          className="pointer-events-none absolute inset-0 z-[3]"
          style={layers.mist}
        />
      ) : null}

      <CloudLayer
        opacity={layers.clouds.opacity}
        driftX={layers.clouds.driftX}
        driftY={layers.clouds.driftY}
      />

      {showBirds ? <SummitBirdsLayer /> : null}
      {showRain ? <SummitRainLayer /> : null}
      {showWildlife ? <DailyWildlifeLayer /> : null}
    </div>
  );
}

/**
 * Mountain Climb backdrop: רמה (1–30) + שמיים/מזג/מבקרים יומיים דרך getMountainBackdropContext ב-useGamification.
 */
export default function AvatarJourneyBackdrop({
  clinicalYmd,
  level,
}: AvatarJourneyBackdropProps) {
  const lv = normalizePatientLevelForBackdrop(level);
  const backdrop = useMemo(
    () => getMountainBackdropContext(lv, clinicalYmd),
    [lv, clinicalYmd]
  );

  const [introDone, setIntroDone] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setIntroDone(true), 720);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-0 overflow-hidden ${!introDone ? 'motion-safe:animate-avatar-journey-bg-in' : ''}`}
      aria-hidden
    >
      <NarrativeMountScene
        key={backdrop.daily.dayKeyLocal}
        env={backdrop.climb}
        daily={backdrop.daily}
        clinicalYmd={clinicalYmd}
      />
    </div>
  );
}
