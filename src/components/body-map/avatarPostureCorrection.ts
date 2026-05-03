/**
 * Counter-rotation (radians) for baked-in mesh / rig lean so shoulders read level.
 * Tune X/Z only; Y is reserved for facing (handled elsewhere on GLTF clone).
 * If the figure still leans, nudge by ~0.02–0.05 rad steps and flip sign if it worsens.
 */
export const AVATAR_COUNTER_ROTATION_X = 0;
export const AVATAR_COUNTER_ROTATION_Z = 0.07;

export const avatarMeshCounterRotation: [number, number, number] = [
  AVATAR_COUNTER_ROTATION_X,
  0,
  AVATAR_COUNTER_ROTATION_Z,
];
