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

/** Cloud sync status — for save indicators and error surfaces. */
export function usePatientCloudSync() {
  const ctx = usePatientSyncContext();
  return {
    supabaseSyncStatus: ctx.supabaseSyncStatus,
    supabaseSyncError: ctx.supabaseSyncError,
    supabaseLastSavedAt: ctx.supabaseLastSavedAt,
  };
}
