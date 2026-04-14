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

export interface AvatarJourneyBackdropProps {
  clinicalYmd: string;
  level: number;
}

/** Levels 1–10: slow approach → base; 11–15: climb; 16+: summit */
type JourneyPhase = 'approach_to_base' | 'climb' | 'summit';

function phaseForLevel(level: number): JourneyPhase {
  if (level >= 16) return 'summit';
  if (level >= 11) return 'climb';
  return 'approach_to_base';
}

function segmentT(level: number, phase: JourneyPhase): number {
  switch (phase) {
    case 'approach_to_base':
      return Math.min(1, Math.max(0, (level - 1) / 9));
    case 'climb':
      return Math.min(1, Math.max(0, (level - 11) / 4));
    case 'summit':
      return 1;
    default:
      return 0;
  }
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
  mountain: CSSProperties;
  ground: CSSProperties;
  mist: CSSProperties & { background?: string };
  clouds: { opacity: number; driftX: number; driftY: number };
  mountainEdgeStrength: number;
}

function buildNarrativeLayers(
  level: number,
  phase: JourneyPhase,
  t: number,
  day: AvatarJourneyDayVariant
): NarrativeLayers {
  const p = Math.min(1, Math.max(0, t));
  const accent = skyDayAccents(day.skyPreset);
  const stripe = day.groundStripePeriod;

  let sky: CSSProperties;
  let distanceHaze: CSSProperties | null = null;
  let mountain: CSSProperties;
  let ground: CSSProperties;
  const mist: CSSProperties & { background?: string } = {
    opacity: 0,
    pointerEvents: 'none' as const,
  };
  let clouds = {
    opacity: 0.14,
    driftX: day.cloudDriftX,
    driftY: day.cloudDriftY,
  };

  switch (phase) {
    case 'approach_to_base': {
      const far = 1 - p;
      const scale = 0.19 + p * 1.24;
      const ty = 22 - p * 19;
      distanceHaze = {
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        bottom: '42%',
        background:
          'linear-gradient(180deg, rgba(226,232,240,0.38) 0%, rgba(191,219,254,0.12) 45%, transparent 100%)',
        opacity: far * 0.55,
        pointerEvents: 'none',
        zIndex: 0,
        transition: 'opacity 1.2s ease-out',
      };
      sky = {
        background: [
          'linear-gradient(180deg, #0ea5e9 0%, #38bdf8 16%, #7dd3fc 30%, #fef08a 46%, #fde047 56%, #bbf7d0 74%, #4ade80 100%)',
          `linear-gradient(180deg, rgba(15,23,42,${0.04 + p * 0.1}) 0%, transparent 44%)`,
          accent,
          'radial-gradient(ellipse 125% 50% at 50% 90%, rgba(74, 222, 128, 0.28) 0%, transparent 58%)',
        ].join(', '),
        transition: TRANSFORM_EASE,
      };
      mountain = {
        transform: `translate3d(0, ${ty}%, 0) scale(${scale})`,
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
        willChange: 'transform',
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
    case 'climb': {
      const scale = 1.36 + p * 0.14;
      const mty = -10 - p * 44;
      const gty = 24 + p * 62;
      const gsc = 1 - p * 0.24;
      sky = {
        background: [
          'linear-gradient(180deg, #010409 0%, #020617 18%, #0f172a 40%, #1e3a5f 62%, #334155 82%, #475569 100%)',
          `linear-gradient(180deg, rgba(2,6,23,${0.2 + p * 0.15}) 0%, transparent 48%)`,
          accent,
        ].join(', '),
        transition: TRANSFORM_EASE,
      };
      mountain = {
        transform: `translate3d(0, ${mty}%, 0) scale(${scale})`,
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
        willChange: 'transform',
      };
      ground = {
        background: [
          'linear-gradient(180deg, #57534e 0%, #44403c 26%, #292524 50%, #1c1917 100%)',
          `repeating-linear-gradient(82deg, transparent 0 3px, rgba(28, 25, 23, 0.4) 3px 4px, transparent 4px ${7 + (stripe % 5)}px)`,
          'linear-gradient(180deg, rgba(248, 250, 252, 0.12) 0%, transparent 18%, transparent 58%, rgba(226, 232, 240, 0.1) 100%)',
          'linear-gradient(180deg, transparent 0%, rgba(15, 23, 42, 0.5) 100%)',
        ].join(', '),
        transform: `translate3d(0, ${gty}%, 0) scale(${gsc})`,
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
        clipPath: 'polygon(0% 100%, 0% 58%, 100% 52%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 58%, 100% 52%, 100% 100%)',
      };
      mist.background =
        'linear-gradient(180deg, transparent 0%, transparent 35%, rgba(226, 232, 240, 0.08) 58%, rgba(241, 245, 249, 0.22) 100%)';
      mist.opacity = 0.12 + p * 0.18;
      clouds.opacity = 0.22 + p * 0.38;
      break;
    }
    case 'summit':
    default: {
      const past = Math.max(0, level - 16);
      const summitExtra = Math.min(0.24, past * 0.02);
      sky = {
        background: [
          'linear-gradient(180deg, #020617 0%, #1e1b4b 18%, #4338ca 32%, #7dd3fc 55%, #e0f2fe 78%, #f8fafc 100%)',
          'linear-gradient(180deg, rgba(251, 113, 133, 0.18) 30%, transparent 42%, rgba(251, 191, 36, 0.1) 52%, transparent 62%)',
          accent,
        ].join(', '),
        transition: TRANSFORM_EASE,
      };
      mountain = {
        transform: `translate3d(0, 0, 0) scale(${1 + summitExtra})`,
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
        willChange: 'transform',
      };
      ground = {
        background: [
          'linear-gradient(180deg, #ffffff 0%, #f8fafc 16%, #e2e8f0 40%, #cbd5e1 70%, #94a3b8 100%)',
          `repeating-linear-gradient(92deg, #f1f5f9 0 ${stripe}px, #e2e8f0 ${stripe}px ${stripe + 1}px)`,
          'linear-gradient(165deg, transparent 0%, rgba(59, 130, 246, 0.07) 38%, transparent 52%)',
          'repeating-linear-gradient(180deg, transparent 0 13px, rgba(148, 163, 184, 0.18) 13px 14px)',
          'linear-gradient(180deg, transparent 0%, rgba(71, 85, 105, 0.18) 100%)',
        ].join(', '),
        transform: `translate3d(0, 0, 0) scale(${1.04 + summitExtra * 0.32})`,
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
        clipPath: 'polygon(0% 100%, 0% 62%, 100% 60%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 62%, 100% 60%, 100% 100%)',
      };
      mist.background =
        'linear-gradient(180deg, transparent 0%, rgba(255, 255, 255, 0.06) 45%, rgba(226, 232, 240, 0.28) 100%)';
      mist.opacity = 0.32;
      clouds.opacity = 0.28 + (day.skyPreset % 2) * 0.06;
      break;
    }
  }

  const mountainEdgeStrength =
    phase === 'approach_to_base'
      ? Math.max(0.12, Math.min(1, 0.1 + p * 0.92))
      : 1;

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

function SummitDistantPeaksSvg({
  rockGradId,
  level,
}: {
  rockGradId: string;
  level: number;
}) {
  const past = Math.max(0, level - 16);
  const bump = Math.min(0.22, past * 0.018);
  const h = 28 + bump * 100;
  const w = 120 + bump * 55;
  return (
    <svg
      className="absolute bottom-[2%] left-1/2 -translate-x-1/2"
      style={{
        height: `${h}%`,
        width: `${w}%`,
        maxWidth: `${420 + past * 14}px`,
      }}
      viewBox="0 0 200 80"
      preserveAspectRatio="xMidYMax meet"
      shapeRendering="geometricPrecision"
      aria-hidden
    >
      <defs>
        <linearGradient id={rockGradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#cbd5e1" />
          <stop offset="40%" stopColor="#64748b" />
          <stop offset="100%" stopColor="#334155" />
        </linearGradient>
      </defs>
      <polygon
        fill={`url(#${rockGradId})`}
        stroke="rgba(15,23,42,0.22)"
        strokeWidth={0.9}
        strokeLinejoin="miter"
        vectorEffect="nonScalingStroke"
        paintOrder="stroke fill"
        points="0,80 0,52 18,38 32,48 48,28 64,42 82,22 100,40 118,24 136,44 154,30 172,46 188,36 200,48 200,80"
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

function NarrativeMountScene({
  level,
  phase,
  t,
  clinicalYmd,
}: {
  level: number;
  phase: JourneyPhase;
  t: number;
  clinicalYmd: string;
}) {
  const uid = useId().replace(/:/g, '');
  const rockGradId = `aj-rock-${uid}`;
  const distantGradId = `aj-dist-${uid}`;

  const dayVariant = useMemo(
    () => getAvatarJourneyDayVariant(clinicalYmd),
    [clinicalYmd]
  );

  const layers = useMemo(
    () => buildNarrativeLayers(level, phase, t, dayVariant),
    [level, phase, t, dayVariant]
  );

  const snowCap = level >= 11;
  const showPrimaryMountain = phase !== 'summit';

  return (
    <div className="absolute inset-0 overflow-hidden motion-safe:animate-avatar-stage-cross-in">
      <div className="absolute inset-0 z-0" style={layers.sky} />

      {layers.distanceHaze ? (
        <div aria-hidden className="motion-safe:transition-opacity" style={layers.distanceHaze} />
      ) : null}

      <div
        className="absolute inset-x-0 bottom-0 top-[4%] z-[1]"
        style={layers.mountain}
      >
        {showPrimaryMountain ? (
          <PrimaryMountainSvg
            rockGradId={rockGradId}
            snowCap={snowCap}
            edgeStrength={layers.mountainEdgeStrength}
          />
        ) : (
          <SummitDistantPeaksSvg rockGradId={distantGradId} level={level} />
        )}
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
    </div>
  );
}

/**
 * Mountain mass scales with level only (slow linear 1–10, dominant at 10).
 * Sky, clouds, and ground texture shift daily from `clinicalYmd`.
 */
export default function AvatarJourneyBackdrop({
  clinicalYmd,
  level,
}: AvatarJourneyBackdropProps) {
  const lv = normalizePatientLevelForBackdrop(level);
  const phase = phaseForLevel(lv);
  const t = segmentT(lv, phase);

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
        key={phase}
        level={lv}
        phase={phase}
        t={t}
        clinicalYmd={clinicalYmd}
      />
    </div>
  );
}
