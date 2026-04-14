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
  /** Sky / horizon / distant environment */
  cssBack: string;
  /** Ground, water, silhouettes — anchored to lower portion of the frame */
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
  const base: AvatarJourneyBackgroundDef = {
    id,
    cssBack,
    ...(cssMid !== undefined ? { cssMid } : {}),
    ...(options?.midClassName ? { midClassName: options.midClassName } : {}),
    ...(imageSrc ? { imageSrc } : {}),
    ...(midImageSrc ? { midImageSrc } : {}),
  };
  return base;
}

/* ── Option B: layered CSS “environments” (multi-gradient + clip-path where noted) ── */

const CATALOG: Record<AvatarScenicBackgroundId, AvatarJourneyBackgroundDef> = {
  valley: backdropDef(
    'valley',
    [
      'linear-gradient(180deg, #87ceeb 0%, #b8e0f0 22%, #d4ead8 48%, #e8f5e0 72%, #f5f0dc 100%)',
      'radial-gradient(ellipse 85% 55% at 50% -8%, rgba(255, 235, 160, 0.55), transparent 58%)',
    ].join(', '),
    [
      'linear-gradient(180deg, transparent 0%, rgba(76, 125, 59, 0.15) 38%, rgba(56, 102, 49, 0.75) 72%, rgba(35, 65, 35, 0.95) 100%)',
      'linear-gradient(95deg, transparent 40%, rgba(255, 255, 255, 0.08) 50%, transparent 60%)',
    ].join(', ')
  ),

  field: backdropDef(
    'field',
    [
      'linear-gradient(180deg, #7ec4e8 0%, #a8daf0 18%, #c8ead8 45%, #d8eec8 70%, #e8f2b8 100%)',
      'radial-gradient(ellipse 100% 70% at 30% 0%, rgba(255, 248, 200, 0.5), transparent 55%)',
    ].join(', '),
    [
      'linear-gradient(180deg, transparent 25%, rgba(124, 179, 66, 0.35) 55%, rgba(85, 139, 47, 0.92) 100%)',
      'radial-gradient(circle at 12% 88%, #f472b6 0 2px, transparent 3px)',
      'radial-gradient(circle at 28% 92%, #fbbf24 0 2px, transparent 3px)',
      'radial-gradient(circle at 44% 85%, #ec4899 0 1.5px, transparent 2.5px)',
      'radial-gradient(circle at 58% 90%, #fde047 0 2px, transparent 3px)',
      'radial-gradient(circle at 72% 87%, #f472b6 0 1.5px, transparent 2.5px)',
      'radial-gradient(circle at 86% 91%, #fb923c 0 2px, transparent 3px)',
      'radial-gradient(circle at 18% 78%, #a3e635 0 2px, transparent 3px)',
      'radial-gradient(circle at 92% 82%, #facc15 0 1.5px, transparent 2.5px)',
    ].join(', ')
  ),

  roads: backdropDef(
    'roads',
    [
      'linear-gradient(180deg, #9ec9e8 0%, #c5ddf0 30%, #e8dcc8 65%, #d4c4a8 100%)',
      'radial-gradient(ellipse 90% 50% at 50% -5%, rgba(255, 230, 160, 0.4), transparent 55%)',
    ].join(', '),
    [
      'linear-gradient(180deg, transparent 42%, rgba(110, 95, 78, 0.2) 58%, rgba(74, 62, 48, 0.88) 100%)',
      'linear-gradient(100deg, transparent 0%, transparent 38%, rgba(92, 78, 62, 0.55) 50%, transparent 62%, transparent 100%)',
    ].join(', ')
  ),

  forest: backdropDef(
    'forest',
    [
      'linear-gradient(180deg, #5a8a6e 0%, #7daf8a 25%, #a8cfa8 55%, #c8e4c4 85%, #dff0dc 100%)',
      'radial-gradient(ellipse 70% 45% at 50% 8%, rgba(255, 255, 255, 0.35), transparent 60%)',
    ].join(', '),
    [
      'linear-gradient(180deg, transparent 20%, rgba(15, 45, 28, 0.5) 50%, rgba(8, 28, 16, 0.92) 100%)',
      'repeating-linear-gradient(90deg, transparent 0 11%, rgba(12, 40, 22, 0.85) 11% 12%, transparent 12% 24%)',
      'repeating-linear-gradient(90deg, transparent 6% 17%, rgba(18, 52, 30, 0.75) 17% 18.5%, transparent 18.5% 30%)',
    ].join(', ')
  ),

  hill: backdropDef(
    'hill',
    [
      'linear-gradient(180deg, #5b7a9a 0%, #7a9eb8 28%, #9ebfd4 55%, #b8d4e6 82%, #d0e6f2 100%)',
      'linear-gradient(200deg, rgba(200, 220, 235, 0.4) 0%, transparent 45%)',
    ].join(', '),
    [
      'linear-gradient(180deg, transparent 35%, rgba(60, 95, 72, 0.35) 62%, rgba(42, 72, 55, 0.9) 100%)',
      'linear-gradient(180deg, transparent 48%, rgba(30, 58, 45, 0.5) 100%)',
    ].join(', ')
  ),

  cities: backdropDef(
    'cities',
    [
      'linear-gradient(180deg, #1a2744 0%, #2d3f5c 22%, #4a6080 48%, #6d87a8 78%, #8fa8c2 100%)',
      'radial-gradient(ellipse 80% 40% at 50% 100%, rgba(147, 197, 253, 0.25), transparent 55%)',
    ].join(', '),
    [
      'linear-gradient(180deg, transparent 30%, rgba(15, 23, 42, 0.5) 55%, rgba(15, 23, 42, 0.95) 100%)',
      'repeating-linear-gradient(90deg, #0f172a 0 6%, #1e293b 6% 8%, #334155 8% 9.5%, transparent 9.5% 14%)',
      'linear-gradient(180deg, transparent 0%, rgba(30, 58, 95, 0.35) 100%)',
    ].join(', ')
  ),

  beach: backdropDef(
    'beach',
    [
      'linear-gradient(180deg, #4a9fd4 0%, #6eb8e6 22%, #8cc8ec 40%, #a8daf2 58%, #c8e8f8 100%)',
      'radial-gradient(ellipse 100% 55% at 70% -5%, rgba(255, 255, 255, 0.45), transparent 50%)',
    ].join(', '),
    [
      'linear-gradient(180deg, transparent 48%, rgba(56, 130, 180, 0.45) 62%, rgba(30, 100, 150, 0.75) 72%, transparent 72.5%)',
      'linear-gradient(180deg, transparent 72%, rgba(230, 210, 160, 0.95) 78%, rgba(210, 180, 120, 1) 88%, rgba(190, 160, 100, 1) 100%)',
      'repeating-linear-gradient(95deg, transparent 0 14px, rgba(255, 255, 255, 0.12) 14px 15px)',
    ].join(', ')
  ),

  river: backdropDef(
    'river',
    [
      'linear-gradient(180deg, #3d6a7a 0%, #5a8a9a 25%, #7aa8b8 50%, #9ec4d4 78%, #b8d8e8 100%)',
      'linear-gradient(160deg, rgba(180, 220, 240, 0.35) 0%, transparent 50%)',
    ].join(', '),
    [
      'linear-gradient(180deg, transparent 52%, rgba(12, 74, 110, 0.5) 68%, rgba(8, 55, 85, 0.85) 82%, rgba(6, 44, 70, 0.95) 100%)',
      'linear-gradient(180deg, transparent 78%, rgba(56, 189, 248, 0.35) 88%, rgba(14, 165, 233, 0.5) 100%)',
    ].join(', '),
    { midClassName: 'avatar-scenic-river-wave' }
  ),

  mountains: backdropDef(
    'mountains',
    [
      'linear-gradient(180deg, #1e3a5f 0%, #334e6e 18%, #5a6e8a 42%, #8a9ab0 68%, #c5ced8 92%, #e8ecf0 100%)',
      'radial-gradient(ellipse 120% 60% at 50% -10%, rgba(200, 220, 240, 0.35), transparent 50%)',
    ].join(', '),
    [
      'linear-gradient(180deg, transparent 18%, rgba(71, 85, 105, 0.55) 42%, rgba(51, 65, 85, 0.92) 68%, rgba(30, 41, 59, 0.98) 100%)',
      'linear-gradient(180deg, transparent 32%, rgba(248, 250, 252, 0.15) 38%, transparent 44%)',
    ].join(', ')
  ),

  cliff: backdropDef(
    'cliff',
    [
      'linear-gradient(180deg, #475569 0%, #64748b 30%, #94a3b8 60%, #cbd5e1 88%, #f1f5f9 100%)',
      'linear-gradient(200deg, rgba(255, 255, 255, 0.2) 0%, transparent 40%)',
    ].join(', '),
    [
      'linear-gradient(180deg, transparent 22%, rgba(51, 65, 85, 0.65) 48%, rgba(30, 41, 59, 0.95) 78%, #0f172a 100%)',
      'linear-gradient(88deg, transparent 0%, rgba(15, 23, 42, 0.35) 35%, rgba(148, 163, 184, 0.15) 50%, rgba(15, 23, 42, 0.45) 65%, transparent 100%)',
    ].join(', ')
  ),

  clouds: backdropDef(
    'clouds',
    [
      'linear-gradient(180deg, #64748b 0%, #94a3b8 35%, #cbd5e1 70%, #f8fafc 100%)',
      'radial-gradient(ellipse 80% 50% at 20% 25%, rgba(255, 255, 255, 0.5), transparent 55%)',
      'radial-gradient(ellipse 70% 45% at 75% 35%, rgba(248, 250, 252, 0.45), transparent 50%)',
    ].join(', '),
    [
      'linear-gradient(180deg, transparent 30%, rgba(241, 245, 249, 0.5) 55%, rgba(226, 232, 240, 0.85) 100%)',
      'radial-gradient(ellipse 100% 40% at 50% 95%, rgba(255, 255, 255, 0.35), transparent 70%)',
    ].join(', ')
  ),

  snowy_peak: backdropDef(
    'snowy_peak',
    [
      'linear-gradient(180deg, #0f172a 0%, #1e3a5f 22%, #334155 48%, #64748b 72%, #cbd5e1 100%)',
      'radial-gradient(ellipse 90% 50% at 50% -5%, rgba(191, 219, 254, 0.25), transparent 55%)',
    ].join(', '),
    [
      'linear-gradient(180deg, transparent 25%, rgba(148, 163, 184, 0.4) 45%, rgba(248, 250, 252, 0.92) 72%, #ffffff 100%)',
      'linear-gradient(180deg, transparent 40%, rgba(255, 255, 255, 0.35) 48%, transparent 52%)',
    ].join(', ')
  ),
};

/** Clip-path silhouettes — applied on mid layer wrapper in AvatarJourneyBackdrop */
export const AVATAR_SCENIC_MID_CLIP: Partial<Record<AvatarScenicBackgroundId, string>> = {
  mountains:
    'polygon(0% 100%, 0% 58%, 8% 48%, 15% 55%, 22% 42%, 30% 50%, 38% 38%, 48% 46%, 55% 34%, 65% 44%, 74% 30%, 82% 40%, 90% 28%, 100% 36%, 100% 100%)',
  valley:
    'polygon(0% 100%, 0% 62%, 18% 48%, 35% 58%, 52% 45%, 68% 55%, 85% 48%, 100% 58%, 100% 100%)',
  field: 'polygon(0% 100%, 0% 52%, 100% 48%, 100% 100%)',
  snowy_peak:
    'polygon(0% 100%, 0% 55%, 12% 40%, 25% 52%, 40% 32%, 52% 45%, 65% 28%, 78% 42%, 88% 35%, 100% 48%, 100% 100%)',
};

/** Subtle stage tint over the full stack (warm lowlands / coastal ascending / mist highlands) */
export function getAvatarStageAtmosphereStyle(stage: AvatarJourneyStageId): CSSProperties {
  switch (stage) {
    case 'lowlands':
      return {
        background: [
          'radial-gradient(ellipse 120% 75% at 50% -12%, rgba(255, 230, 160, 0.42), transparent 52%)',
          'linear-gradient(180deg, rgba(255, 252, 240, 0.18) 0%, transparent 38%, rgba(120, 160, 90, 0.08) 100%)',
        ].join(', '),
        mixBlendMode: 'soft-light',
      };
    case 'ascending':
      return {
        background: [
          'linear-gradient(195deg, rgba(30, 58, 95, 0.28) 0%, transparent 42%)',
          'radial-gradient(ellipse 100% 55% at 50% 100%, rgba(56, 189, 248, 0.12), transparent 55%)',
          'linear-gradient(180deg, transparent 55%, rgba(71, 85, 105, 0.15) 100%)',
        ].join(', '),
        mixBlendMode: 'multiply',
      };
    case 'highlands':
      return {
        background: [
          'linear-gradient(180deg, rgba(15, 23, 42, 0.4) 0%, transparent 48%, rgba(148, 163, 184, 0.2) 100%)',
          'radial-gradient(ellipse 70% 50% at 25% 22%, rgba(255, 255, 255, 0.22), transparent 50%)',
          'radial-gradient(ellipse 60% 45% at 82% 18%, rgba(226, 232, 240, 0.18), transparent 45%)',
        ].join(', '),
        mixBlendMode: 'soft-light',
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
