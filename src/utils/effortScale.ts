/**
 * Patient-reported effort / RPE scale helpers.
 *
 * Canonical scale is 1–10. Legacy records stored on 1–5 are normalized ×2 for display.
 */

export type EffortLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
export type EffortScaleVersion = 5 | 10;

export const EFFORT_SCALE_MAX = 10;
export const LEGACY_EFFORT_SCALE_MAX = 5;

/** Clinical red-flag threshold on the 1–10 scale (was 4 on the legacy 1–5 scale). */
export const SAFETY_EFFORT_THRESHOLD = 8;

/** Max-effort alert on the 1–10 scale (was 5 on the legacy 1–5 scale). */
export const MAX_EFFORT_ALERT_THRESHOLD = 10;

/** Capacity-building nuance: low pain + high effort is a positive milestone. */
export const CAPACITY_PAIN_MAX = 3;
export const CAPACITY_EFFORT_MIN = 7;

export const CLINICAL_PROGRESS_PAIN_WEIGHT = 0.7;
export const CLINICAL_PROGRESS_EFFORT_WEIGHT = 0.3;

export function clampEffort(n: number): EffortLevel {
  const r = Math.round(Math.min(EFFORT_SCALE_MAX, Math.max(1, n)));
  return r as EffortLevel;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function clamp0to10(n: number): number {
  return Math.max(0, Math.min(10, n));
}

/**
 * Normalize a stored effort value onto the 1–10 display/chart scale.
 *
 * - `effortScale === 10` or raw `> 5` → already on 1–10, pass through (clamped).
 * - Legacy 1–5 (`effortScale === 5` or missing scale with value ≤ 5) → ×2.
 */
export function effortToScale10(
  raw: number,
  effortScale?: EffortScaleVersion | null
): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return 5;

  if (effortScale === 10 || n > LEGACY_EFFORT_SCALE_MAX) {
    return clampEffort(n);
  }

  // Legacy 1–5 (explicit or inferred when value ≤ 5 and no v10 flag)
  return clampEffort(n * 2);
}

/**
 * Clinically-weighted daily progress score on 0–10 (higher = better progress).
 *
 * Formula:
 *   painScore   = 10 − pain          (lower pain → higher score)
 *   effortScore = 10 − effort        (default: high effort treated as load stress)
 *   IF pain ≤ 3 AND effort ≥ 7:      (capacity-building nuance)
 *     effortScore = effort           (high effort + low pain is POSITIVE)
 *
 *   progress = 0.7 × painScore + 0.3 × effortScore
 *
 * When only one signal is present, that component is used at 100%.
 */
export function clinicalDailyProgressScore(
  pain: number | null,
  effort: number | null
): number | null {
  if (pain == null && effort == null) return null;

  const painScore = pain != null ? 10 - clamp0to10(pain) : null;

  let effortScore: number | null = null;
  if (effort != null) {
    const e = clamp0to10(effort);
    const p = pain != null ? clamp0to10(pain) : null;
    const capacityBuilding =
      p != null && p <= CAPACITY_PAIN_MAX && e >= CAPACITY_EFFORT_MIN;
    effortScore = capacityBuilding ? e : 10 - e;
  }

  if (painScore != null && effortScore != null) {
    return round1(
      CLINICAL_PROGRESS_PAIN_WEIGHT * painScore +
        CLINICAL_PROGRESS_EFFORT_WEIGHT * effortScore
    );
  }
  if (painScore != null) return round1(painScore);
  return round1(effortScore!);
}
