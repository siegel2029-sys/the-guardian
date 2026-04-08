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
  shoulder_left: { position: [0.36, 1.26, 0.04], radius: 0.13 },
  shoulder_right: { position: [-0.36, 1.26, 0.04], radius: 0.13 },
  back_upper: { position: [0, 1.05, -0.12], radius: 0.22 },
  back_lower: { position: [0, 0.78, -0.1], radius: 0.2 },
  hip_left: { position: [0.2, 0.62, 0.02], radius: 0.14 },
  hip_right: { position: [-0.2, 0.62, 0.02], radius: 0.14 },
  knee_left: { position: [0.2, 0.38, 0.05], radius: 0.11 },
  knee_right: { position: [-0.2, 0.38, 0.05], radius: 0.11 },
  ankle_left: { position: [0.2, 0.08, 0.1], radius: 0.09 },
  ankle_right: { position: [-0.2, 0.08, 0.1], radius: 0.09 },
  wrist_left: { position: [0.52, 0.72, 0.05], radius: 0.07 },
  wrist_right: { position: [-0.52, 0.72, 0.05], radius: 0.07 },
  elbow_left: { position: [0.42, 0.98, 0.04], radius: 0.08 },
  elbow_right: { position: [-0.42, 0.98, 0.04], radius: 0.08 },
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
