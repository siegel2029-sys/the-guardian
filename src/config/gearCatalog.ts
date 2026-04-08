/**
 * חנות ציוד — קטלוג, מחירים, דרישות XP, מיפוי אנטומי ותצוגה מקדימה.
 */

export type GearTier = 'low' | 'functional' | 'elite';

export type GearTargetAttachment =
  | 'global_aura'
  | 'global_skin'
  | 'chest'
  | 'feet_floor'
  | 'wrist_dual'
  | 'forearm_float'
  | 'shoulders_back'
  | 'none';

export type GearPreviewKind =
  | 'aura_sphere'
  | 'aura_wire'
  | 'mesh_emblem'
  | 'mesh_trail'
  | 'mesh_weights'
  | 'mesh_shield'
  | 'mesh_cape'
  | 'mesh_booster'
  | 'none';

/** סלוטי ענידה ב־localStorage */
export type GearEquipSlot =
  | 'skin'
  | 'aura'
  | 'hands'
  | 'torso'
  | 'chest'
  | 'feet'
  | 'cape'
  | 'functional_passive'
  | 'none';

export type GearItemId =
  | 'aura_crimson'
  | 'aura_teal'
  | 'emblem_clinical'
  | 'trail_sparks'
  | 'xp_booster'
  | 'streak_shield'
  | 'gold_skin'
  | 'training_weights'
  | 'protective_shield'
  | 'clinical_cape'
  | 'neon_aura';

export type GearKind = 'visual' | 'functional';

export interface GearCatalogEntry {
  id: GearItemId;
  nameHe: string;
  descriptionHe: string;
  priceCoins: number;
  /** מינימום XP נוכחי של המטופל לרכישה */
  xpRequired: number;
  tier: GearTier;
  kind: GearKind;
  equipSlot: GearEquipSlot;
  targetAttachment: GearTargetAttachment;
  preview: GearPreviewKind;
  /** צבע דגש לתצוגה מקדימה / הילה */
  accentColor?: string;
}

export const GEAR_CATALOG: GearCatalogEntry[] = [
  {
    id: 'aura_crimson',
    nameHe: 'גוון הילה — אש',
    descriptionHe: 'הילה גלובלית אדומה־עדינה סביב הגוף.',
    priceCoins: 55,
    xpRequired: 0,
    tier: 'low',
    kind: 'visual',
    equipSlot: 'aura',
    targetAttachment: 'global_aura',
    preview: 'aura_sphere',
    accentColor: '#ef4444',
  },
  {
    id: 'aura_teal',
    nameHe: 'גוון הילה — טיל',
    descriptionHe: 'הילה גלובלית טורקיז בריאה.',
    priceCoins: 70,
    xpRequired: 50,
    tier: 'low',
    kind: 'visual',
    equipSlot: 'aura',
    targetAttachment: 'global_aura',
    preview: 'aura_sphere',
    accentColor: '#2dd4bf',
  },
  {
    id: 'emblem_clinical',
    nameHe: 'אמבלם קליני',
    descriptionHe: 'סמל מקצועי על החזה (אזור פיגורלי).',
    priceCoins: 85,
    xpRequired: 80,
    tier: 'low',
    kind: 'visual',
    equipSlot: 'chest',
    targetAttachment: 'chest',
    preview: 'mesh_emblem',
    accentColor: '#38bdf8',
  },
  {
    id: 'trail_sparks',
    nameHe: 'שובל חלקיקים',
    descriptionHe: 'ניצוצות ליד כפות הרגליים — משוב לתנועה.',
    priceCoins: 95,
    xpRequired: 100,
    tier: 'low',
    kind: 'visual',
    equipSlot: 'feet',
    targetAttachment: 'feet_floor',
    preview: 'mesh_trail',
    accentColor: '#fbbf24',
  },
  {
    id: 'xp_booster',
    nameHe: 'מגבר XP',
    descriptionHe: 'מעניק +15% XP לכל דיווח תרגיל (ענידה פסיבית).',
    priceCoins: 100,
    xpRequired: 150,
    tier: 'functional',
    kind: 'functional',
    equipSlot: 'functional_passive',
    targetAttachment: 'none',
    preview: 'mesh_booster',
    accentColor: '#a78bfa',
  },
  {
    id: 'streak_shield',
    nameHe: 'מגן רצף',
    descriptionHe: 'מגן על רצף פעילות ביום קליני אחד שפוספס.',
    priceCoins: 180,
    xpRequired: 0,
    tier: 'functional',
    kind: 'functional',
    equipSlot: 'none',
    targetAttachment: 'none',
    preview: 'none',
    accentColor: '#f59e0b',
  },
  {
    id: 'gold_skin',
    nameHe: 'עור זהב',
    descriptionHe: 'מראה אליטי — גוון זהב על כל מבנה הבסיס.',
    priceCoins: 500,
    xpRequired: 400,
    tier: 'elite',
    kind: 'visual',
    equipSlot: 'skin',
    targetAttachment: 'global_skin',
    preview: 'aura_sphere',
    accentColor: '#eab308',
  },
  {
    id: 'training_weights',
    nameHe: 'משקולות אימון',
    descriptionHe: 'משקולות מחוברות לשורש כף היד (שתי הידיים).',
    priceCoins: 320,
    xpRequired: 250,
    tier: 'elite',
    kind: 'visual',
    equipSlot: 'hands',
    targetAttachment: 'wrist_dual',
    preview: 'mesh_weights',
    accentColor: '#64748b',
  },
  {
    id: 'protective_shield',
    nameHe: 'מגן מגן צף',
    descriptionHe: 'מגן שקוף לפני הטורסו — צף מול הגוף.',
    priceCoins: 380,
    xpRequired: 300,
    tier: 'elite',
    kind: 'visual',
    equipSlot: 'torso',
    targetAttachment: 'forearm_float',
    preview: 'mesh_shield',
    accentColor: '#38bdf8',
  },
  {
    id: 'clinical_cape',
    nameHe: 'גקליניקה',
    descriptionHe: 'גלימה קלינית על הכתפיים והגב.',
    priceCoins: 450,
    xpRequired: 350,
    tier: 'elite',
    kind: 'visual',
    equipSlot: 'cape',
    targetAttachment: 'shoulders_back',
    preview: 'mesh_cape',
    accentColor: '#0ea5e9',
  },
  {
    id: 'neon_aura',
    nameHe: 'הילה ניאון (קלאסי)',
    descriptionHe: 'רשת חוטים זוהרת — סגנון Legacy.',
    priceCoins: 300,
    xpRequired: 200,
    tier: 'elite',
    kind: 'visual',
    equipSlot: 'aura',
    targetAttachment: 'global_aura',
    preview: 'aura_wire',
    accentColor: '#22d3ee',
  },
];

export const GEAR_BY_ID: Record<GearItemId, GearCatalogEntry> = Object.fromEntries(
  GEAR_CATALOG.map((e) => [e.id, e])
) as Record<GearItemId, GearCatalogEntry>;

export function isGearItemId(s: string): s is GearItemId {
  return s in GEAR_BY_ID;
}

/** תמונת ציוד מעוגן לאווטאר (מ־PatientGearState) */
export type EquippedGearSnapshot = {
  skin: string | null;
  aura: string | null;
  hands: string | null;
  torso: string | null;
  chest: string | null;
  feet: string | null;
  cape: string | null;
};

/** ברירת מחדל לדשבורד מטפל / ללא ציוד */
export const EMPTY_EQUIPPED_GEAR: EquippedGearSnapshot = {
  skin: null,
  aura: null,
  hands: null,
  torso: null,
  chest: null,
  feet: null,
  cape: null,
};
