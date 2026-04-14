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
  getMountainDailySkyBackgroundColor,
  getMountainPeakTransformScale,
  getMountainEnvironmentAssets,
  PATIENT_PORTAL_VISUAL_TRANSITION,
  type MountainClimbEnvironmentState,
  type MountainDailyEnvironmentState,
  type MountainEnvironmentAssets,
} from '../../hooks/useGamification';
import './AvatarJourneyBackdrop.css';

export interface AvatarJourneyBackdropProps {
  clinicalYmd: string;
  level: number;
  /** ימי פעילות מצטברים — נוף «Daily Bloom» (פרחים/יער/חיות), בלתי תלוי ברמה */
  totalActiveDays?: number;
}

/** Layer 2 — Grass → Path → Earth → Rock by journey phase (level-driven via `getMountainClimbEnvironmentState`). */
function terrainLayerStyleForPhase(
  state: MountainClimbEnvironmentState,
  dayStripe: number
): CSSProperties {
  const { phase, segmentT: t } = state;
  const p = Math.min(1, Math.max(0, t));
  const stripe = dayStripe;

  switch (phase) {
    case 'approach':
      return {
        background: [
          'linear-gradient(180deg, transparent 0%, rgba(254, 249, 195, 0.5) 26%, #d9f99d 34%, #bbf7d0 42%, #4ade80 60%, #16a34a 80%, #14532d 100%)',
          `repeating-linear-gradient(90deg, transparent 0 ${stripe}px, rgba(21, 128, 61, 0.12) ${stripe}px ${stripe + 1}px)`,
          `repeating-linear-gradient(95deg, rgba(253, 224, 71, 0.1) 0 ${stripe * 3}px, transparent ${stripe * 3}px ${stripe * 6}px)`,
          'linear-gradient(180deg, transparent 0%, rgba(34, 197, 94, 0.16) 100%)',
        ].join(', '),
        transform: 'translate3d(0, 0, 0) scale(1)',
        transformOrigin: '50% 100%',
        transition: PATIENT_PORTAL_VISUAL_TRANSITION,
        clipPath: 'polygon(0% 100%, 0% 52%, 100% 50%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 52%, 100% 50%, 100% 100%)',
      };
    case 'path': {
      return {
        background: [
          'linear-gradient(180deg, transparent 0%, rgba(217, 249, 157, 0.35) 22%, #86efac 32%, #4ade80 48%, #15803d 72%, #14532d 100%)',
          'linear-gradient(90deg, transparent 0%, transparent 32%, rgba(87, 83, 78, 0.45) 40%, rgba(120, 53, 15, 0.55) 50%, rgba(87, 83, 78, 0.45) 60%, transparent 68%, transparent 100%)',
          `repeating-linear-gradient(88deg, rgba(63, 63, 70, 0.2) 0 ${stripe + 2}px, transparent ${stripe + 2}px ${stripe * 4}px)`,
          'linear-gradient(180deg, transparent 0%, rgba(21, 128, 61, 0.12) 100%)',
        ].join(', '),
        transform: 'translate3d(0, 0, 0) scale(1)',
        transformOrigin: '50% 100%',
        transition: PATIENT_PORTAL_VISUAL_TRANSITION,
        clipPath: 'polygon(0% 100%, 0% 54%, 100% 51%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 54%, 100% 51%, 100% 100%)',
      };
    }
    case 'mountain_base': {
      return {
        background: [
          'linear-gradient(180deg, #a8a29e 0%, #78716c 18%, #57534e 40%, #44403c 62%, #292524 100%)',
          `repeating-linear-gradient(85deg, transparent 0 4px, rgba(41, 37, 36, 0.45) 4px 5px, transparent 5px ${9 + (stripe % 4)}px)`,
          'linear-gradient(180deg, rgba(254, 243, 199, 0.08) 0%, transparent 35%, rgba(28, 25, 23, 0.35) 100%)',
        ].join(', '),
        transform: `translate3d(0, ${6 + p * 8}%, 0) scale(${1 - p * 0.08})`,
        transformOrigin: '50% 100%',
        transition: PATIENT_PORTAL_VISUAL_TRANSITION,
        clipPath: 'polygon(0% 100%, 0% 56%, 100% 53%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 56%, 100% 53%, 100% 100%)',
      };
    }
    case 'ascent': {
      const ap = state.summitApproachProgress;
      const gty = 20 + ap * 52 + p * 8;
      const gsc = 1 - ap * 0.26 - p * 0.06;
      return {
        background: [
          'linear-gradient(180deg, #57534e 0%, #44403c 24%, #292524 48%, #1c1917 100%)',
          `repeating-linear-gradient(82deg, transparent 0 2px, rgba(28, 25, 23, 0.55) 2px 3px, transparent 3px ${6 + (stripe % 4)}px)`,
          'linear-gradient(180deg, rgba(248, 250, 252, 0.08) 0%, transparent 22%, transparent 62%, rgba(226, 232, 240, 0.08) 100%)',
          'linear-gradient(180deg, transparent 0%, rgba(15, 23, 42, 0.55) 100%)',
        ].join(', '),
        transform: `translate3d(0, ${gty}%, 0) scale(${gsc})`,
        transformOrigin: '50% 100%',
        transition: PATIENT_PORTAL_VISUAL_TRANSITION,
        clipPath: 'polygon(0% 100%, 0% 58%, 100% 52%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 58%, 100% 52%, 100% 100%)',
      };
    }
    case 'summit':
    default:
      return {
        background: [
          'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 28%, #cbd5e1 55%, #94a3b8 85%, #64748b 100%)',
          `repeating-linear-gradient(92deg, #f1f5f9 0 ${stripe}px, #e2e8f0 ${stripe}px ${stripe + 1}px)`,
          'linear-gradient(165deg, transparent 0%, rgba(59, 130, 246, 0.06) 38%, transparent 52%)',
          'linear-gradient(180deg, transparent 0%, rgba(71, 85, 105, 0.2) 100%)',
        ].join(', '),
        transform: `translate3d(0, 0, 0) scale(${1.06})`,
        transformOrigin: '50% 100%',
        transition: PATIENT_PORTAL_VISUAL_TRANSITION,
        clipPath: 'polygon(0% 100%, 0% 62%, 100% 60%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 62%, 100% 60%, 100% 100%)',
      };
  }
}

function mistLayerForPhase(state: MountainClimbEnvironmentState): (CSSProperties & { background?: string }) | null {
  const { phase, segmentT: t, thinAir } = state;
  const p = Math.min(1, Math.max(0, t));
  const mist: CSSProperties & { background?: string } = {
    opacity: 0,
    pointerEvents: 'none',
  };

  switch (phase) {
    case 'mountain_base':
      mist.background =
        'linear-gradient(180deg, transparent 0%, transparent 38%, rgba(226, 232, 240, 0.06) 62%, rgba(241, 245, 249, 0.14) 100%)';
      mist.opacity = 0.08 + p * 0.14;
      break;
    case 'ascent':
      mist.background =
        'linear-gradient(180deg, rgba(224, 242, 254, 0.06) 0%, transparent 28%, rgba(226, 232, 240, 0.1) 58%, rgba(241, 245, 249, 0.2) 100%)';
      mist.opacity = 0.14 + p * 0.22 + (thinAir ? 0.12 : 0);
      break;
    case 'summit':
      mist.background =
        'linear-gradient(180deg, transparent 0%, rgba(255, 255, 255, 0.05) 42%, rgba(226, 232, 240, 0.26) 100%)';
      mist.opacity = 0.34;
      break;
    default:
      return null;
  }
  return mist.opacity > 0.02 && mist.background ? mist : null;
}

function cloudOpacityForPhase(
  state: MountainClimbEnvironmentState,
  day: AvatarJourneyDayVariant,
  daily: MountainDailyEnvironmentState
): number {
  const { phase, segmentT: t } = state;
  const p = Math.min(1, Math.max(0, t));
  const ap = state.summitApproachProgress;
  let o = 0.14;
  switch (phase) {
    case 'approach':
      o = 0.1 + p * 0.08 + (day.skyPreset % 2) * 0.04;
      break;
    case 'path':
      o = 0.12 + p * 0.1;
      break;
    case 'mountain_base':
      o = 0.2 + p * 0.22;
      break;
    case 'ascent':
      o = 0.18 + ap * 0.28 + p * 0.12;
      break;
    case 'summit':
      o = 0.34 + (day.skyPreset % 2) * 0.08;
      break;
    default:
      break;
  }
  const cw = daily.weather === 'גשום' ? 1.55 : daily.weather === 'מעונן' ? 1.28 : 1;
  return Math.min(0.95, o * cw);
}

function mountainEdgeStrengthForLevel(level: number): number {
  const L = Math.min(30, Math.max(1, Math.floor(level) || 1));
  if (L < 2) return 0.08;
  const t = Math.min(1, Math.max(0, (L - 2) / 28));
  return Math.max(0.1, Math.min(1, 0.1 + t * 0.9));
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
      className="pointer-events-none absolute inset-0 z-[6]"
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
      className="avatar-journey-birds pointer-events-none absolute left-[8%] top-[10%] z-[8] opacity-90"
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
      className="pointer-events-none absolute inset-0 z-[8] overflow-hidden opacity-[0.42] mix-blend-overlay"
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
      className="pointer-events-none absolute bottom-[14%] left-[6%] z-[8] opacity-[0.55]"
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

function BloomFlowerField({
  density,
  daySeed,
  transition,
}: {
  density: number;
  daySeed: number;
  transition: string;
}) {
  if (density < 0.03) return null;
  const n = Math.max(1, Math.floor(2 + density * 16));
  const flowers = Array.from({ length: n }, (_, i) => {
    const h = ((daySeed + i * 1103515245) >>> 0) % 100000;
    const left = 6 + (h % 8800) / 100;
    const bottom = 2 + ((h >> 8) % 1400) / 100;
    const rot = (h % 40) - 20;
    const sc = 0.55 + ((h >> 16) % 45) / 100;
    return (
      <span
        key={i}
        className="absolute pointer-events-none select-none text-[11px] leading-none"
        style={{
          left: `${left}%`,
          bottom: `${bottom}%`,
          transform: `rotate(${rot}deg) scale(${sc})`,
          transition,
          opacity: 0.72 + density * 0.25,
        }}
        aria-hidden
      >
        🌸
      </span>
    );
  });
  return (
    <div
      className="ajb-layer-ground-flowers pointer-events-none absolute bottom-0 left-0 right-0 z-[4] h-[30%] overflow-visible"
      aria-hidden
    >
      {flowers}
    </div>
  );
}

function SimpleTreeSvg({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="42"
      height="56"
      viewBox="0 0 42 56"
      aria-hidden
    >
      <polygon fill="#15803d" points="21,2 40,38 2,38" opacity={0.92} />
      <polygon fill="#166534" points="21,14 36,40 6,40" opacity={0.88} />
      <rect x="16" y="36" width="10" height="18" rx="1" fill="#422006" />
    </svg>
  );
}

function SlopeTreesLayer({
  density,
  daySeed,
  transition,
}: {
  density: number;
  daySeed: number;
  transition: string;
}) {
  if (density < 0.05) return null;
  const n = Math.max(1, Math.floor(1 + density * 10));
  const trees = Array.from({ length: n }, (_, i) => {
    const h = ((daySeed + i * 2246822519) >>> 0) % 100000;
    const left = 4 + (h % 9000) / 100;
    const bottom = 8 + ((h >> 7) % 2200) / 100;
    const sc = 0.45 + ((h >> 14) % 55) / 100;
    return (
      <div
        key={i}
        className="absolute pointer-events-none"
        style={{
          left: `${left}%`,
          bottom: `${bottom}%`,
          transform: `scale(${sc * (0.85 + density * 0.35)})`,
          transition,
          opacity: 0.55 + density * 0.4,
        }}
      >
        <SimpleTreeSvg className="drop-shadow-sm" />
      </div>
    );
  });
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-[14%] top-[6%] z-[2] overflow-visible"
      aria-hidden
    >
      {trees}
    </div>
  );
}

function DeerSvg() {
  return (
    <svg width="72" height="44" viewBox="0 0 72 44" className="text-emerald-950/90">
      <ellipse cx="38" cy="28" rx="22" ry="10" fill="currentColor" />
      <ellipse cx="44" cy="18" rx="10" ry="12" fill="currentColor" />
      <path
        d="M44 10 L46 2 M50 12 L54 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

function RabbitSvg() {
  return (
    <svg width="56" height="48" viewBox="0 0 56 48" className="text-slate-800/88">
      <ellipse cx="28" cy="34" rx="14" ry="8" fill="currentColor" />
      <circle cx="28" cy="22" r="11" fill="currentColor" />
      <ellipse cx="22" cy="10" rx="3" ry="10" fill="currentColor" />
      <ellipse cx="34" cy="10" rx="3" ry="10" fill="currentColor" />
    </svg>
  );
}

function BirdSvg() {
  return (
    <svg width="64" height="36" viewBox="0 0 64 36" className="text-sky-900/85">
      <path
        d="M8 20 Q20 8 32 20 Q44 8 56 20"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="52" cy="18" r="4" fill="currentColor" />
    </svg>
  );
}

function EnvironmentAnimalOfTheDay({
  kind,
  daySeed,
  transition,
}: {
  kind: 'deer' | 'rabbit' | 'bird' | null;
  daySeed: number;
  transition: string;
}) {
  if (!kind) return null;
  const right = daySeed % 2 === 0;
  return (
    <div
      className={`pointer-events-none absolute bottom-[11%] z-[5] ${right ? 'right-[8%]' : 'left-[8%]'}`}
      style={{ transition, opacity: 0.88 }}
      aria-hidden
    >
      {kind === 'deer' ? <DeerSvg /> : kind === 'rabbit' ? <RabbitSvg /> : <BirdSvg />}
    </div>
  );
}

/**
 * CSS layered scene: sky → peak (level) → trees (days) → terrain (level) → flowers (days) → overlays.
 */
function MountainLayersScene({
  env,
  daily,
  clinicalYmd,
  normalizedLevel,
  environmentAssets,
}: {
  env: MountainClimbEnvironmentState;
  daily: MountainDailyEnvironmentState;
  clinicalYmd: string;
  normalizedLevel: number;
  environmentAssets: MountainEnvironmentAssets;
}) {
  const uid = useId().replace(/:/g, '');
  const rockGradId = `aj-rock-${uid}`;

  const dayVariant = useMemo(
    () => getAvatarJourneyDayVariant(clinicalYmd),
    [clinicalYmd]
  );

  const skyBackgroundColor = useMemo(
    () => getMountainDailySkyBackgroundColor(clinicalYmd),
    [clinicalYmd]
  );

  const peakScale = useMemo(
    () => getMountainPeakTransformScale(normalizedLevel),
    [normalizedLevel]
  );

  const terrainStyle = useMemo(
    () => terrainLayerStyleForPhase(env, dayVariant.groundStripePeriod),
    [env, dayVariant.groundStripePeriod]
  );

  const mist = useMemo(() => mistLayerForPhase(env), [env]);

  const cloudOpacity = useMemo(
    () => cloudOpacityForPhase(env, dayVariant, daily),
    [env, dayVariant, daily]
  );

  const edgeStrength = useMemo(
    () => mountainEdgeStrengthForLevel(normalizedLevel),
    [normalizedLevel]
  );

  const snowCap = normalizedLevel >= 2;
  const peakVisible = normalizedLevel >= 2;
  const phase = env.phase;
  const isSummitCelebration = phase === 'summit';
  const showRain = daily.weather === 'גשום';
  const showBirds = daily.visitors === 'ציפורים' && daily.weather !== 'גשום';
  const showWildlife = daily.visitors === 'חיות';

  /** Subtle vertical shift so low levels read as more distant; pairs with scale from useGamification. */
  const peakTranslateYPercent = Math.max(0, 30 - normalizedLevel) * 0.35;

  return (
    <div
      className={`absolute inset-0 overflow-hidden motion-safe:animate-avatar-stage-cross-in ${
        isSummitCelebration ? 'avatar-journey-summit-celebration' : ''
      }`}
    >
      {/* Layer 0 — static sky (daily seed via useGamification) */}
      <div
        className="ajb-layer0-sky"
        style={{ backgroundColor: skyBackgroundColor, transition: PATIENT_PORTAL_VISUAL_TRANSITION }}
      />

      {/* Layer 1 — peak: always in DOM (no conditional mount); hidden at L1; scales with level */}
      <div
        className="ajb-layer1-peak"
        style={{
          opacity: peakVisible ? 1 : 0,
          transition: PATIENT_PORTAL_VISUAL_TRANSITION,
        }}
        aria-hidden
      >
        <div
          className="ajb-layer1-peak-inner"
          style={{
            transform: `translate3d(0, ${peakTranslateYPercent}%, 0) scale(${peakScale})`,
            transition: PATIENT_PORTAL_VISUAL_TRANSITION,
          }}
        >
          <PrimaryMountainSvg
            rockGradId={rockGradId}
            snowCap={snowCap}
            edgeStrength={edgeStrength}
          />
        </div>
      </div>

      {/* Daily Bloom — trees on slopes (days 11+, independent of level) */}
      <SlopeTreesLayer
        density={environmentAssets.treeDensity}
        daySeed={environmentAssets.daySeed}
        transition={environmentAssets.transitionCss}
      />

      {/* Layer terrain — level-driven ground (Grass → Path → Earth → Rock) */}
      <div className="ajb-layer2-terrain" style={terrainStyle} />

      {/* Daily Bloom — flowers in grass (days 4+) */}
      <BloomFlowerField
        density={environmentAssets.flowerDensity}
        daySeed={environmentAssets.daySeed}
        transition={environmentAssets.transitionCss}
      />

      <EnvironmentAnimalOfTheDay
        kind={environmentAssets.animalOfTheDay}
        daySeed={environmentAssets.daySeed}
        transition={environmentAssets.transitionCss}
      />

      {mist && mist.background ? (
        <div className="pointer-events-none absolute inset-0 z-[5]" style={mist} />
      ) : null}

      <CloudLayer
        opacity={cloudOpacity}
        driftX={dayVariant.cloudDriftX}
        driftY={dayVariant.cloudDriftY}
      />

      {showBirds ? <SummitBirdsLayer /> : null}
      {showRain ? <SummitRainLayer /> : null}
      {showWildlife ? <DailyWildlifeLayer /> : null}
    </div>
  );
}

/**
 * Mountain Climb backdrop: level (1–30) drives peak scale + terrain phase; daily seed drives sky color.
 * `level` must match the patient level passed from `BodyMap3D` (`AvatarJourneyBackdrop` → `normalizePatientLevelForBackdrop`).
 */
export default function AvatarJourneyBackdrop({
  clinicalYmd,
  level,
  totalActiveDays = 1,
}: AvatarJourneyBackdropProps) {
  const lv = normalizePatientLevelForBackdrop(level);
  const backdrop = useMemo(
    () => getMountainBackdropContext(lv, clinicalYmd),
    [lv, clinicalYmd]
  );

  const environmentAssets = useMemo(
    () => getMountainEnvironmentAssets(totalActiveDays, clinicalYmd),
    [totalActiveDays, clinicalYmd]
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
      <MountainLayersScene
        key={backdrop.daily.dayKeyLocal}
        env={backdrop.climb}
        daily={backdrop.daily}
        clinicalYmd={clinicalYmd}
        normalizedLevel={lv}
        environmentAssets={environmentAssets}
      />
    </div>
  );
}
