import type { BodyArea } from '../types';

/** מפרקים בלבד — ללא עצמות ארוכות / גב / חזה, ליציבות מפת האנטומיה */
export const JOINT_BODY_AREAS: readonly BodyArea[] = [
  'neck',
  'shoulder_right',
  'shoulder_left',
  'elbow_right',
  'elbow_left',
  'wrist_right',
  'wrist_left',
  'hip_right',
  'hip_left',
  'knee_right',
  'knee_left',
  'ankle_right',
  'ankle_left',
] as const;

const JOINT_SET = new Set<BodyArea>(JOINT_BODY_AREAS);

export function isJointBodyArea(area: BodyArea): boolean {
  return JOINT_SET.has(area);
}

export function filterToJointBodyAreas(areas: readonly string[]): BodyArea[] {
  const out: BodyArea[] = [];
  for (const raw of areas) {
    if (JOINT_SET.has(raw as BodyArea)) out.push(raw as BodyArea);
  }
  return [...new Set(out)];
}
