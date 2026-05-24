import type { BodyArea } from '../types';

export type LateralSide = 'right' | 'left';

export interface LateralSideLabels {
  right: string;
  left: string;
}

const BILATERAL_SIMULTANEOUS =
  /שתי\s+(ברכ|רגל|יד)|משני\s+הצדד|שני\s+הצדד|ישיבת\s+קיר|פלאנק\s+(מלא|על\s+ברכ)|bird[\s-]?dog|סופרמן|superman/i;

const UNILATERAL_STAND_ONE_LEG = /עמידה\s+על\s+רגל\s+אחת/i;

const UNILATERAL_NAME = /יחיד(ה|ת)|single/i;

const ONE_LIMB_PATTERN = /(?:רגל|יד|קרסול|ברך|ירך|כף\s+רגל)\s+אח(?:ת|ד)|רגל\s+אחת|יד\s+אחת/i;

const SWITCH_SIDES_PATTERN = /החליפ|בכל\s+פעם|הצד\s+ה(?:שני|שניה)|(?:ימין|שמאל)\s+וא(?:חר\s+כך|ז)?\s*(?:שמאל|ימין)/i;

const LEG_AREA_PREFIXES = ['knee', 'hip', 'thigh', 'shin', 'ankle', 'foot'] as const;
const ARM_AREA_PREFIXES = ['shoulder', 'upper_arm', 'elbow', 'forearm', 'wrist', 'hand'] as const;

export function getLateralSideLabels(
  targetArea?: BodyArea,
  muscleGroup?: string
): LateralSideLabels {
  if (targetArea) {
    if (LEG_AREA_PREFIXES.some((prefix) => targetArea.startsWith(prefix))) {
      return { right: 'רגל ימין', left: 'רגל שמאל' };
    }
    if (ARM_AREA_PREFIXES.some((prefix) => targetArea.startsWith(prefix))) {
      return { right: 'יד ימין', left: 'יד שמאל' };
    }
  }

  const group = (muscleGroup ?? '').trim();
  if (/ברך|ירך|קרסול|שוק|רגל|כף\s+רגל/i.test(group)) {
    return { right: 'רגל ימין', left: 'רגל שמאל' };
  }
  if (/כתף|זרוע|יד|מרפק|אמה/i.test(group)) {
    return { right: 'יד ימין', left: 'יד שמאל' };
  }

  return { right: 'צד ימין', left: 'צד שמאל' };
}

/** תרגילים שדורשים סימון סטים בנפרד לכל צד (למשל «ברך יחידה לחזה»). */
export function requiresExerciseLateralization(input: {
  name: string;
  instructions?: string | null;
}): boolean {
  const name = (input.name ?? '').trim();
  const instructions = (input.instructions ?? '').trim();
  const combined = `${name}\n${instructions}`;

  if (!name) return false;
  if (UNILATERAL_STAND_ONE_LEG.test(combined)) return false;
  if (BILATERAL_SIMULTANEOUS.test(combined)) return false;

  if (UNILATERAL_NAME.test(name)) return true;
  if (ONE_LIMB_PATTERN.test(combined) && SWITCH_SIDES_PATTERN.test(combined)) return true;
  if (ONE_LIMB_PATTERN.test(combined) && /הברך\s+השני|הרגל\s+ה(?:שני|שניה)|היד\s+ה(?:שני|שניה)/i.test(combined)) {
    return true;
  }

  return false;
}
