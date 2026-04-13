/**
 * Patient-portal avatar backdrop: environment "stage" follows rehab level; within a stage,
 * the exact scene rotates by clinical day-of-year (stable per day, refreshes on skip-day).
 */

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

export interface AvatarJourneyBackgroundDef {
  id: AvatarScenicBackgroundId;
  imageSrc?: string;
  cssBackground: string;
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

/** Levels 11–15 (and beyond) */
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

const CATALOG: Record<AvatarScenicBackgroundId, AvatarJourneyBackgroundDef> = {
  valley: {
    id: 'valley',
    cssBackground:
      'linear-gradient(180deg, #a7f3d0 0%, #6ee7b7 30%, #34d399 58%, #059669 100%)',
  },
  field: {
    id: 'field',
    cssBackground:
      'linear-gradient(180deg, #ecfccb 0%, #bef264 28%, #84cc16 62%, #4d7c0f 100%)',
  },
  roads: {
    id: 'roads',
    cssBackground:
      'linear-gradient(180deg, #e2e8f0 0%, #cbd5e1 40%, #78716c 78%, #44403c 100%)',
  },
  forest: {
    id: 'forest',
    cssBackground:
      'linear-gradient(180deg, #14532d 0%, #166534 25%, #22c55e 55%, #86efac 100%)',
  },
  hill: {
    id: 'hill',
    cssBackground:
      'linear-gradient(180deg, #bae6fd 0%, #86efac 42%, #65a30d 78%, #3f6212 100%)',
  },
  cities: {
    id: 'cities',
    cssBackground:
      'linear-gradient(180deg, #312e81 0%, #6366f1 35%, #818cf8 60%, #c7d2fe 100%)',
  },
  beach: {
    id: 'beach',
    cssBackground:
      'linear-gradient(180deg, #7dd3fc 0%, #bae6fd 35%, #fef3c7 68%, #fcd34d 88%, #f59e0b 100%)',
  },
  river: {
    id: 'river',
    cssBackground:
      'linear-gradient(180deg, #0c4a6e 0%, #0e7490 28%, #22d3ee 55%, #a5f3fc 100%)',
  },
  mountains: {
    id: 'mountains',
    cssBackground:
      'linear-gradient(180deg, #38bdf8 0%, #7dd3fc 25%, #a5b4fc 55%, #475569 85%, #1e293b 100%)',
  },
  cliff: {
    id: 'cliff',
    cssBackground:
      'linear-gradient(180deg, #fed7aa 0%, #ea580c 38%, #9a3412 72%, #431407 100%)',
  },
  clouds: {
    id: 'clouds',
    cssBackground:
      'linear-gradient(180deg, #e0e7ff 0%, #c7d2fe 35%, #fae8ff 70%, #ffffff 100%)',
  },
  snowy_peak: {
    id: 'snowy_peak',
    cssBackground:
      'linear-gradient(180deg, #1e3a8a 0%, #60a5fa 32%, #e0f2fe 68%, #f8fafc 100%)',
  },
};

export function getAvatarJourneyStageForLevel(level: number): AvatarJourneyStageId {
  const lv = Math.max(1, Math.floor(level));
  if (lv <= 5) return 'lowlands';
  if (lv <= 10) return 'ascending';
  return 'highlands';
}

export interface AvatarScenicBackdropSnapshot {
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
  const stage = getAvatarJourneyStageForLevel(level);
  const list = AVATAR_JOURNEY_STAGES[stage];
  const dayOfYear = getLocalDayOfYearForYmd(clinicalYmd);
  const idx =
    list.length === 0 ? 0 : ((dayOfYear % list.length) + list.length) % list.length;
  const id = list[idx] ?? list[0];
  const def = CATALOG[id];
  return { stage, def, dayOfYear };
}
