/**
 * Domain facade hooks over granular Patient* contexts.
 *
 * Pure helpers live beside the provider:
 * - `patientContextHydrate.ts` / `patientContextPersist.ts`
 * - `patientContextExercise.ts` / `patientContextChat.ts`
 * - merge/canonicalize: `src/services/patientPayloadMerge.ts`
 *
 * Components should depend on the narrow slice they actually need via these hooks
 * instead of destructuring the god `usePatient()` hook directly.
 */
import {
  usePatientRosterContext,
  usePatientChatContext,
  usePatientExerciseContext,
  usePatientGamificationContext,
  usePatientSyncContext,
  usePatientClinicalContext,
  usePatientAiQueueContext,
} from './patientDomainContexts';

/** Roster + selection + navigation — therapist dashboard shell and patient pickers. */
export function usePatientRoster() {
  return usePatientRosterContext();
}

/** Therapist ↔ patient chat, safety alerts and emergency screening. */
export function usePatientChat() {
  return usePatientChatContext();
}

/** Exercise plans, daily sessions and completion reporting. */
export function usePatientExercisePlans() {
  return usePatientExerciseContext();
}

/** XP, coins, gear, articles and mountain-journey visuals (patient portal). */
export function usePatientGamification() {
  return usePatientGamificationContext();
}

/**
 * Cloud sync status + persistence helpers — save indicators and cloud write paths
 * without the god `usePatient()` hook.
 */
export function usePatientCloudSync() {
  return usePatientSyncContext();
}

/** Clinical mutations — red flags, notes, body-map / pain fields, patient profile writes. */
export function usePatientClinical() {
  return usePatientClinicalContext();
}

/** AI suggestion queue + Guardian reps-increase requests (therapist / portal). */
export function usePatientAiQueue() {
  return usePatientAiQueueContext();
}
