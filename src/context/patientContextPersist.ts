/**
 * PatientContext persist domain — merge helpers for single-patient / exercise cloud saves.
 * Preserves Iron Rule 4 call-site contracts (baseline/server first, incoming second).
 */
import type { Patient, PatientExercise } from '../types';
import { mergePatientPayloadForUpsert } from '../services/clinicalService';

/**
 * Therapist/portal single-patient cloud save merge.
 * Trust flag must stay false for portal (`restrictPatientSessionId` set).
 */
export function mergePatientForSingleCloudSave(
  baseline: Patient | undefined,
  patient: Patient,
  clinicalToday: string,
  trustIncomingAccountControl: boolean
): Patient {
  if (baseline == null) return patient;
  return mergePatientPayloadForUpsert(baseline, patient, {
    clinicalToday,
    trustIncomingAccountControl,
  });
}

/** Stamp `_exercisePlanCache` onto a patient payload using the canonical merge helper. */
export function mergePatientWithExercisePlanCache(
  existing: Patient | undefined,
  patient: Patient,
  exercises: PatientExercise[],
  clinicalToday: string
): Patient {
  return mergePatientPayloadForUpsert(
    existing,
    { ...patient, _exercisePlanCache: exercises },
    { clinicalToday }
  );
}
