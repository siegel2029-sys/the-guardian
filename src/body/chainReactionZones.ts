import type { BodyArea } from '../types';

/**
 * אזורי «שרשרת» שעשויים להשפיע על מוקד הפגיעה — אזהרה למטפל ובדיקת בטיחות בתרגול כוח.
 */
const CHAIN_BY_PRIMARY: Partial<Record<BodyArea, BodyArea[]>> = {
  shoulder_right: ['neck', 'upper_arm_right', 'back_upper', 'wrist_right', 'elbow_right'],
  shoulder_left: ['neck', 'upper_arm_left', 'back_upper', 'wrist_left', 'elbow_left'],
  neck: ['shoulder_left', 'shoulder_right', 'back_upper', 'upper_arm_left', 'upper_arm_right'],
  upper_arm_right: ['shoulder_right', 'elbow_right', 'neck'],
  upper_arm_left: ['shoulder_left', 'elbow_left', 'neck'],
  elbow_right: ['wrist_right', 'shoulder_right', 'upper_arm_right'],
  elbow_left: ['wrist_left', 'shoulder_left', 'upper_arm_left'],
  wrist_right: ['elbow_right', 'forearm_right', 'shoulder_right'],
  wrist_left: ['elbow_left', 'forearm_left', 'shoulder_left'],
  forearm_right: ['wrist_right', 'elbow_right'],
  forearm_left: ['wrist_left', 'elbow_left'],
  back_upper: ['neck', 'shoulder_left', 'shoulder_right', 'back_lower'],
  back_lower: ['hip_left', 'hip_right', 'back_upper', 'thigh_left', 'thigh_right'],
  abdomen: ['back_lower', 'hip_left', 'hip_right'],
  hip_right: ['back_lower', 'thigh_right', 'knee_right'],
  hip_left: ['back_lower', 'thigh_left', 'knee_left'],
  thigh_right: ['hip_right', 'knee_right', 'shin_right', 'back_lower'],
  thigh_left: ['hip_left', 'knee_left', 'shin_left', 'back_lower'],
  knee_right: ['thigh_right', 'shin_right', 'ankle_right', 'hip_right'],
  knee_left: ['thigh_left', 'shin_left', 'ankle_left', 'hip_left'],
  shin_right: ['knee_right', 'ankle_right', 'thigh_right'],
  shin_left: ['knee_left', 'ankle_left', 'thigh_left'],
  ankle_right: ['shin_right', 'knee_right'],
  ankle_left: ['shin_left', 'knee_left'],
  chest: ['back_upper', 'abdomen', 'shoulder_left', 'shoulder_right'],
};

export function getChainReactionZones(primary: BodyArea): BodyArea[] {
  return CHAIN_BY_PRIMARY[primary] ?? ['neck', 'back_upper', 'abdomen'];
}

export function isChainReactionZoneForPrimary(primary: BodyArea, exercisedZone: BodyArea): boolean {
  const chain = getChainReactionZones(primary);
  return chain.includes(exercisedZone);
}
