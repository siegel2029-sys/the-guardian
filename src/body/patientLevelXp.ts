/**
 * רמות מטופל 1–100 + עקומת XP (שאיפה ל־100 כהישג ארוך טווח).
 */

export const PATIENT_MAX_LEVEL = 100;

/** XP נדרש כדי לעבור מ־currentLevel ל־currentLevel+1 (currentLevel בין 1 ל־99). */
export function xpRequiredToReachNextLevel(currentLevel: number): number {
  const L = Math.max(1, Math.floor(currentLevel));
  if (L >= PATIENT_MAX_LEVEL) return 999_999_999;
  const raw = Math.floor(440 * Math.pow(1.041, L - 1));
  return Math.min(26_000, Math.max(280, raw));
}

export function clampPatientLevel(level: number): number {
  return Math.min(PATIENT_MAX_LEVEL, Math.max(1, Math.round(level)));
}

/**
 * לאחר טעינה מ־localStorage — רמה 1–100 וסף XP לשלב הבא לפי העקומה הנוכחית.
 * ה־XP המצטבר נשמר; רק הסף לעליה מתעדכן (מיגרציה מרמות 1–10 / עקומה ישנה).
 */
export function normalizePatientProgressFields<T extends { level: number; xp: number; xpForNextLevel: number }>(
  p: T
): T {
  const level = clampPatientLevel(p.level);
  const xpForNextLevel =
    level >= PATIENT_MAX_LEVEL
      ? xpRequiredToReachNextLevel(PATIENT_MAX_LEVEL - 1)
      : xpRequiredToReachNextLevel(level);
  return {
    ...p,
    level,
    xp: Math.max(0, p.xp),
    xpForNextLevel,
  };
}
