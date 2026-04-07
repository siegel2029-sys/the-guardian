import type { BodyArea, Exercise } from '../types';

const MIRROR: Partial<Record<BodyArea, BodyArea>> = {
  knee_right: 'knee_left',
  knee_left: 'knee_right',
  shoulder_right: 'shoulder_left',
  shoulder_left: 'shoulder_right',
  hip_right: 'hip_left',
  hip_left: 'hip_right',
  ankle_right: 'ankle_left',
  ankle_left: 'ankle_right',
  wrist_right: 'wrist_left',
  wrist_left: 'wrist_right',
  elbow_right: 'elbow_left',
  elbow_left: 'elbow_right',
};

/** תרגיל מהספרייה רלוונטי לאזור המוקד (כולל צד נגדי לזוגות ימין/שמאל). */
export function exerciseMatchesPrimary(ex: Exercise, primary: BodyArea): boolean {
  return ex.targetArea === primary || ex.targetArea === MIRROR[primary];
}
