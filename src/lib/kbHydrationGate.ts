/**
 * מונע דחיפת app_knowledge_base לפני טעינה מהשרת אחרי ריענון (מירוב עם מצב מקומי ריק).
 * מתואם עם PatientContext + upsert ב-clinicalService.
 */

let appKbHydratedFromCloud = false;

const globalKbMigrationAttemptedTherapistIds = new Set<string>();

export function getAppKbHydratedFromCloud(): boolean {
  return appKbHydratedFromCloud;
}

export function setAppKbHydratedFromCloud(value: boolean): void {
  appKbHydratedFromCloud = value;
}

export function resetAppKbHydrationGate(): void {
  appKbHydratedFromCloud = false;
  globalKbMigrationAttemptedTherapistIds.clear();
}

export function hasAttemptedGlobalKbMigrationForTherapist(therapistId: string): boolean {
  return globalKbMigrationAttemptedTherapistIds.has(therapistId);
}

export function markGlobalKbMigrationAttemptedForTherapist(therapistId: string): void {
  globalKbMigrationAttemptedTherapistIds.add(therapistId);
}
