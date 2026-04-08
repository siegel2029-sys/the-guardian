/**
 * אבולוציית נפח וחיטוב שריר לפי רמה — ללא כלי דם / עצבוב.
 * 1–3: התאוששות — גוף רזה, חומר רך ושקוף חלקית
 * 4–7: חיזוק — סיבי שריר ברורים (מפת נורמל), אטום
 * 8–10: כוח — נפח מוגבר + זוהר בריא מקצועי
 */
export type MuscleEvolutionStage = 'recovery' | 'strengthening' | 'strong';

export function getMuscleEvolutionStage(level: number): MuscleEvolutionStage {
  const L = Math.max(1, Math.floor(level));
  if (L <= 3) return 'recovery';
  if (L <= 7) return 'strengthening';
  return 'strong';
}

/** @deprecated Use getMuscleEvolutionStage */
export const getAnatomicalStage = getMuscleEvolutionStage;

/** @deprecated Use MuscleEvolutionStage */
export type AnatomicalStage = MuscleEvolutionStage;

/** שלב התאוששות — מראה "רזה / בסיסי" ללא סיבים בולטים */
export function muscleStageIsLeanBody(stage: MuscleEvolutionStage): boolean {
  return stage === 'recovery';
}

/** מפת סיבים מלאה (מוגדרת) — מרמה 4 ומעלה */
export function muscleStageUsesFiberNormalMap(stage: MuscleEvolutionStage): boolean {
  return stage !== 'recovery';
}

/** מכפיל עוצמה למפת הנורמל — חזק יותר בשלב "כוח" */
export function muscleStageNormalScaleMul(stage: MuscleEvolutionStage): number {
  if (stage === 'recovery') return 0;
  if (stage === 'strengthening') return 1;
  return 1.38;
}

/** תוספת קנה מידה לנפח שריר (על targetScale של המקטע) */
export function muscleStageVolumeBoost(stage: MuscleEvolutionStage): number {
  if (stage !== 'strong') return 0;
  return 0.055;
}

/** זוהר בריא עדין (emissive intensity) לשרירים פעילים בשלב כוח */
export function muscleStageHealthyGlowExtra(stage: MuscleEvolutionStage): number {
  return stage === 'strong' ? 0.14 : 0;
}

/** @deprecated */
export function anatomicalStageUsesMuscleTextures(stage: MuscleEvolutionStage): boolean {
  return muscleStageUsesFiberNormalMap(stage);
}

/** @deprecated — vascular layer removed */
export function anatomicalStageShowsVascular(_stage: MuscleEvolutionStage): boolean {
  return false;
}

/** @deprecated — neural layer removed */
export function anatomicalStageShowsNeural(_stage: MuscleEvolutionStage): boolean {
  return false;
}
