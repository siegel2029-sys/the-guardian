/** Visual evolution tier from patient exercise level (matches product copy). */
export type LevelTier = 'injured' | 'active' | 'recovered';

/** 1–20 פוסט־פציעה; 21–50 שיקום פעיל; 51+ “התאוששות” ויזואלית מלאה. */
export function getLevelTier(level: number): LevelTier {
  const L = Math.max(1, Math.floor(level));
  if (L <= 20) return 'injured';
  if (L <= 50) return 'active';
  return 'recovered';
}
