/** Visual evolution tier from patient exercise level (1–10+). */
export type LevelTier = 'ghost' | 'matte' | 'chrome';

export function getLevelTier(level: number): LevelTier {
  const L = Math.max(1, Math.floor(level));
  if (L <= 3) return 'ghost';
  if (L <= 7) return 'matte';
  return 'chrome';
}
