/** פריטי חנות ציוד — גרסה ראשונה */

export type GearItemId =
  | 'gold_skin'
  | 'neon_aura'
  | 'training_weights'
  | 'protective_shield'
  | 'streak_shield';

export type GearKind = 'visual' | 'functional';

export interface GearCatalogEntry {
  id: GearItemId;
  nameHe: string;
  descriptionHe: string;
  priceCoins: number;
  kind: GearKind;
  /** לציוד ויזואלי — אפשר לענוד יחד לפי סלוט */
  equipSlot: 'skin' | 'aura' | 'hands' | 'torso' | 'none';
}

export const GEAR_CATALOG: GearCatalogEntry[] = [
  {
    id: 'gold_skin',
    nameHe: 'עור זהב',
    descriptionHe: 'גוון זהוב יוקרתי לדמות האווטאר.',
    priceCoins: 500,
    kind: 'visual',
    equipSlot: 'skin',
  },
  {
    id: 'neon_aura',
    nameHe: 'הילה ניאון',
    descriptionHe: 'אור ציאן-סגול סביב הגוף.',
    priceCoins: 300,
    kind: 'visual',
    equipSlot: 'aura',
  },
  {
    id: 'training_weights',
    nameHe: 'משקולות אימון',
    descriptionHe: 'משקולות קטנות על כפות הידיים בתלת־ממד.',
    priceCoins: 350,
    kind: 'visual',
    equipSlot: 'hands',
  },
  {
    id: 'protective_shield',
    nameHe: 'מגן מגן',
    descriptionHe: 'מגן שקוף לפני הטורסו — מראה הגנתי.',
    priceCoins: 400,
    kind: 'visual',
    equipSlot: 'torso',
  },
  {
    id: 'streak_shield',
    nameHe: 'מגן רצף',
    descriptionHe: 'מגן על הרצף ביום קליני אחד שפוספס (צורך שימוש אחד לכל קנייה).',
    priceCoins: 200,
    kind: 'functional',
    equipSlot: 'none',
  },
];

export const GEAR_BY_ID: Record<GearItemId, GearCatalogEntry> = Object.fromEntries(
  GEAR_CATALOG.map((e) => [e.id, e])
) as Record<GearItemId, GearCatalogEntry>;

export function isGearItemId(s: string): s is GearItemId {
  return s in GEAR_BY_ID;
}
