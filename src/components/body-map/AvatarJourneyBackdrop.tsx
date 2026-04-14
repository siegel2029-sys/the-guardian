import {
  useMemo,
  useState,
  useEffect,
  useId,
  type CSSProperties,
} from 'react';
import { normalizePatientLevelForBackdrop } from '../../utils/avatarDailyBackground';

export interface AvatarJourneyBackdropProps {
  clinicalYmd: string;
  level: number;
}

type JourneyPhase = 'approach' | 'base' | 'climb' | 'summit';

function phaseForLevel(level: number): JourneyPhase {
  if (level >= 15) return 'summit';
  if (level >= 11) return 'climb';
  if (level >= 6) return 'base';
  return 'approach';
}

/** 0–1 progress within the current phase band */
function segmentT(level: number, phase: JourneyPhase): number {
  switch (phase) {
    case 'approach':
      return (level - 1) / 4;
    case 'base':
      return (level - 6) / 4;
    case 'climb':
      return (level - 11) / 3;
    case 'summit':
      return 1;
    default:
      return 0;
  }
}

const TRANSFORM_EASE = 'transform 0.8s cubic-bezier(0.22, 0.82, 0.32, 1), opacity 0.65s ease-out';

interface NarrativeLayers {
  sky: CSSProperties;
  mountain: CSSProperties;
  ground: CSSProperties;
  mist: CSSProperties & { background?: string };
  clouds: { show: boolean; opacity: number };
}

function buildNarrativeLayers(level: number, phase: JourneyPhase, t: number): NarrativeLayers {
  const tClamped = Math.min(1, Math.max(0, t));
  const altitude = Math.min(1, (Math.min(level, 15) - 1) / 14);

  let sky: CSSProperties;
  let mountain: CSSProperties;
  let ground: CSSProperties;
  const mist: CSSProperties & { background?: string } = {
    opacity: 0,
    pointerEvents: 'none' as const,
  };
  let clouds = { show: false, opacity: 0 };

  switch (phase) {
    case 'approach': {
      const scale = 0.34 + tClamped * 0.36;
      const ty = 14 - tClamped * 5;
      sky = {
        background: [
          'linear-gradient(180deg, #0ea5e9 0%, #38bdf8 18%, #7dd3fc 32%, #fef08a 48%, #fde047 58%, #bbf7d0 78%, #4ade80 100%)',
          `linear-gradient(180deg, rgba(15,23,42,${0.05 + altitude * 0.12}) 0%, transparent 42%)`,
        ].join(', '),
      };
      mountain = {
        transform: `translate3d(0, ${ty}%, 0) scale(${scale})`,
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
      };
      ground = {
        background: [
          'linear-gradient(180deg, transparent 0%, #bbf7d0 38%, #4ade80 62%, #15803d 100%)',
          'repeating-linear-gradient(90deg, transparent 0 5px, rgba(21, 128, 61, 0.2) 5px 6px)',
        ].join(', '),
        transform: 'translate3d(0, 0, 0) scale(1)',
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
        clipPath: 'polygon(0% 100%, 0% 52%, 100% 50%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 52%, 100% 50%, 100% 100%)',
      };
      break;
    }
    case 'base': {
      const scale = 0.58 + tClamped * 0.52;
      const ty = 24 - tClamped * 15;
      sky = {
        background: [
          'linear-gradient(180deg, #1e293b 0%, #334155 24%, #64748b 52%, #94a3b8 78%, #cbd5e1 100%)',
          `linear-gradient(180deg, rgba(15,23,42,${0.18 + tClamped * 0.12}) 0%, transparent 55%)`,
        ].join(', '),
      };
      mountain = {
        transform: `translate3d(0, ${ty}%, 0) scale(${scale})`,
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
      };
      ground = {
        background: [
          'linear-gradient(180deg, #57534e 0%, #44403c 35%, #292524 72%, #1c1917 100%)',
          'linear-gradient(95deg, transparent 35%, rgba(15, 23, 42, 0.45) 36%, transparent 37%)',
          'linear-gradient(88deg, transparent 62%, rgba(120, 113, 108, 0.5) 63%, transparent 64%)',
        ].join(', '),
        transform: `translate3d(0, ${-2 - tClamped * 5}%, 0) scale(1)`,
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
        clipPath: 'polygon(0% 100%, 0% 46%, 12% 40%, 28% 44%, 50% 38%, 72% 42%, 88% 36%, 100% 44%, 100% 100%)',
        WebkitClipPath:
          'polygon(0% 100%, 0% 46%, 12% 40%, 28% 44%, 50% 38%, 72% 42%, 88% 36%, 100% 44%, 100% 100%)',
      };
      break;
    }
    case 'climb': {
      const scale = 1.08 + tClamped * 0.2;
      const mty = -6 - tClamped * 30;
      const gty = 8 + tClamped * 28;
      const gsc = 1 - tClamped * 0.14;
      sky = {
        background: [
          'linear-gradient(180deg, #020617 0%, #0f172a 22%, #1e293b 48%, #475569 78%, #94a3b8 100%)',
          `linear-gradient(180deg, rgba(2,6,23,${0.35 + tClamped * 0.2}) 0%, transparent 50%)`,
        ].join(', '),
      };
      mountain = {
        transform: `translate3d(0, ${mty}%, 0) scale(${scale})`,
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
      };
      ground = {
        background: [
          'linear-gradient(180deg, #44403c 0%, #292524 45%, #1c1917 100%)',
          'linear-gradient(180deg, transparent 0%, rgba(15, 23, 42, 0.55) 100%)',
        ].join(', '),
        transform: `translate3d(0, ${gty}%, 0) scale(${gsc})`,
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
        clipPath: 'polygon(0% 100%, 0% 58%, 100% 52%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 58%, 100% 52%, 100% 100%)',
      };
      mist.background = [
        'linear-gradient(180deg, transparent 0%, transparent 28%, rgba(226, 232, 240, 0.15) 55%, rgba(241, 245, 249, 0.5) 100%)',
      ].join(', ');
      mist.opacity = 0.35 + tClamped * 0.45;
      clouds = { show: true, opacity: 0.25 + tClamped * 0.5 };
      break;
    }
    case 'summit':
    default: {
      sky = {
        background: [
          'linear-gradient(180deg, #020617 0%, #1e1b4b 18%, #4338ca 32%, #7dd3fc 55%, #e0f2fe 78%, #f8fafc 100%)',
          'linear-gradient(180deg, rgba(251, 113, 133, 0.2) 30%, transparent 42%, rgba(251, 191, 36, 0.12) 52%, transparent 62%)',
        ].join(', '),
      };
      mountain = {
        transform: 'translate3d(0, 0, 0) scale(1)',
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
      };
      ground = {
        background: [
          'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 40%, #cbd5e1 100%)',
          'repeating-linear-gradient(90deg, #f1f5f9 0 4px, #e2e8f0 4px 5px)',
          'linear-gradient(180deg, transparent 0%, rgba(148, 163, 184, 0.25) 100%)',
        ].join(', '),
        transform: 'translate3d(0, 0, 0) scale(1.04)',
        transformOrigin: '50% 100%',
        transition: TRANSFORM_EASE,
        clipPath: 'polygon(0% 100%, 0% 62%, 100% 60%, 100% 100%)',
        WebkitClipPath: 'polygon(0% 100%, 0% 62%, 100% 60%, 100% 100%)',
      };
      mist.background =
        'linear-gradient(180deg, transparent 0%, rgba(255, 255, 255, 0.08) 45%, rgba(226, 232, 240, 0.35) 100%)';
      mist.opacity = 0.4;
      clouds = { show: true, opacity: 0.35 };
      break;
    }
  }

  return { sky, mountain, ground, mist, clouds };
}

/** Sharp primary mass: single jagged polygon in viewBox coordinates */
function PrimaryMountainSvg({
  rockGradId,
  snowCap,
}: {
  rockGradId: string;
  snowCap: boolean;
}) {
  const d =
    'M 100 8 L 124 52 L 148 38 L 168 58 L 182 48 L 196 78 L 200 210 L 0 210 L 0 88 L 24 58 L 48 72 L 76 42 L 100 8 Z';
  return (
    <svg
      className="absolute bottom-0 left-1/2 h-[92%] w-[135%] -translate-x-1/2"
      viewBox="0 0 200 210"
      preserveAspectRatio="xMidYMax meet"
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
      {snowCap ? (
        <path fill="#f8fafc" d="M 100 8 L 124 48 L 100 32 L 76 48 Z" opacity={0.98} />
      ) : null}
    </svg>
  );
}

/** Summit: distant jagged range sitting below the avatar */
function SummitDistantPeaksSvg({ rockGradId }: { rockGradId: string }) {
  return (
    <svg
      className="absolute bottom-[2%] left-1/2 h-[28%] w-[120%] -translate-x-1/2"
      viewBox="0 0 200 80"
      preserveAspectRatio="xMidYMax meet"
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
        points="0,80 0,52 18,38 32,48 48,28 64,42 82,22 100,40 118,24 136,44 154,30 172,46 188,36 200,48 200,80"
      />
    </svg>
  );
}

function CloudLayer({ opacity }: { opacity: number }) {
  if (opacity < 0.05) return null;
  const blob =
    'rounded-full bg-white/90 shadow-[inset_-4px_-4px_0_rgba(148,163,184,0.25)]';
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[2]"
      style={{ opacity, mixBlendMode: 'screen' }}
    >
      <div
        className={`avatar-journey-cloud absolute -left-[8%] top-[12%] h-[14%] w-[42%] ${blob} blur-[1px]`}
      />
      <div
        className={`avatar-journey-cloud-delayed absolute left-[38%] top-[22%] h-[11%] w-[36%] ${blob} blur-[1px]`}
      />
      <div
        className={`avatar-journey-cloud absolute right-[-6%] top-[18%] h-[12%] w-[38%] ${blob} blur-[1px]`}
      />
    </div>
  );
}

function NarrativeMountScene({
  level,
  phase,
  t,
}: {
  level: number;
  phase: JourneyPhase;
  t: number;
}) {
  const uid = useId().replace(/:/g, '');
  const rockGradId = `aj-rock-${uid}`;
  const distantGradId = `aj-dist-${uid}`;

  const layers = useMemo(() => buildNarrativeLayers(level, phase, t), [level, phase, t]);
  const snowCap = phase === 'climb' || phase === 'summit';
  const showPrimaryMountain = phase !== 'summit';

  return (
    <div className="absolute inset-0 overflow-hidden motion-safe:animate-avatar-stage-cross-in">
      {/* Layer 1 — sky / sun / altitude */}
      <div className="absolute inset-0" style={layers.sky} />

      {/* Layer 2 — mountain (goal visible from level 1; scales up through approach/base/climb) */}
      <div
        className="absolute inset-x-0 bottom-0 top-[4%] z-0"
        style={layers.mountain}
      >
        {showPrimaryMountain ? (
          <PrimaryMountainSvg rockGradId={rockGradId} snowCap={snowCap} />
        ) : (
          <SummitDistantPeaksSvg rockGradId={distantGradId} />
        )}
      </div>

      {/* Layer 3 — ground the avatar stands on */}
      <div
        className="absolute inset-x-0 bottom-0 top-[38%] z-[1]"
        style={layers.ground}
      />

      {/* Mist / high-altitude haze (climb + summit) */}
      {(layers.mist.opacity ?? 0) > 0.02 && layers.mist.background ? (
        <div
          className="pointer-events-none absolute inset-0 z-[3]"
          style={layers.mist}
        />
      ) : null}

      {layers.clouds.show ? <CloudLayer opacity={layers.clouds.opacity} /> : null}
    </div>
  );
}

/**
 * Continuous mountain journey: levels 1–5 approach, 6–10 base, 11–14 climb, 15+ summit.
 * `clinicalYmd` is reserved for future daily accents; visuals are driven by `level` only.
 */
export default function AvatarJourneyBackdrop({
  clinicalYmd: _clinicalYmd,
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
      <NarrativeMountScene key={phase} level={lv} phase={phase} t={t} />
    </div>
  );
}
