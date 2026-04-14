/**
 * Patient-portal avatar backdrop: environment "stage" follows rehab level; within a stage,
 * the exact scene rotates by clinical day-of-year (stable per day, refreshes on skip-day).
 */

import type { CSSProperties } from 'react';
import { getLocalDayOfYearForYmd } from './dailyKnowledgeFact';

export type AvatarJourneyStageId = 'lowlands' | 'ascending' | 'highlands';

export type AvatarScenicBackgroundId =
  | 'valley'
  | 'field'
  | 'roads'
  | 'forest'
  | 'hill'
  | 'cities'
  | 'beach'
  | 'river'
  | 'mountains'
  | 'cliff'
  | 'clouds'
  | 'snowy_peak';

/**
 * Layered scenic definition: distant plane + optional mid-ground (parallax).
 * Use `imageSrc` / `midImageSrc` when assets exist under `/public`; CSS layers remain fallback.
 */
export interface AvatarJourneyBackgroundDef {
  id: AvatarScenicBackgroundId;
  /** Sky only — keep distant terrain on `cssFar` for readable parallax */
  cssBack: string;
  /** Far silhouettes (ranges, ridges) between sky and near ground */
  cssFar?: string;
  /** Near ground: valley floor, river band, fields — behind the avatar */
  cssMid?: string;
  imageSrc?: string;
  midImageSrc?: string;
  /** e.g. river wave animation — see `index.css` */
  midClassName?: string;
}

/** Levels 1–5 */
export const AVATAR_STAGE_LOWLANDS_BACKGROUNDS: readonly AvatarScenicBackgroundId[] = [
  'valley',
  'field',
  'roads',
  'forest',
] as const;

/** Levels 6–10 */
export const AVATAR_STAGE_ASCENDING_BACKGROUNDS: readonly AvatarScenicBackgroundId[] = [
  'hill',
  'cities',
  'beach',
  'river',
] as const;

/** Levels 11+ */
export const AVATAR_STAGE_HIGHLANDS_BACKGROUNDS: readonly AvatarScenicBackgroundId[] = [
  'mountains',
  'cliff',
  'clouds',
  'snowy_peak',
] as const;

export const AVATAR_JOURNEY_STAGES: Record<
  AvatarJourneyStageId,
  readonly AvatarScenicBackgroundId[]
> = {
  lowlands: AVATAR_STAGE_LOWLANDS_BACKGROUNDS,
  ascending: AVATAR_STAGE_ASCENDING_BACKGROUNDS,
  highlands: AVATAR_STAGE_HIGHLANDS_BACKGROUNDS,
};

/**
 * Option A: map each id to a file under `/public` (e.g. `/assets/bg/valley.webp`).
 * When set, images paint above the CSS layers (soft-light blend on the stack).
 */
export const AVATAR_SCENIC_BACKGROUND_ASSET_PATH: Partial<
  Record<AvatarScenicBackgroundId, string>
> = {
  // valley: '/assets/bg/valley.webp',
  // mountains: '/assets/bg/mountains.webp',
};

export const AVATAR_SCENIC_MID_ASSET_PATH: Partial<Record<AvatarScenicBackgroundId, string>> = {
  // valley: '/assets/bg/valley-mid.webp',
};

function backdropDef(
  id: AvatarScenicBackgroundId,
  cssBack: string,
  cssMid?: string,
  options?: { midClassName?: string }
): AvatarJourneyBackgroundDef {
  const imageSrc = AVATAR_SCENIC_BACKGROUND_ASSET_PATH[id];
  const midImageSrc = AVATAR_SCENIC_MID_ASSET_PATH[id];
  return {
    id,
    cssBack,
    ...(cssMid !== undefined ? { cssMid } : {}),
    ...(options?.midClassName ? { midClassName: options.midClassName } : {}),
    ...(imageSrc ? { imageSrc } : {}),
    ...(midImageSrc ? { midImageSrc } : {}),
  };
}

function backdropDefLayered(
  id: AvatarScenicBackgroundId,
  cssBack: string,
  cssFar: string,
  cssMid: string,
  options?: { midClassName?: string }
): AvatarJourneyBackgroundDef {
  const imageSrc = AVATAR_SCENIC_BACKGROUND_ASSET_PATH[id];
  const midImageSrc = AVATAR_SCENIC_MID_ASSET_PATH[id];
  return {
    id,
    cssBack,
    cssFar,
    cssMid,
    ...(options?.midClassName ? { midClassName: options.midClassName } : {}),
    ...(imageSrc ? { imageSrc } : {}),
    ...(midImageSrc ? { midImageSrc } : {}),
  };
}

/* ── Option B: layered CSS “environments” (multi-gradient + clip-path where noted) ── */

const CATALOG: Record<AvatarScenicBackgroundId, AvatarJourneyBackgroundDef> = {
  /* Lowlands — warm sun, earthy greens; readable flat “floor” behind avatar */
  valley: backdropDefLayered(
    'valley',
    [
      'linear-gradient(180deg, #0ea5e9 0%, #0ea5e9 18%, #7dd3fc 18%, #7dd3fc 34%, #fef08a 34%, #facc15 48%, #fde047 48%, #fef9c3 62%, #ecfccb 62%, #bbf7d0 100%)',
    ].join(', '),
    [
      'linear-gradient(90deg, #14532d 0%, #166534 38%, #4ade80 50%, #166534 62%, #14532d 100%)',
      'linear-gradient(180deg, rgba(20, 83, 45, 0.4) 0%, transparent 55%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #86efac 0%, #4ade80 38%, #16a34a 72%, #14532d 100%)',
      'repeating-linear-gradient(90deg, #22c55e 0 3px, #15803d 3px 6px)',
    ].join(', ')
  ),

  field: backdropDefLayered(
    'field',
    [
      'linear-gradient(180deg, #38bdf8 0%, #38bdf8 16%, #bae6fd 16%, #bae6fd 32%, #fef08a 32%, #facc15 46%, #d9f99d 46%, #bef264 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #3f6212 0%, #4d7c0f 40%, #65a30d 100%)',
      'linear-gradient(90deg, transparent 0%, rgba(254, 240, 138, 0.35) 50%, transparent 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #bbf7d0 0%, #4ade80 35%, #15803d 100%)',
      'repeating-linear-gradient(0deg, transparent 0 5px, rgba(21, 128, 61, 0.45) 5px 6px)',
    ].join(', ')
  ),

  roads: backdropDefLayered(
    'roads',
    [
      'linear-gradient(180deg, #60a5fa 0%, #60a5fa 14%, #93c5fd 14%, #fde68a 40%, #fcd34d 52%, #d6d3d1 52%, #a8a29e 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #57534e 0%, #78716c 55%, #a8a29e 100%)',
      'linear-gradient(100deg, transparent 36%, #44403c 36%, #44403c 38%, transparent 38%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #d6d3d1 0%, #a8a29e 42%, #57534e 100%)',
      'linear-gradient(95deg, transparent 40%, #292524 40%, #292524 43%, transparent 43%)',
    ].join(', ')
  ),

  forest: backdropDefLayered(
    'forest',
    [
      'linear-gradient(180deg, #4ade80 0%, #4ade80 22%, #86efac 22%, #bbf7d0 48%, #ecfccb 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #14532d 0%, #166534 100%)',
      'repeating-linear-gradient(90deg, #052e16 0 4%, #14532d 4% 4.6%, #052e16 4.6% 9%, #166534 9% 9.5%, #052e16 9.5% 14%, #14532d 14% 14.7%, transparent 14.7% 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #052e16 0%, #022c22 100%)',
      'linear-gradient(90deg, rgba(0,0,0,0.35) 0%, transparent 30%, transparent 70%, rgba(0,0,0,0.35) 100%)',
    ].join(', ')
  ),

  /* Ascending — cool blues / grey, rising land or water */
  hill: backdropDefLayered(
    'hill',
    [
      'linear-gradient(180deg, #1e3a8a 0%, #1e3a8a 20%, #64748b 20%, #94a3b8 45%, #cbd5e1 72%, #e2e8f0 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #334155 0%, #475569 100%)',
      'linear-gradient(125deg, transparent 40%, #1e293b 40%, #1e293b 43%, transparent 43%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #3f6212 0%, #365314 50%, #1c1917 100%)',
      'linear-gradient(180deg, transparent 0%, rgba(15, 23, 42, 0.55) 100%)',
    ].join(', ')
  ),

  cities: backdropDefLayered(
    'cities',
    [
      'linear-gradient(180deg, #0f172a 0%, #0f172a 24%, #334155 24%, #475569 52%, #64748b 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #020617 0%, #0f172a 100%)',
      'repeating-linear-gradient(90deg, #020617 0 5%, #1e293b 5% 5.8%, #334155 5.8% 6.4%, transparent 6.4% 11%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
      'linear-gradient(180deg, transparent 0%, rgba(56, 189, 248, 0.12) 100%)',
    ].join(', ')
  ),

  beach: backdropDefLayered(
    'beach',
    [
      'linear-gradient(180deg, #0369a1 0%, #0369a1 18%, #0ea5e9 18%, #38bdf8 40%, #7dd3fc 58%, #bae6fd 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #075985 0%, #0c4a6e 100%)',
      'linear-gradient(180deg, transparent 55%, rgba(14, 165, 233, 0.4) 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, transparent 0%, #0284c7 42%, #0369a1 48%, #0c4a6e 58%, #e7e5e4 58%, #d6d3d1 100%)',
      'repeating-linear-gradient(95deg, #f8fafc 0 10px, #e2e8f0 10px 11px)',
    ].join(', ')
  ),

  river: backdropDefLayered(
    'river',
    [
      'linear-gradient(180deg, #1e293b 0%, #1e293b 22%, #475569 22%, #64748b 48%, #94a3b8 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #334155 0%, #1e293b 100%)',
      'linear-gradient(90deg, transparent 0%, rgba(148, 163, 184, 0.25) 50%, transparent 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #57534e 0%, #44403c 52%, #0c4a6e 52%, #075985 68%, #0c4a6e 100%)',
      'repeating-linear-gradient(102deg, #0369a1 0 11px, #0ea5e9 11px 13px, #0284c7 13px 26px)',
    ].join(', '),
    { midClassName: 'avatar-scenic-river-wave' }
  ),

  /* Highlands — deep blues, high contrast, alpine read */
  mountains: backdropDefLayered(
    'mountains',
    [
      'linear-gradient(180deg, #020617 0%, #020617 28%, #1e3a8a 28%, #3b82f6 42%, #93c5fd 55%, #e0f2fe 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #f8fafc 0%, #f8fafc 14%, #cbd5e1 14%, #cbd5e1 26%, #64748b 26%, #334155 52%, #0f172a 100%)',
      'linear-gradient(90deg, rgba(15,23,42,0.4) 0%, transparent 35%, transparent 65%, rgba(15,23,42,0.45) 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #0f172a 0%, #020617 100%)',
      'linear-gradient(180deg, transparent 0%, rgba(2, 6, 23, 0.85) 100%)',
    ].join(', ')
  ),

  cliff: backdropDefLayered(
    'cliff',
    [
      'linear-gradient(180deg, #0f172a 0%, #0f172a 26%, #475569 26%, #94a3b8 55%, #f1f5f9 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #e2e8f0 0%, #e2e8f0 12%, #64748b 12%, #475569 38%, #1e293b 100%)',
      'linear-gradient(72deg, transparent 30%, rgba(15,23,42,0.5) 30%, rgba(15,23,42,0.5) 33%, transparent 33%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #020617 0%, #0f172a 100%)',
      'linear-gradient(88deg, #0f172a 0%, #1e293b 40%, #020617 100%)',
    ].join(', ')
  ),

  clouds: backdropDefLayered(
    'clouds',
    [
      'linear-gradient(180deg, #312e81 0%, #312e81 20%, #6366f1 20%, #a5b4fc 42%, #e0e7ff 70%, #f8fafc 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #cbd5e1 0%, #e2e8f0 35%, #f8fafc 100%)',
      'repeating-linear-gradient(90deg, #f1f5f9 0 12%, #e2e8f0 12% 12.8%, transparent 12.8% 24%)',
    ].join(', '),
    [
      'linear-gradient(180deg, rgba(248,250,252,0.95) 0%, rgba(226,232,240,0.85) 100%)',
      'linear-gradient(180deg, transparent 40%, rgba(148, 163, 184, 0.35) 100%)',
    ].join(', ')
  ),

  snowy_peak: backdropDefLayered(
    'snowy_peak',
    [
      'linear-gradient(180deg, #0c1222 0%, #0c1222 18%, #1e1b4b 18%, #4338ca 32%, #fb7185 32%, #f97316 42%, #fde047 42%, #38bdf8 55%, #0ea5e9 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #ffffff 0%, #ffffff 12%, #e2e8f0 12%, #e2e8f0 22%, #94a3b8 22%, #475569 48%, #1e293b 78%, #020617 100%)',
      'linear-gradient(90deg, rgba(15,23,42,0.35) 0%, transparent 40%, transparent 60%, rgba(15,23,42,0.4) 100%)',
    ].join(', '),
    [
      'linear-gradient(180deg, #f8fafc 0%, #e2e8f0 35%, #cbd5e1 100%)',
      'repeating-linear-gradient(90deg, #f1f5f9 0 4px, #cbd5e1 4px 5px)',
    ].join(', ')
  ),
};

/** Far layer — jagged ranges, V-valley walls, treelines (parallax) */
export const AVATAR_SCENIC_FAR_CLIP: Partial<Record<AvatarScenicBackgroundId, string>> = {
  valley:
    'polygon(0% 100%, 0% 38%, 16% 24%, 50% 46%, 84% 24%, 100% 38%, 100% 100%)',
  field:
    'polygon(0% 100%, 0% 44%, 24% 32%, 50% 38%, 76% 32%, 100% 44%, 100% 100%)',
  roads: 'polygon(0% 100%, 0% 46%, 100% 40%, 100% 100%)',
  forest:
    'polygon(0% 100%, 0% 48%, 10% 36%, 18% 42%, 26% 30%, 36% 38%, 48% 26%, 58% 34%, 70% 28%, 80% 38%, 90% 32%, 100% 44%, 100% 100%)',
  hill:
    'polygon(0% 100%, 0% 40%, 20% 28%, 40% 34%, 60% 22%, 80% 32%, 100% 38%, 100% 100%)',
  cities: 'polygon(0% 100%, 0% 32%, 100% 28%, 100% 100%)',
  beach: 'polygon(0% 100%, 0% 52%, 100% 48%, 100% 100%)',
  river:
    'polygon(0% 100%, 0% 36%, 22% 28%, 50% 32%, 78% 26%, 100% 34%, 100% 100%)',
  mountains:
    'polygon(0% 100%, 0% 72%, 6% 58%, 12% 66%, 20% 48%, 28% 58%, 36% 42%, 44% 54%, 52% 36%, 60% 50%, 68% 40%, 76% 52%, 84% 44%, 92% 56%, 100% 46%, 100% 100%)',
  cliff:
    'polygon(0% 100%, 0% 52%, 18% 28%, 42% 44%, 58% 22%, 82% 48%, 100% 34%, 100% 100%)',
  clouds: 'polygon(0% 100%, 0% 38%, 100% 34%, 100% 100%)',
  snowy_peak:
    'polygon(0% 100%, 0% 70%, 8% 52%, 16% 60%, 24% 44%, 32% 56%, 42% 38%, 50% 50%, 58% 34%, 66% 48%, 74% 40%, 82% 54%, 90% 42%, 100% 50%, 100% 100%)',
};

/** Near layer — floor, river band, foreground slope */
export const AVATAR_SCENIC_MID_CLIP: Partial<Record<AvatarScenicBackgroundId, string>> = {
  valley: 'polygon(0% 100%, 0% 70%, 100% 70%, 100% 100%)',
  field: 'polygon(0% 100%, 0% 58%, 100% 56%, 100% 100%)',
  roads: 'polygon(0% 100%, 0% 62%, 100% 60%, 100% 100%)',
  forest: 'polygon(0% 100%, 0% 62%, 100% 60%, 100% 100%)',
  hill: 'polygon(0% 100%, 0% 58%, 100% 55%, 100% 100%)',
  cities: 'polygon(0% 100%, 0% 48%, 100% 46%, 100% 100%)',
  beach: 'polygon(0% 100%, 0% 52%, 100% 50%, 100% 100%)',
  river: 'polygon(0% 100%, 0% 48%, 100% 46%, 100% 100%)',
  mountains:
    'polygon(0% 100%, 0% 78%, 100% 74%, 100% 100%)',
  cliff: 'polygon(0% 100%, 0% 68%, 100% 65%, 100% 100%)',
  clouds: 'polygon(0% 100%, 0% 52%, 100% 50%, 100% 100%)',
  snowy_peak:
    'polygon(0% 100%, 0% 68%, 100% 65%, 100% 100%)',
};

/** Strong stage read: warm lowlands → cool ascending → dramatic highlands */
export function getAvatarStageAtmosphereStyle(stage: AvatarJourneyStageId): CSSProperties {
  switch (stage) {
    case 'lowlands':
      return {
        background: [
          'radial-gradient(ellipse 95% 70% at 50% -8%, rgba(253, 224, 71, 0.55) 0%, rgba(254, 240, 138, 0.2) 38%, transparent 58%)',
          'linear-gradient(180deg, rgba(255, 251, 235, 0.35) 0%, transparent 35%, rgba(74, 222, 128, 0.12) 100%)',
        ].join(', '),
        mixBlendMode: 'soft-light',
      };
    case 'ascending':
      return {
        background: [
          'linear-gradient(188deg, rgba(15, 23, 42, 0.45) 0%, transparent 45%)',
          'radial-gradient(ellipse 110% 60% at 50% 100%, rgba(14, 165, 233, 0.22), transparent 55%)',
          'linear-gradient(180deg, transparent 40%, rgba(51, 65, 85, 0.35) 100%)',
        ].join(', '),
        mixBlendMode: 'multiply',
      };
    case 'highlands':
      return {
        background: [
          'linear-gradient(180deg, rgba(2, 6, 23, 0.55) 0%, transparent 42%, rgba(251, 113, 133, 0.18) 72%, rgba(251, 191, 36, 0.12) 100%)',
          'radial-gradient(ellipse 55% 40% at 18% 15%, rgba(255, 255, 255, 0.35), transparent 50%)',
          'radial-gradient(ellipse 45% 35% at 88% 12%, rgba(147, 197, 253, 0.25), transparent 45%)',
        ].join(', '),
        mixBlendMode: 'overlay',
      };
    default:
      return {};
  }
}

/** Normalized patient level (1+) for backdrop logic — invalid input falls back to 1. */
export function normalizePatientLevelForBackdrop(level: number): number {
  if (!Number.isFinite(level)) return 1;
  return Math.max(1, Math.floor(level));
}

export function getAvatarJourneyStageForLevel(level: number): AvatarJourneyStageId {
  const lv = normalizePatientLevelForBackdrop(level);
  if (lv <= 5) return 'lowlands';
  if (lv <= 10) return 'ascending';
  return 'highlands';
}

/**
 * Scenic backgrounds allowed at this rehab level — strict pools (no cross-stage ids).
 */
export function getAvatarScenicBackgroundPoolForLevel(
  level: number
): readonly AvatarScenicBackgroundId[] {
  const lv = normalizePatientLevelForBackdrop(level);
  if (lv <= 5) return AVATAR_STAGE_LOWLANDS_BACKGROUNDS;
  if (lv <= 10) return AVATAR_STAGE_ASCENDING_BACKGROUNDS;
  return AVATAR_STAGE_HIGHLANDS_BACKGROUNDS;
}

export interface AvatarScenicBackdropSnapshot {
  /** Rehab level used to choose the stage pool (1+). */
  level: number;
  stage: AvatarJourneyStageId;
  def: AvatarJourneyBackgroundDef;
  /** 1-based local day-of-year for the clinical date */
  dayOfYear: number;
}

/**
 * Picks `stageBackgrounds[dayOfYear % stageBackgrounds.length]` for the stage implied by `level`.
 */
export function resolveAvatarScenicBackdrop(
  level: number,
  clinicalYmd: string
): AvatarScenicBackdropSnapshot {
  const normalizedLevel = normalizePatientLevelForBackdrop(level);
  const stage = getAvatarJourneyStageForLevel(normalizedLevel);
  const list = getAvatarScenicBackgroundPoolForLevel(normalizedLevel);
  const dayOfYear = getLocalDayOfYearForYmd(clinicalYmd);
  const idx =
    list.length === 0 ? 0 : ((dayOfYear % list.length) + list.length) % list.length;
  const id = list[idx] ?? list[0];
  const def = CATALOG[id];
  return { level: normalizedLevel, stage, def, dayOfYear };
}
