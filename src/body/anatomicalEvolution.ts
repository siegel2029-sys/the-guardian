/**
 * אבולוציה ויזואלית אנטומית לפי רמת מטופל (נפרדת מ־getLevelTier הישן).
 * 1–2: שלד / מבנה בסיסי
 * 3–5: מרקם שריר עם מפות נורמל
 * 6–8: רשת כלי דם עדינה
 * 9–10: שכבת עצבוב / זוהר עדין
 */
export type AnatomicalStage = 'skeletal' | 'muscular' | 'vascular' | 'neural';

export function getAnatomicalStage(level: number): AnatomicalStage {
  const L = Math.max(1, Math.floor(level));
  if (L <= 2) return 'skeletal';
  if (L <= 5) return 'muscular';
  if (L <= 8) return 'vascular';
  return 'neural';
}

export function anatomicalStageUsesMuscleTextures(stage: AnatomicalStage): boolean {
  return stage !== 'skeletal';
}

export function anatomicalStageShowsVascular(stage: AnatomicalStage): boolean {
  return stage === 'vascular' || stage === 'neural';
}

export function anatomicalStageShowsNeural(stage: AnatomicalStage): boolean {
  return stage === 'neural';
}
