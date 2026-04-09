/**
 * גיבורים בדיוניים להיכל ההשראה — פורטל מטופל בלבד (ללא השוואה למשתמש).
 */
import type { EquippedGearSnapshot } from '../config/gearCatalog';
import type { BodyArea } from '../types';

export interface FictionalHeroProfile {
  id: string;
  nameHe: string;
  level: number;
  quoteHe: string;
  activeAreas: BodyArea[];
  primaryArea?: BodyArea;
  clinicalArea?: BodyArea;
  equippedGear: EquippedGearSnapshot;
  /** נפח שריר יחסי לפי מקטע (מודל 3D) */
  segmentGrowthMul: Partial<Record<BodyArea, number>>;
  streak: number;
}

const limbHeavy: Partial<Record<BodyArea, number>> = {
  upper_arm_left: 1.18,
  upper_arm_right: 1.18,
  forearm_left: 1.12,
  forearm_right: 1.12,
  thigh_left: 1.22,
  thigh_right: 1.22,
  shin_left: 1.15,
  shin_right: 1.15,
  chest: 1.08,
  abdomen: 1.05,
};

const torsoFocus: Partial<Record<BodyArea, number>> = {
  chest: 1.2,
  abdomen: 1.12,
  back_upper: 1.14,
  back_lower: 1.1,
  shoulder_left: 1.08,
  shoulder_right: 1.08,
};

export const FICTIONAL_HEROES_HALL: FictionalHeroProfile[] = [
  {
    id: 'hero-iron',
    nameHe: 'אלוף הברזל',
    level: 100,
    quoteHe: 'כל חזרה בונה אותך מחדש — עד שהברזל נשמע כמו מוזיקה.',
    activeAreas: ['chest', 'upper_arm_left', 'upper_arm_right', 'thigh_left', 'thigh_right'],
    primaryArea: 'chest',
    clinicalArea: 'chest',
    equippedGear: {
      skin: 'gold_skin',
      aura: 'aura_teal',
      hands: 'training_weights',
      torso: null,
      chest: 'emblem_clinical',
      feet: 'trail_sparks',
      cape: 'clinical_cape',
    },
    segmentGrowthMul: { ...limbHeavy, chest: 1.25 },
    streak: 21,
  },
  {
    id: 'hero-light',
    nameHe: 'לוחמת האור',
    level: 90,
    quoteHe: 'ההתמדה שלך מאירה את הדרך — גם בימים שבהם הכל כבד.',
    activeAreas: ['shoulder_left', 'shoulder_right', 'back_upper', 'thigh_left', 'shin_left'],
    primaryArea: 'shoulder_left',
    clinicalArea: 'shoulder_left',
    equippedGear: {
      skin: 'gold_skin',
      aura: 'neon_aura',
      hands: null,
      torso: 'protective_shield',
      chest: 'emblem_clinical',
      feet: null,
      cape: 'clinical_cape',
    },
    segmentGrowthMul: { ...torsoFocus, thigh_left: 1.2, shin_left: 1.18 },
    streak: 14,
  },
  {
    id: 'hero-rehab-master',
    nameHe: 'מאסטר השיקום',
    level: 75,
    quoteHe: 'שיקום אמיתי הוא אומנות — צעד אחר צעד, בלי להתבייש לנוח.',
    activeAreas: ['knee_left', 'hip_left', 'thigh_left', 'shin_left', 'ankle_left'],
    primaryArea: 'knee_left',
    clinicalArea: 'knee_left',
    equippedGear: {
      skin: null,
      aura: 'aura_crimson',
      hands: null,
      torso: 'protective_shield',
      chest: 'emblem_clinical',
      feet: 'trail_sparks',
      cape: 'clinical_cape',
    },
    segmentGrowthMul: {
      thigh_left: 1.2,
      shin_left: 1.22,
      knee_left: 1.05,
      hip_left: 1.08,
    },
    streak: 30,
  },
  {
    id: 'hero-cyber',
    nameHe: 'צייד הסייבר־שיקום',
    level: 85,
    quoteHe: 'גוף ומוח באותה רשת — כל תנועה מחושבת, כל נשימה מדויקת.',
    activeAreas: ['forearm_right', 'wrist_right', 'neck', 'abdomen'],
    primaryArea: 'forearm_right',
    clinicalArea: 'forearm_right',
    equippedGear: {
      skin: null,
      aura: 'neon_aura',
      hands: 'training_weights',
      torso: null,
      chest: 'emblem_clinical',
      feet: null,
      cape: null,
    },
    segmentGrowthMul: {
      forearm_left: 1.1,
      forearm_right: 1.24,
      upper_arm_right: 1.12,
      neck: 1.06,
      abdomen: 1.1,
    },
    streak: 9,
  },
  {
    id: 'hero-marathon',
    nameHe: 'רוח המסלול',
    level: 65,
    quoteHe: 'לא צריך להגיע ראשון — רק לא לוותר על הקו.',
    activeAreas: ['thigh_right', 'shin_right', 'hip_right', 'abdomen'],
    primaryArea: 'thigh_right',
    clinicalArea: 'thigh_right',
    equippedGear: {
      skin: null,
      aura: 'aura_teal',
      hands: null,
      torso: null,
      chest: null,
      feet: 'trail_sparks',
      cape: null,
    },
    segmentGrowthMul: {
      thigh_right: 1.28,
      shin_right: 1.2,
      hip_right: 1.1,
    },
    streak: 40,
  },
  {
    id: 'hero-sage',
    nameHe: 'חכמת העמק',
    level: 50,
    quoteHe: 'עוצמה שקטה מנצחת רעש — תן לגוף ללמוד בקצב שלו.',
    activeAreas: ['back_lower', 'back_upper', 'abdomen'],
    primaryArea: 'back_lower',
    clinicalArea: 'back_lower',
    equippedGear: {
      skin: null,
      aura: 'aura_teal',
      hands: null,
      torso: 'protective_shield',
      chest: null,
      feet: null,
      cape: 'clinical_cape',
    },
    segmentGrowthMul: { ...torsoFocus, back_lower: 1.22 },
    streak: 12,
  },
  {
    id: 'hero-apex',
    nameHe: 'שיא הפסגה',
    level: 95,
    quoteHe: 'כשמגיעים לפסגה — מגלים שיש עוד הר — וזה בסדר גמור.',
    activeAreas: [
      'chest',
      'abdomen',
      'upper_arm_left',
      'forearm_left',
      'thigh_left',
      'shin_left',
    ],
    primaryArea: 'chest',
    clinicalArea: 'chest',
    equippedGear: {
      skin: 'gold_skin',
      aura: 'aura_crimson',
      hands: 'training_weights',
      torso: 'protective_shield',
      chest: 'emblem_clinical',
      feet: 'trail_sparks',
      cape: 'clinical_cape',
    },
    segmentGrowthMul: limbHeavy,
    streak: 18,
  },
];
