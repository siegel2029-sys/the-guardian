/**
 * רמות מטופל 1–100 + עקומת XP (שאיפה ל־100 כהישג ארוך טווח).
 */

import type { Patient } from '../types';

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

/** סכום XP מצטבר מהתחלה עד לפני רמת המטופל הנוכחית + XP בתוך הרמה */
export function lifetimeXpFromProgress(level: number, xpIntoLevel: number): number {
  const L = clampPatientLevel(level);
  let sum = 0;
  for (let k = 1; k < L; k++) {
    sum += xpRequiredToReachNextLevel(k);
  }
  return sum + Math.max(0, Math.floor(xpIntoLevel));
}

/** ממפה סכום XP מצטבר לרמה + XP בשורת ההתקדמות (כולל עליות רמה מרובות) */
export function progressFromLifetimeXp(totalLifetime: number): {
  level: number;
  xp: number;
  xpForNextLevel: number;
} {
  const t = Math.max(0, Math.floor(totalLifetime));
  let L = 1;
  let rem = t;
  while (L < PATIENT_MAX_LEVEL) {
    const need = xpRequiredToReachNextLevel(L);
    if (rem < need) {
      return { level: L, xp: rem, xpForNextLevel: need };
    }
    rem -= need;
    L++;
  }
  return {
    level: PATIENT_MAX_LEVEL,
    xp: rem,
    xpForNextLevel: xpRequiredToReachNextLevel(PATIENT_MAX_LEVEL - 1),
  };
}

/** עדכון מטופל לפי XP מצטבר (לדיבוג ±XP / slider) */
export function patientWithLifetimeXp(p: Patient, lifetimeXp: number): Patient {
  const { level, xp, xpForNextLevel } = progressFromLifetimeXp(lifetimeXp);
  return {
    ...p,
    level: level as Patient['level'],
    xp,
    xpForNextLevel,
  };
}

export function lifetimeXpFromPatient(p: Patient): number {
  return lifetimeXpFromProgress(p.level, p.xp);
}
