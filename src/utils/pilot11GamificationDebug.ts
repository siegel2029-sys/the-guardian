import type { Patient } from '../types';

/** פאנל דיבאג גמיפיקציה — רק למטופל עם מזהה או שם `pilot11` (גם ב-production). */
export function isPilot11GamificationDebugPatient(p: { id: string; name: string }): boolean {
  const id = p.id.trim().toLowerCase();
  const name = p.name.trim().toLowerCase();
  return id === 'pilot11' || name === 'pilot11';
}

export function canPilot11DebugMutatePatient(
  patients: readonly Patient[],
  patientId: string
): boolean {
  if (!import.meta.env.PROD) return true;
  const p = patients.find((x) => x.id === patientId);
  return p ? isPilot11GamificationDebugPatient(p) : false;
}
