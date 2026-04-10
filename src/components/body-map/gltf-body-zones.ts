import type { BodyArea } from '../../types';

/**
 * Pick spheres in meters — humanoid ~1.65m tall, origin at ground center.
 * Tuned for three.js Soldier.glb after bbox normalize (facing +Z forward).
 */
export const GLTF_BODY_ZONE_SPHERES: Record<
  BodyArea,
  { position: [number, number, number]; radius: number }
> = {
  neck: { position: [0, 1.44, 0.06], radius: 0.11 },
  chest: { position: [0, 1.12, 0.12], radius: 0.16 },
  abdomen: { position: [0, 0.92, 0.1], radius: 0.15 },
  shoulder_left: { position: [0.36, 1.26, 0.04], radius: 0.13 },
  shoulder_right: { position: [-0.36, 1.26, 0.04], radius: 0.13 },
  upper_arm_left: { position: [0.39, 1.12, 0.04], radius: 0.1 },
  upper_arm_right: { position: [-0.39, 1.12, 0.04], radius: 0.1 },
  elbow_left: { position: [0.42, 0.98, 0.04], radius: 0.08 },
  elbow_right: { position: [-0.42, 0.98, 0.04], radius: 0.08 },
  forearm_left: { position: [0.47, 0.85, 0.05], radius: 0.07 },
  forearm_right: { position: [-0.47, 0.85, 0.05], radius: 0.07 },
  wrist_left: { position: [0.52, 0.72, 0.05], radius: 0.07 },
  wrist_right: { position: [-0.52, 0.72, 0.05], radius: 0.07 },
  hand_left: { position: [0.54, 0.62, 0.06], radius: 0.06 },
  hand_right: { position: [-0.54, 0.62, 0.06], radius: 0.06 },
  back_upper: { position: [0, 1.05, -0.12], radius: 0.22 },
  back_lower: { position: [0, 0.78, -0.1], radius: 0.2 },
  hip_left: { position: [0.2, 0.62, 0.02], radius: 0.14 },
  hip_right: { position: [-0.2, 0.62, 0.02], radius: 0.14 },
  thigh_left: { position: [0.2, 0.5, 0.04], radius: 0.12 },
  thigh_right: { position: [-0.2, 0.5, 0.04], radius: 0.12 },
  knee_left: { position: [0.2, 0.38, 0.05], radius: 0.11 },
  knee_right: { position: [-0.2, 0.38, 0.05], radius: 0.11 },
  shin_left: { position: [0.2, 0.22, 0.07], radius: 0.09 },
  shin_right: { position: [-0.2, 0.22, 0.07], radius: 0.09 },
  ankle_left: { position: [0.2, 0.08, 0.1], radius: 0.09 },
  ankle_right: { position: [-0.2, 0.08, 0.1], radius: 0.09 },
  foot_left: { position: [0.2, 0.02, 0.12], radius: 0.07 },
  foot_right: { position: [-0.2, 0.02, 0.12], radius: 0.07 },
};

export const BODY_AREAS_ORDER: BodyArea[] = [
  'neck',
  'shoulder_left',
  'shoulder_right',
  'back_upper',
  'back_lower',
  'elbow_left',
  'elbow_right',
  'wrist_left',
  'wrist_right',
  'hip_left',
  'hip_right',
  'knee_left',
  'knee_right',
  'ankle_left',
  'ankle_right',
];
