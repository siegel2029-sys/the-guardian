/**
 * אבולוציית נפח שריר לפי רמה 1–100 (ללא כלי דם / עצבוב).
 * 1–20:   אחרי פציעה — רזה, שקוף חלקית
 * 21–50:  שיקום פעיל — נפח קטן, אטום
 * 51–80:  חיזוק — סיבים (מפת נורמל), נפח בינוני
 * 81–100: כוח / התאוששות מלאה — נפח גדול + דופק זוהר עדין
 */
import * as THREE from 'three';

export type MuscleEvolutionStage = 'post_injury' | 'active_rehab' | 'strengthening' | 'power';

export function getMuscleEvolutionStage(level: number): MuscleEvolutionStage {
  const L = Math.max(1, Math.min(100, Math.floor(level)));
  if (L <= 20) return 'post_injury';
  if (L <= 50) return 'active_rehab';
  if (L <= 80) return 'strengthening';
  return 'power';
}

/** @deprecated */
export const getAnatomicalStage = getMuscleEvolutionStage;

/** @deprecated */
export type AnatomicalStage = MuscleEvolutionStage;

export function muscleStageIsLeanBody(stage: MuscleEvolutionStage): boolean {
  return stage === 'post_injury';
}

/** מפת סיבים — מרמה 51 */
export function muscleStageUsesFiberNormalMap(stage: MuscleEvolutionStage): boolean {
  return stage === 'strengthening' || stage === 'power';
}

export function muscleStageNormalScaleMul(stage: MuscleEvolutionStage): number {
  if (stage === 'post_injury' || stage === 'active_rehab') return 0;
  if (stage === 'strengthening') return 1;
  return 1.42;
}

export function muscleStageVolumeBoost(stage: MuscleEvolutionStage): number {
  if (stage !== 'power') return 0;
  return 0.038;
}

export function muscleStageHealthyGlowExtra(stage: MuscleEvolutionStage): number {
  return stage === 'power' ? 0.12 : 0;
}

/**
 * נפח קדקודים לאורך נורמל (יחידות מקומיות של המודל) — כולל דופק 81–100.
 */
export function getMuscleVertexInflation(level: number, elapsedSeconds: number): number {
  const L = Math.max(1, Math.min(100, Math.floor(level)));
  let base: number;
  if (L <= 20) base = 0;
  else if (L <= 50) {
    const t = (L - 20) / 30;
    base = THREE.MathUtils.lerp(0.009, 0.024, t);
  } else if (L <= 80) {
    const t = (L - 50) / 30;
    base = THREE.MathUtils.lerp(0.024, 0.052, t);
  } else {
    const t = (L - 80) / 20;
    base = THREE.MathUtils.lerp(0.052, 0.086, t);
  }
  if (L >= 81) {
    base *= 1 + 0.048 * Math.sin(elapsedSeconds * 2.35);
  }
  return base;
}

/** @deprecated */
export function anatomicalStageUsesMuscleTextures(stage: MuscleEvolutionStage): boolean {
  return muscleStageUsesFiberNormalMap(stage);
}

/** @deprecated */
export function anatomicalStageShowsVascular(_stage: MuscleEvolutionStage): boolean {
  return false;
}

/** @deprecated */
export function anatomicalStageShowsNeural(_stage: MuscleEvolutionStage): boolean {
  return false;
}
