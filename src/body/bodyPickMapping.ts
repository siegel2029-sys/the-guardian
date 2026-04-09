import type { BodyArea } from '../types';

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
  | 'l_hand'
  | 'r_shoulder'
  | 'r_upper_arm'
  | 'r_forearm'
  | 'r_hand'
  | 'torso_upper'
  | 'pelvis'
  | 'l_thigh'
  | 'l_shin'
  | 'l_foot'
  | 'r_thigh'
  | 'r_shin'
  | 'r_foot';

export const GRANULAR_PICK_LABELS: Record<GranularPickKey, string> = {
  cranium: 'גולגולת',
  neck: 'צוואר',
  l_shoulder: 'כתף שמאל',
  l_upper_arm: 'זרוע עליונה שמאל (דו-ראשי)',
  l_forearm: 'אמה שמאל',
  l_hand: 'כף יד שמאל',
  r_shoulder: 'כתף ימין',
  r_upper_arm: 'זרוע עליונה ימין (דו-ראשי)',
  r_forearm: 'אמה ימין',
  r_hand: 'כף יד ימין',
  torso_upper: 'גב/חזה עליון',
  pelvis: 'אגן / גב תחתון',
  l_thigh: 'ירך שמאל (מרבעים)',
  l_shin: 'שוק/ברך שמאל',
  l_foot: 'קרסול/כף רגל שמאל',
  r_thigh: 'ירך ימין (מרבעים)',
  r_shin: 'שוק/ברך ימין',
  r_foot: 'קרסול/כף רגל ימין',
};

const TRUNK_AREAS: BodyArea[] = ['chest', 'abdomen', 'back_upper', 'back_lower'];

const LEG_LEFT_CHAIN: BodyArea[] = [
  'hip_left',
  'thigh_left',
  'knee_left',
  'shin_left',
  'ankle_left',
];
const LEG_RIGHT_CHAIN: BodyArea[] = [
  'hip_right',
  'thigh_right',
  'knee_right',
  'shin_right',
  'ankle_right',
];

/**
 * Body area is part of the therapist-assigned clinical focus (not user-toggled self-care).
 */
export function bodyAreaIsClinicalFocus(
  zone: BodyArea,
  primaryBodyArea: BodyArea
): boolean {
  if (zone === primaryBodyArea) return true;
  if (TRUNK_AREAS.includes(zone) && TRUNK_AREAS.includes(primaryBodyArea)) {
    return true;
  }

  const armPairs: [BodyArea, BodyArea][] = [
    ['shoulder_left', 'upper_arm_left'],
    ['shoulder_right', 'upper_arm_right'],
    ['elbow_left', 'forearm_left'],
    ['elbow_right', 'forearm_right'],
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
    l_hand: 'wrist_left',
    r_shoulder: 'shoulder_right',
    r_upper_arm: 'upper_arm_right',
    r_forearm: 'forearm_right',
    r_hand: 'wrist_right',
    torso_upper: 'back_upper',
    pelvis: 'back_lower',
    l_thigh: 'thigh_left',
    l_shin: 'shin_left',
    l_foot: 'ankle_left',
    r_thigh: 'thigh_right',
    r_shin: 'shin_right',
    r_foot: 'ankle_right',
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
  wrist_left: 'l_hand',
  wrist_right: 'r_hand',
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
  ankle_left: 'l_foot',
  ankle_right: 'r_foot',
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
