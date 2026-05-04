import type { BodyArea, ManualClinicalSegmentLockOverride } from '../types';
import { bodyAreaLabels } from '../types';

/**
 * Granular picks from Mixamo-style bones (Soldier.glb).
 * Each key toggles independently; exercises aggregate by mapped BodyArea.
 *
 * במודל ה־3D (`AnatomyModel`): מפרקים (כתף/ירך/מרפק/ברך/פרק כף/קרסול) ושכבות דקורטיביות
 * (שוק אחורי/כף רגל/ראש וכו׳) לא חוסמים raycast — לחיצה על גוף הגפ נופלת על הגליל
 * (זרוע עליונה/אמה/ירך/שוק) בנפרד ממפרקים.
 */
export type GranularPickKey =
  | 'cranium'
  | 'neck'
  | 'l_shoulder'
  | 'l_upper_arm'
  | 'l_forearm'
  | 'l_wrist_joint'
  | 'l_hand'
  | 'r_shoulder'
  | 'r_upper_arm'
  | 'r_forearm'
  | 'r_wrist_joint'
  | 'r_hand'
  | 'torso_upper'
  | 'pelvis'
  | 'l_thigh'
  | 'l_shin'
  | 'l_ankle_joint'
  | 'l_foot'
  | 'r_thigh'
  | 'r_shin'
  | 'r_ankle_joint'
  | 'r_foot';

export const GRANULAR_PICK_LABELS: Record<GranularPickKey, string> = {
  cranium: 'גולגולת',
  neck: 'צוואר',
  l_shoulder: 'כתף שמאל',
  l_upper_arm: 'זרוע עליונה שמאל (דו-ראשי)',
  l_forearm: 'אמה שמאל',
  l_wrist_joint: 'פרק כף יד שמאל',
  l_hand: 'כף יד שמאל',
  r_shoulder: 'כתף ימין',
  r_upper_arm: 'זרוע עליונה ימין (דו-ראשי)',
  r_forearm: 'אמה ימין',
  r_wrist_joint: 'פרק כף יד ימין',
  r_hand: 'כף יד ימין',
  torso_upper: 'גו עליון / חזה',
  pelvis: 'גו תחתון / בטן',
  l_thigh: 'ירך שמאל (מרבעים)',
  l_shin: 'שוק/ברך שמאל',
  l_ankle_joint: 'קרסול שמאל',
  l_foot: 'כף רגל שמאל',
  r_thigh: 'ירך ימין (מרבעים)',
  r_shin: 'שוק/ברך ימין',
  r_ankle_joint: 'קרסול ימין',
  r_foot: 'כף רגל ימין',
};

/** גזרת גו עליון: חזה + גב צווארי-חזי (נפרדת מגזרת הגו התחתון) */
export const TRUNK_UPPER_AREAS: BodyArea[] = ['chest', 'back_upper'];
/** גזרת גו תחתון: בטן + מותן (נפרדת מגזרת הגו העליון) */
export const TRUNK_LOWER_AREAS: BodyArea[] = ['abdomen', 'back_lower'];

/** כל מקטעי הגו (ללא צוואר) — לדילוג על השלמת שכנים אוטומטית במסך כאב */
export const TRUNK_BODY_AREAS: BodyArea[] = [...TRUNK_UPPER_AREAS, ...TRUNK_LOWER_AREAS];

/** שורה בטבלת ניהול כאב — רצף קליני; גו = קבוצה אחת ללא כפילות תווית */
export type PainManagementTableRow =
  | { kind: 'single'; area: BodyArea }
  | { kind: 'group'; label: string; areas: readonly BodyArea[] };

/**
 * סדר אנטומי (צוואר → גפיים עליונות → גו → אגן/ירך → גף תחתון).
 * גו עליון/תחתון כוללים חזה+גב עליון / בטן+מותן בשורה אחת.
 */
export const PAIN_MANAGEMENT_TABLE_ROWS: PainManagementTableRow[] = [
  { kind: 'single', area: 'neck' },
  { kind: 'single', area: 'shoulder_right' },
  { kind: 'single', area: 'shoulder_left' },
  { kind: 'single', area: 'upper_arm_right' },
  { kind: 'single', area: 'upper_arm_left' },
  { kind: 'single', area: 'elbow_right' },
  { kind: 'single', area: 'elbow_left' },
  { kind: 'single', area: 'forearm_right' },
  { kind: 'single', area: 'forearm_left' },
  { kind: 'single', area: 'wrist_right' },
  { kind: 'single', area: 'wrist_left' },
  { kind: 'single', area: 'hand_right' },
  { kind: 'single', area: 'hand_left' },
  { kind: 'group', label: bodyAreaLabels.chest, areas: TRUNK_UPPER_AREAS },
  { kind: 'group', label: bodyAreaLabels.abdomen, areas: TRUNK_LOWER_AREAS },
  { kind: 'single', area: 'hip_right' },
  { kind: 'single', area: 'hip_left' },
  { kind: 'single', area: 'thigh_right' },
  { kind: 'single', area: 'thigh_left' },
  { kind: 'single', area: 'knee_right' },
  { kind: 'single', area: 'knee_left' },
  { kind: 'single', area: 'shin_right' },
  { kind: 'single', area: 'shin_left' },
  { kind: 'single', area: 'ankle_right' },
  { kind: 'single', area: 'ankle_left' },
  { kind: 'single', area: 'foot_right' },
  { kind: 'single', area: 'foot_left' },
];

export function painManagementRowAreas(row: PainManagementTableRow): BodyArea[] {
  return row.kind === 'single' ? [row.area] : [...row.areas];
}

/**
 * ללא השלמת שכנים אוטומטיים: צוואר, גו (חזה/גב עליון/בטן/מותן), אגן/עכוז, כתף,
 * מקטעים שלא מוגדרים בשרשרת המפרקים (ירך/כף/זרוע עליונה וכו').
 */
export function primaryPainAutoNeighborDisabled(area: BodyArea): boolean {
  return (
    area === 'neck' ||
    TRUNK_BODY_AREAS.includes(area) ||
    area === 'hip_left' ||
    area === 'hip_right' ||
    area === 'shoulder_left' ||
    area === 'shoulder_right' ||
    area === 'upper_arm_left' ||
    area === 'upper_arm_right' ||
    area === 'hand_left' ||
    area === 'hand_right' ||
    area === 'foot_left' ||
    area === 'foot_right' ||
    area === 'thigh_left' ||
    area === 'thigh_right'
  );
}

/**
 * משנה אוטומטי כשנבחר ראשי — רק שרשראות מפרקים בגפיים (לא גו/צוואר).
 * קרסול→כף+שוק · ברך→שוק+ירך · שוק→קרסול+ברך · פרק כף→כף+אמה וכו׳
 */
const PAIN_PRIMARY_AUTO_SECONDARY: Partial<Record<BodyArea, BodyArea[]>> = {
  ankle_left: ['foot_left', 'shin_left'],
  ankle_right: ['foot_right', 'shin_right'],
  knee_left: ['shin_left', 'thigh_left'],
  knee_right: ['shin_right', 'thigh_right'],
  shin_left: ['ankle_left', 'knee_left'],
  shin_right: ['ankle_right', 'knee_right'],
  wrist_left: ['hand_left', 'forearm_left'],
  wrist_right: ['hand_right', 'forearm_right'],
  elbow_left: ['forearm_left', 'upper_arm_left'],
  elbow_right: ['forearm_right', 'upper_arm_right'],
  forearm_left: ['wrist_left', 'elbow_left'],
  forearm_right: ['wrist_right', 'elbow_right'],
};

export function painPrimaryAutoSecondaryNeighbors(area: BodyArea): BodyArea[] {
  if (primaryPainAutoNeighborDisabled(area)) return [];
  return PAIN_PRIMARY_AUTO_SECONDARY[area] ?? [];
}

const LEG_LEFT_CHAIN: BodyArea[] = [
  'hip_left',
  'thigh_left',
  'knee_left',
  'shin_left',
  'ankle_left',
  'foot_left',
];
const LEG_RIGHT_CHAIN: BodyArea[] = [
  'hip_right',
  'thigh_right',
  'knee_right',
  'shin_right',
  'ankle_right',
  'foot_right',
];

/**
 * Body area is part of the therapist-assigned clinical focus (not user-toggled self-care).
 */
export function bodyAreaIsClinicalFocus(
  zone: BodyArea,
  primaryBodyArea: BodyArea
): boolean {
  if (zone === primaryBodyArea) return true;
  if (
    TRUNK_UPPER_AREAS.includes(zone) &&
    TRUNK_UPPER_AREAS.includes(primaryBodyArea)
  ) {
    return true;
  }
  if (
    TRUNK_LOWER_AREAS.includes(zone) &&
    TRUNK_LOWER_AREAS.includes(primaryBodyArea)
  ) {
    return true;
  }

  const armPairs: [BodyArea, BodyArea][] = [
    ['shoulder_left', 'upper_arm_left'],
    ['shoulder_right', 'upper_arm_right'],
    ['elbow_left', 'forearm_left'],
    ['elbow_right', 'forearm_right'],
    ['wrist_left', 'forearm_left'],
    ['wrist_right', 'forearm_right'],
    ['wrist_left', 'hand_left'],
    ['wrist_right', 'hand_right'],
    ['forearm_left', 'hand_left'],
    ['forearm_right', 'hand_right'],
    ['ankle_left', 'foot_left'],
    ['ankle_right', 'foot_right'],
    ['shin_left', 'foot_left'],
    ['shin_right', 'foot_right'],
  ];
  for (const [a, b] of armPairs) {
    if ((zone === a && primaryBodyArea === b) || (zone === b && primaryBodyArea === a)) {
      return true;
    }
  }

  if (LEG_LEFT_CHAIN.includes(zone) && LEG_LEFT_CHAIN.includes(primaryBodyArea)) {
    return true;
  }
  if (LEG_RIGHT_CHAIN.includes(zone) && LEG_RIGHT_CHAIN.includes(primaryBodyArea)) {
    return true;
  }

  return false;
}

/**
 * אזור שחוסם בחירת פרהאב בפורטל — רק מקטעים שסומנו מפורשות כראשי (אדום) או משני (כתום).
 */
export function bodyAreaBlocksSelfCare(
  zone: BodyArea,
  injuryHighlightSegments: readonly BodyArea[],
  secondaryClinicalBodyAreas: readonly BodyArea[] = []
): boolean {
  if (secondaryClinicalBodyAreas.includes(zone)) return true;
  return injuryHighlightSegments.includes(zone);
}

/** נעילה ויזואלית במודל — כולל עקיפת מטפל (כפה נעול / כפה פתוח / אוטומטי). */
export function resolveClinicalLockedVisual(
  area: BodyArea,
  clinicalArea: BodyArea | undefined,
  secondarySet: ReadonlySet<BodyArea>,
  manual?: Partial<Record<BodyArea, ManualClinicalSegmentLockOverride>>
): boolean {
  const o = manual?.[area];
  if (o === 'force_locked') return true;
  if (o === 'force_unlocked') return false;
  return (
    clinicalArea != null &&
    bodyAreaIsClinicalFocus(area, clinicalArea) &&
    !secondarySet.has(area)
  );
}

/** Granular pick belongs to clinical focus (same rules as {@link bodyAreaIsClinicalFocus}). */
export function isPickKeyClinicalFocus(
  key: GranularPickKey,
  primaryBodyArea: BodyArea
): boolean {
  return bodyAreaIsClinicalFocus(pickKeyToBodyArea(key), primaryBodyArea);
}

export function pickKeyToBodyArea(key: GranularPickKey): BodyArea {
  const m: Record<GranularPickKey, BodyArea> = {
    cranium: 'neck',
    neck: 'neck',
    l_shoulder: 'shoulder_left',
    l_upper_arm: 'upper_arm_left',
    l_forearm: 'forearm_left',
    l_wrist_joint: 'wrist_left',
    l_hand: 'hand_left',
    r_shoulder: 'shoulder_right',
    r_upper_arm: 'upper_arm_right',
    r_forearm: 'forearm_right',
    r_wrist_joint: 'wrist_right',
    r_hand: 'hand_right',
    torso_upper: 'back_upper',
    pelvis: 'back_lower',
    l_thigh: 'thigh_left',
    l_shin: 'shin_left',
    l_ankle_joint: 'ankle_left',
    l_foot: 'foot_left',
    r_thigh: 'thigh_right',
    r_shin: 'shin_right',
    r_ankle_joint: 'ankle_right',
    r_foot: 'foot_right',
  };
  return m[key];
}

/** Mixamo joint name → granular key (order: specific fingers before generic hand). */
export function mixamoBoneNameToPickKey(boneName: string): GranularPickKey | null {
  const n = boneName.includes(':') ? boneName.split(':').pop()! : boneName;
  if (n === 'Head') return 'cranium';
  if (n === 'Neck') return 'neck';
  if (n === 'LeftShoulder') return 'l_shoulder';
  if (n === 'LeftArm') return 'l_upper_arm';
  if (n === 'LeftForeArm') return 'l_forearm';
  if (n.startsWith('LeftHand')) return 'l_hand';
  if (n === 'RightShoulder') return 'r_shoulder';
  if (n === 'RightArm') return 'r_upper_arm';
  if (n === 'RightForeArm') return 'r_forearm';
  if (n.startsWith('RightHand')) return 'r_hand';
  if (n === 'Spine' || n === 'Spine1' || n === 'Spine2') return 'torso_upper';
  if (n === 'Hips') return 'pelvis';
  if (n === 'LeftUpLeg') return 'l_thigh';
  if (n === 'LeftLeg') return 'l_shin';
  if (n === 'LeftFoot' || n === 'LeftToeBase') return 'l_foot';
  if (n === 'RightUpLeg') return 'r_thigh';
  if (n === 'RightLeg') return 'r_shin';
  if (n === 'RightFoot' || n === 'RightToeBase') return 'r_foot';
  return null;
}

/** Default pick key when migrating legacy BodyArea-only selections */
export const DEFAULT_PICK_KEY_FOR_BODY_AREA: Record<BodyArea, GranularPickKey> = {
  neck: 'neck',
  chest: 'torso_upper',
  abdomen: 'pelvis',
  shoulder_left: 'l_shoulder',
  shoulder_right: 'r_shoulder',
  upper_arm_left: 'l_upper_arm',
  upper_arm_right: 'r_upper_arm',
  elbow_left: 'l_forearm',
  elbow_right: 'r_forearm',
  forearm_left: 'l_forearm',
  forearm_right: 'r_forearm',
  wrist_left: 'l_wrist_joint',
  wrist_right: 'r_wrist_joint',
  hand_left: 'l_hand',
  hand_right: 'r_hand',
  back_upper: 'torso_upper',
  back_lower: 'pelvis',
  hip_left: 'l_thigh',
  hip_right: 'r_thigh',
  thigh_left: 'l_thigh',
  thigh_right: 'r_thigh',
  knee_left: 'l_shin',
  knee_right: 'r_shin',
  shin_left: 'l_shin',
  shin_right: 'r_shin',
  ankle_left: 'l_ankle_joint',
  ankle_right: 'r_ankle_joint',
  foot_left: 'l_foot',
  foot_right: 'r_foot',
};

export function isGranularPickKey(s: string): s is GranularPickKey {
  return s in GRANULAR_PICK_LABELS;
}

const ALL_GRANULAR_KEYS = Object.keys(GRANULAR_PICK_LABELS) as GranularPickKey[];

/** Granular keys that contribute to a coarse BodyArea (some areas share a bone). */
const EXTRA_KEYS_FOR_AREA: Partial<Record<BodyArea, GranularPickKey[]>> = {
  chest: ['torso_upper'],
  abdomen: ['pelvis'],
  knee_left: ['l_shin'],
  knee_right: ['r_shin'],
  shin_left: ['l_shin'],
  shin_right: ['r_shin'],
  elbow_left: ['l_forearm'],
  elbow_right: ['r_forearm'],
};

export function pickKeysForBodyArea(area: BodyArea): GranularPickKey[] {
  const extra = EXTRA_KEYS_FOR_AREA[area];
  if (extra) return [...extra];
  return ALL_GRANULAR_KEYS.filter((k) => pickKeyToBodyArea(k) === area);
}

export function aggregatePickKeysForBodyAreas(areas: BodyArea[]): GranularPickKey[] {
  const s = new Set<GranularPickKey>();
  for (const a of areas) {
    for (const k of pickKeysForBodyArea(a)) s.add(k);
  }
  return [...s];
}

/** סדר יציב לבחירת primaryBodyArea כאשר יש מספר מוקדים ראשיים */
export const BODY_AREA_CANONICAL_ORDER: BodyArea[] = (
  Object.keys(bodyAreaLabels) as BodyArea[]
).sort((a, b) => a.localeCompare(b, 'en'));

export function canonicalPrimaryBodyAreaFromPrimaries(
  primaries: ReadonlySet<BodyArea>,
  fallbackWhenEmpty: BodyArea
): BodyArea {
  if (primaries.size === 0) return fallbackWhenEmpty;
  for (const a of BODY_AREA_CANONICAL_ORDER) {
    if (primaries.has(a)) return a;
  }
  return fallbackWhenEmpty;
}
