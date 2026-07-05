/**
 * Domain facade hooks over the monolithic `usePatient()` context.
 *
 * `PatientContextValue` exposes ~100 members across unrelated domains (roster,
 * chat, exercise plans, gamification). Components should depend on the narrow
 * slice they actually need via these hooks instead of destructuring the god
 * hook directly. This documents the domain boundaries and lets each slice be
 * moved into its own provider later without touching consumers again.
 */
import { usePatient } from './PatientContext';

/** Roster + selection + navigation — therapist dashboard shell and patient pickers. */
export function usePatientRoster() {
  const ctx = usePatient();
  return {
    patients: ctx.patients,
    selectedPatient: ctx.selectedPatient,
    selectedPatientId: ctx.selectedPatientId,
    selectPatient: ctx.selectPatient,
    activeSection: ctx.activeSection,
    setActiveSection: ctx.setActiveSection,
    isPatientSessionLocked: ctx.isPatientSessionLocked,
    createPatientWithAccess: ctx.createPatientWithAccess,
  };
}

/** Therapist ↔ patient chat, safety alerts and emergency screening. */
export function usePatientChat() {
  const ctx = usePatient();
  return {
    messages: ctx.messages,
    markMessageRead: ctx.markMessageRead,
    getPatientMessages: ctx.getPatientMessages,
    sendTherapistReply: ctx.sendTherapistReply,
    sendPatientMessage: ctx.sendPatientMessage,
    sendAiClinicalAlert: ctx.sendAiClinicalAlert,
    safetyAlerts: ctx.safetyAlerts,
    dismissSafetyAlert: ctx.dismissSafetyAlert,
    screenAndHandleEmergencyText: ctx.screenAndHandleEmergencyText,
    emergencyModalPatientId: ctx.emergencyModalPatientId,
    setEmergencyModalPatientId: ctx.setEmergencyModalPatientId,
  };
}

/** Exercise plans, daily sessions and completion reporting. */
export function usePatientExercisePlans() {
  const ctx = usePatient();
  return {
    exercisePlans: ctx.exercisePlans,
    getExercisePlan: ctx.getExercisePlan,
    readExercisePlanSnapshot: ctx.readExercisePlanSnapshot,
    addExerciseToPlan: ctx.addExerciseToPlan,
    removeExerciseFromPlan: ctx.removeExerciseFromPlan,
    updateExerciseInPlan: ctx.updateExerciseInPlan,
    dailySessions: ctx.dailySessions,
    clinicalToday: ctx.clinicalToday,
    dailyHistoryByPatient: ctx.dailyHistoryByPatient,
    getTodaySession: ctx.getTodaySession,
    toggleExercise: ctx.toggleExercise,
    submitExerciseReport: ctx.submitExerciseReport,
  };
}

/** XP, coins, gear, articles and mountain-journey visuals (patient portal). */
export function usePatientGamification() {
  const ctx = usePatient();
  return {
    grantPatientCoins: ctx.grantPatientCoins,
    markArticleAsRead: ctx.markArticleAsRead,
    hasReadArticle: ctx.hasReadArticle,
    getPatientGear: ctx.getPatientGear,
    purchaseGearItem: ctx.purchaseGearItem,
    equipGearItem: ctx.equipGearItem,
    unequipGearSlot: ctx.unequipGearSlot,
    claimDailyLoginBonusIfNeeded: ctx.claimDailyLoginBonusIfNeeded,
    rewardFeedback: ctx.rewardFeedback,
    clearRewardFeedback: ctx.clearRewardFeedback,
    getMountainDailyEnvironmentState: ctx.getMountainDailyEnvironmentState,
    getMountainBackdropContext: ctx.getMountainBackdropContext,
  };
}

/** Cloud sync status — for save indicators and error surfaces. */
export function usePatientCloudSync() {
  const ctx = usePatient();
  return {
    supabaseSyncStatus: ctx.supabaseSyncStatus,
    supabaseSyncError: ctx.supabaseSyncError,
    supabaseLastSavedAt: ctx.supabaseLastSavedAt,
  };
}
