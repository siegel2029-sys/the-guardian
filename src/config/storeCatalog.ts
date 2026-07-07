/**
 * חנות 3D MVP — פריטי סצנה (על הרצפה ליד האווטאר), קטגוריות ומחירים.
 */

export type StoreCategory = 'training' | 'pets';

export type StoreItemId = 'therapy_ball' | 'dumbbell' | 'dog';

export type StorePreviewKind = 'sphere' | 'cylinder' | 'box';

export interface StoreCatalogEntry {
  id: StoreItemId;
  nameHe: string;
  descriptionHe: string;
  priceCoins: number;
  xpRequired: number;
  category: StoreCategory;
  preview: StorePreviewKind;
  accentColor: string;
}

export const STORE_CATEGORY_LABELS: Record<StoreCategory, string> = {
  training: 'ציוד אימון',
  pets: 'חיות מחמד',
};

export const STORE_CATALOG: StoreCatalogEntry[] = [
  {
    id: 'therapy_ball',
    nameHe: 'כדור פיזיו',
    descriptionHe: 'כדור אימון — מוצב על הרצפה משמאל לאווטאר.',
    priceCoins: 40,
    xpRequired: 0,
    category: 'training',
    preview: 'sphere',
    accentColor: '#ef4444',
  },
  {
    id: 'dumbbell',
    nameHe: 'משקולת',
    descriptionHe: 'משקולת קטנה — מוצבת על הרצפה מימין לאווטאר.',
    priceCoins: 55,
    xpRequired: 25,
    category: 'training',
    preview: 'cylinder',
    accentColor: '#94a3b8',
  },
  {
    id: 'dog',
    nameHe: 'כלב',
    descriptionHe: 'כלב מחמד — יושב ליד האווטאר על הרצפה.',
    priceCoins: 120,
    xpRequired: 80,
    category: 'pets',
    preview: 'box',
    accentColor: '#92400e',
  },
];

export const STORE_BY_ID: Record<StoreItemId, StoreCatalogEntry> = Object.fromEntries(
  STORE_CATALOG.map((e) => [e.id, e])
) as Record<StoreItemId, StoreCatalogEntry>;

export function isStoreItemId(s: string): s is StoreItemId {
  return s in STORE_BY_ID;
}

export function normalizeStoreItemIds(raw: unknown): StoreItemId[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is StoreItemId => typeof id === 'string' && isStoreItemId(id));
}

export type StorePurchaseResult =
  | 'ok'
  | 'insufficient'
  | 'insufficient_xp'
  | 'already_owned'
  | 'invalid';
