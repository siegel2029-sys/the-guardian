/** Visual evolution tier from patient exercise level (matches product copy). */
export type LevelTier = 'injured' | 'active' | 'recovered';

/** Level 1 = weak / new; 2–4 = solid active teal; 5+ = chrome / iridescent “recovered”. */
export function getLevelTier(level: number): LevelTier {
  const L = Math.max(1, Math.floor(level));
  if (L === 1) return 'injured';
  if (L <= 4) return 'active';
  return 'recovered';
}
