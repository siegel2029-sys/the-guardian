/**
 * קריאה סינכרונית חד-פעמית מ-localStorage בתחילת חיי האפליקציה,
 * כדי שרענון/הדבקת URL יטענו מיד נתונים שמורים (ולא mock).
 */
import { loadAuthSnapshot, type AuthSnapshotV1 } from '../context/authPersistence';
import type { PersistedPatientStateV1 } from '../context/patientPersistence';
import { loadPersistedPatientState } from '../context/patientPersistence';

export type AppBootstrapSnapshot = {
  auth: AuthSnapshotV1;
  patient: PersistedPatientStateV1 | null;
};

let cache: AppBootstrapSnapshot | null = null;

export function readPersistedOnce(): AppBootstrapSnapshot {
  if (!cache) {
    cache = {
      auth: loadAuthSnapshot(),
      patient: loadPersistedPatientState(),
    };
  }
  return cache;
}

/** לבדיקות / איפוס ידני אם יידרש בעתיד */
export function clearPersistedBootstrapCache(): void {
  cache = null;
}
