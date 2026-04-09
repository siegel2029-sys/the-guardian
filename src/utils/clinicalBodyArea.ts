import type { BodyArea, Exercise } from '../types';

const MIRROR: Partial<Record<BodyArea, BodyArea>> = {
  knee_right: 'knee_left',
  knee_left: 'knee_right',
  shoulder_right: 'shoulder_left',
  shoulder_left: 'shoulder_right',
  upper_arm_right: 'upper_arm_left',
  upper_arm_left: 'upper_arm_right',
  elbow_right: 'elbow_left',
  elbow_left: 'elbow_right',
  forearm_right: 'forearm_left',
  forearm_left: 'forearm_right',
  wrist_right: 'wrist_left',
  wrist_left: 'wrist_right',
  hip_right: 'hip_left',
  hip_left: 'hip_right',
  thigh_right: 'thigh_left',
  thigh_left: 'thigh_right',
  shin_right: 'shin_left',
  shin_left: 'shin_right',
  ankle_right: 'ankle_left',
  ankle_left: 'ankle_right',
};

/** תרגיל מהספרייה רלוונטי לאזור המוקד (כולל צד נגדי לזוגות ימין/שמאל). */
export function exerciseMatchesPrimary(ex: Exercise, primary: BodyArea): boolean {
  return ex.targetArea === primary || ex.targetArea === MIRROR[primary];
}
