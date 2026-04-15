/**
 * Pure gamification math (XP, streak bridge, level-up) — see PROJECT_STATUS_REPORT §2.1.
 * State updates stay in PatientContext; calculations live here.
 */

import type { Patient } from '../types';
import { PATIENT_MAX_LEVEL, xpRequiredToReachNextLevel } from '../body/patientLevelXp';
import {
  PATIENT_REWARDS,
  exerciseBaseXp,
  getStreakXpMultiplier,
} from '../config/patientRewards';

/** Must match PatientContext / §2.1 — XP Booster passive multiplies after streak. */
export const XP_BOOSTER_MULT = 1.15 as const;

export type StreakAfterFirstDailyCompletionInput = {
  firstOfDay: boolean;
  currentStreak: number;
  lastSessionDate: string;
  clinicalDay: string;
  clinicalYesterday: string;
  clinicalTwoDaysAgo: string;
  streakShieldCharges: number;
};

export type StreakAfterFirstDailyCompletionResult = {
  nextStreak: number;
  consumeStreakShield: boolean;
};

/**
 * First exercise completion of the clinical day: streak continues, increments, resets, or uses Streak Shield.
 * When `firstOfDay` is false, returns `currentStreak` unchanged and no shield consumption.
 */
export function computeStreakAfterFirstDailyCompletion(
  input: StreakAfterFirstDailyCompletionInput
): StreakAfterFirstDailyCompletionResult {
  const {
    firstOfDay,
    currentStreak,
    lastSessionDate,
    clinicalDay,
    clinicalYesterday,
    clinicalTwoDaysAgo,
    streakShieldCharges,
  } = input;

  let nextStreak = currentStreak;
  let consumeStreakShield = false;

  if (firstOfDay) {
    const last = lastSessionDate;
    if (last === clinicalYesterday) {
      nextStreak = currentStreak + 1;
    } else if (last === clinicalDay) {
      nextStreak = currentStreak;
    } else if (last === clinicalTwoDaysAgo && streakShieldCharges > 0) {
      nextStreak = currentStreak + 1;
      consumeStreakShield = true;
    } else if (last !== clinicalDay) {
      nextStreak = 1;
    }
  }

  return { nextStreak, consumeStreakShield };
}

export type ExerciseCompletionXpInput = {
  planXpReward: number;
  /** Streak value used for multiplier (first-of-day result, else current streak). */
  streakForXpMultiplier: number;
  xpBoosterEquippedAndOwned: boolean;
};

export type ExerciseCompletionXpResult = {
  baseXp: number;
  streakMult: number;
  xpBeforeBoost: number;
  xpGain: number;
  streakBonusXp: number;
  coinsGain: number;
  rewardMessage: string | undefined;
};

/**
 * XP + coins for one `submitExerciseReport` grant (streak multiplier + optional XP booster).
 */
export function computeExerciseCompletionRewards(
  input: ExerciseCompletionXpInput
): ExerciseCompletionXpResult {
  const { planXpReward, streakForXpMultiplier, xpBoosterEquippedAndOwned } = input;

  const baseXp = exerciseBaseXp(planXpReward);
  const streakMult = getStreakXpMultiplier(streakForXpMultiplier);
  const xpBeforeBoost = Math.round(baseXp * streakMult);
  const xpGain = xpBoosterEquippedAndOwned
    ? Math.round(xpBeforeBoost * XP_BOOSTER_MULT)
    : xpBeforeBoost;
  const streakBonusXp = Math.max(0, xpBeforeBoost - baseXp);
  const coinsGain = PATIENT_REWARDS.EXERCISE_COMPLETE.coins;

  return {
    baseXp,
    streakMult,
    xpBeforeBoost,
    xpGain,
    streakBonusXp,
    coinsGain,
    rewardMessage:
      streakBonusXp > 0 ? `בונוס רצף ×${streakMult}` : undefined,
  };
}

/**
 * תרגילי שיקום לבחירה: מחצית מתגמול בסיס (XP + מטבעות), ואז אותם כללי רצף / XP booster כמו חובה.
 */
export function computeOptionalRehabExerciseRewards(
  input: ExerciseCompletionXpInput
): ExerciseCompletionXpResult {
  const { planXpReward, streakForXpMultiplier, xpBoosterEquippedAndOwned } = input;

  const fullBase = exerciseBaseXp(planXpReward);
  const baseXp = Math.max(1, Math.floor(fullBase / 2));
  const streakMult = getStreakXpMultiplier(streakForXpMultiplier);
  const xpBeforeBoost = Math.round(baseXp * streakMult);
  const xpGain = xpBoosterEquippedAndOwned
    ? Math.round(xpBeforeBoost * XP_BOOSTER_MULT)
    : xpBeforeBoost;
  const streakBonusXp = Math.max(0, xpBeforeBoost - baseXp);
  const coinsGain = Math.max(0, Math.floor(PATIENT_REWARDS.EXERCISE_COMPLETE.coins / 2));

  return {
    baseXp,
    streakMult,
    xpBeforeBoost,
    xpGain,
    streakBonusXp,
    coinsGain,
    rewardMessage:
      streakBonusXp > 0 ? `בונוס רצף ×${streakMult}` : undefined,
  };
}

/**
 * Apply XP and coin deltas, then resolve level-ups until below next threshold or max level.
 */
export function applyXpCoinsLevelUp(
  p: Patient,
  xpDelta: number,
  coinsDelta: number
): Patient {
  let { xp, level, xpForNextLevel, coins } = p;
  coins += coinsDelta;
  xp += xpDelta;
  while (xp >= xpForNextLevel && level < PATIENT_MAX_LEVEL) {
    xp -= xpForNextLevel;
    level += 1;
    xpForNextLevel = xpRequiredToReachNextLevel(level);
  }
  return {
    ...p,
    coins,
    xp,
    level: level as Patient['level'],
    xpForNextLevel,
  };
}
