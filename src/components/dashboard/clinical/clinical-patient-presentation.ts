import type { Patient } from '../../../types';
import { resolvePatientRosterStatus } from '../../../utils/patientRosterMetrics';

export type AvatarPresentationState = {
  labelHe: string;
  subtitleHe: string;
  ringClass: string;
  badgeBg: string;
  badgeText: string;
};

/** מצב תצוגה ויזואלי (אווטאר) — נגזר מסטטוס, דגל אדום וכאב אחרון */
export function getPatientAvatarPresentation(p: Patient): AvatarPresentationState {
  const status = resolvePatientRosterStatus(p);
  if (status === 'paused' || status === 'frozen') {
    return {
      labelHe: 'מוקפא',
      subtitleHe: 'התוכנית אינה פעילה כרגע',
      ringClass: 'ring-violet-300',
      badgeBg: '#ede9fe',
      badgeText: '#5b21b6',
    };
  }
  if (status === 'pending') {
    return {
      labelHe: 'ממתין להתחלה',
      subtitleHe: 'נדרשת הקצאת תוכנית / פרופיל קליני',
      ringClass: 'ring-amber-300',
      badgeBg: '#fef3c7',
      badgeText: '#92400e',
    };
  }
  if (p.hasRedFlag) {
    return {
      labelHe: 'ניטור מוגבר',
      subtitleHe: 'דגל אדום או התראת בטיחות פעילה',
      ringClass: 'ring-red-400',
      badgeBg: '#fee2e2',
      badgeText: '#b91c1c',
    };
  }
  const lastPain = p.analytics.painHistory.at(-1)?.painLevel;
  if (lastPain != null && lastPain >= 6) {
    return {
      labelHe: 'כאב גבוה — מעקב צמוד',
      subtitleHe: 'מומלץ לעדכן הערכה ולשקול התאמת עומס',
      ringClass: 'ring-orange-400',
      badgeBg: '#ffedd5',
      badgeText: '#c2410c',
    };
  }
  if (lastPain != null && lastPain <= 3 && p.currentStreak >= 3) {
    return {
      labelHe: 'בהתאוששות טובה',
      subtitleHe: 'מגמת כאב נמוכה ורצף פעילות חיובי',
      ringClass: 'ring-emerald-300',
      badgeBg: '#d1fae5',
      badgeText: '#047857',
    };
  }
  return {
    labelHe: 'פעיל',
    subtitleHe: 'במעקב שגרתי לפי התוכנית',
    ringClass: 'ring-blue-300',
    badgeBg: '#dbeafe',
    badgeText: '#1d4ed8',
  };
}
