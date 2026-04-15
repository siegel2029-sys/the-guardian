/**
 * Central reward definitions for patient engagement (XP, coins, streak multipliers).
 * Used by PatientContext — persist patient totals via existing patient state.
 */

export const PATIENT_REWARDS = {
  /** Standard grant when an exercise report is submitted */
  EXERCISE_COMPLETE: { xp: 50, coins: 10 } as const,
  /** Did You Know / clinical article — first read only per article id */
  ARTICLE_READ: { xp: 20, coins: 5 } as const,
  /** First portal visit of the clinical day */
  FIRST_LOGIN_OF_DAY: { xp: 10, coins: 0 } as const,
} as const;

/** XP multiplier from current streak length (after applying today’s first-completion update where relevant). */
export function getStreakXpMultiplier(currentStreak: number): number {
  if (currentStreak >= 5) return 1.5;
  if (currentStreak >= 3) return 1.2;
  return 1;
}

/** Effective exercise base XP: at least the configured minimum, or plan reward if higher. */
export function exerciseBaseXp(planXpReward: number): number {
  return Math.max(planXpReward, PATIENT_REWARDS.EXERCISE_COMPLETE.xp);
}

/** תרגילי שיקום לבחירה: מחצית XP בסיס ומחצית מטבעות (לפני מכפיל רצף / XP booster). */
export function optionalRehabHalfBaseXp(planXpReward: number): number {
  return Math.max(1, Math.floor(exerciseBaseXp(planXpReward) / 2));
}

export function optionalRehabHalfCoins(): number {
  return Math.max(0, Math.floor(PATIENT_REWARDS.EXERCISE_COMPLETE.coins / 2));
}

/** תצוגת כרטיס: מחצית מערך XP שמוצג (למשל אחרי exerciseBaseXp). */
export function halfDisplayXp(baseXp: number): number {
  return Math.max(1, Math.floor(baseXp / 2));
}

export function halfDisplayCoins(coins: number): number {
  return Math.max(0, Math.floor(coins / 2));
}

/** קל → קשה: מוסיף מעט ל־XP/מטבעות על בסיס חצי (תרגילי בחירה) */
export const OPTIONAL_DIFFICULTY_TIER_MULT = [1, 1.08, 1.15] as const;

export function applyOptionalTierToHalfXp(baseHalfXp: number, tier: 0 | 1 | 2): number {
  const m = OPTIONAL_DIFFICULTY_TIER_MULT[tier];
  return Math.max(1, Math.floor(baseHalfXp * m));
}

export function applyOptionalTierToHalfCoins(baseHalfCoins: number, tier: 0 | 1 | 2): number {
  const m = OPTIONAL_DIFFICULTY_TIER_MULT[tier];
  return Math.max(0, Math.floor(baseHalfCoins * m));
}
