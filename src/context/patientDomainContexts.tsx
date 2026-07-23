/**
 * Domain-scoped React contexts carved from the PatientProvider orchestrator.
 * Consumers should prefer these (via patientDomainHooks) over the god `usePatient()`
 * so unrelated domain updates do not re-render their subtree.
 */
import { createContext, useContext, type ReactNode } from 'react';
import type {
  Patient,
  NavSection,
  Message,
  ExercisePlan,
  DailySession,
  DailyHistoryEntry,
  PatientExercise,
  Exercise,
  BodyArea,
  SafetyAlert,
  ClinicalSafetyTier,
  KnowledgeFact,
  AiSuggestion,
  PatientExerciseFinishReport,
  SelfCareSessionReport,
  InitialClinicalProfileExtras,
} from '../types';
import type { GearEquipSlot } from '../config/gearCatalog';
import type { StorePurchaseResult } from '../config/storeCatalog';
import type {
  GearPurchaseResult,
  MountainBackdropContext,
  MountainDailyEnvironmentState,
  PatientRewardFeedback,
} from '../hooks/useGamification';
import type { PatientGearState } from './patientGearUtils';
import type { SupabasePushResult } from '../lib/supabaseSync';
import type { PersistedPatientStateV1 } from './patientPersistence';

// ── Slice shapes (match patientDomainHooks public API) ───────────────────────

export type PatientRosterSlice = {
  patients: Patient[];
  selectedPatient: Patient | null;
  selectedPatientId: string;
  selectPatient: (id: string, options?: { openSection?: NavSection }) => void;
  activeSection: NavSection;
  setActiveSection: (s: NavSection) => void;
  isPatientSessionLocked: boolean;
  createPatientWithAccess: (
    displayName: string,
    access: { portalUsername: string; password?: string }
  ) => Promise<
    | { ok: true; loginId: string; password: string; patientId: string }
    | { ok: false; message: string }
  >;
  /** Therapist dashboard chrome: pending AI queue + portal link gaps. */
  getTotalAwaitingTherapistCount: () => number;
  aiSuggestions: AiSuggestion[];
  unlinkedPortalPatientIds: string[];
};

export type PatientChatSlice = {
  messages: Message[];
  markMessageRead: (id: string) => void;
  getPatientMessages: (patientId: string) => Message[];
  sendTherapistReply: (patientId: string, content: string) => void;
  sendPatientMessage: (patientId: string, content: string) => void;
  sendAiClinicalAlert: (
    patientId: string,
    detailHebrew?: string,
    tier?: ClinicalSafetyTier
  ) => void;
  safetyAlerts: SafetyAlert[];
  dismissSafetyAlert: (alertId: string) => void;
  screenAndHandleEmergencyText: (patientId: string, text: string, sourceLabel: string) => boolean;
  emergencyModalPatientId: string | null;
  setEmergencyModalPatientId: (id: string | null) => void;
};

export type PatientExerciseSlice = {
  exercisePlans: ExercisePlan[];
  getExercisePlan: (patientId: string) => ExercisePlan | undefined;
  readExercisePlanSnapshot: (patientId: string) => PatientExercise[];
  addExerciseToPlan: (patientId: string, exercise: Exercise) => void;
  removeExerciseFromPlan: (patientId: string, exerciseId: string) => void;
  updateExerciseInPlan: (
    patientId: string,
    exerciseId: string,
    updates: Partial<
      Pick<
        PatientExercise,
        'patientReps' | 'patientSets' | 'patientWeightKg' | 'isOptional' | 'customInstructions' | 'instructions'
      >
    >
  ) => void;
  dailySessions: DailySession[];
  clinicalToday: string;
  dailyHistoryByPatient: Record<string, Record<string, DailyHistoryEntry>>;
  getTodaySession: (patientId: string) => DailySession;
  toggleExercise: (patientId: string, exerciseId: string, xpReward: number) => void;
  submitExerciseReport: (
    patientId: string,
    exerciseId: string,
    painLevel: number,
    effortRating: number,
    xpReward: number,
    options?: {
      skipPainHistory?: boolean;
      completionSource?: 'rehab' | 'self-care';
      sessionBodyArea?: BodyArea;
      optionalPoolNoReward?: boolean;
      planRowId?: string;
      isManualPlan?: boolean;
    }
  ) => boolean | Promise<boolean>;
  /** Portal safety lock (effort / red-flag style gates). */
  isPatientExerciseSafetyLocked: (patientId: string) => boolean;
  submitPatientAiPlanAdjustmentRequest: (suggestion: AiSuggestion) => void;
  getSelfCareZones: (patientId: string) => BodyArea[];
  toggleSelfCareZone: (patientId: string, area: BodyArea) => void;
  logSelfCareSession: (
    patientId: string,
    exerciseId: string,
    exerciseName: string,
    effortRating: number
  ) => void;
  getSelfCareReportsForPatient: (patientId: string) => SelfCareSessionReport[];
  appendPatientExerciseFinishReport: (
    patientId: string,
    entry: Omit<PatientExerciseFinishReport, 'id' | 'patientId' | 'timestamp'>
  ) => void | Promise<void>;
  getPatientExerciseFinishReports: (patientId: string) => PatientExerciseFinishReport[];
  getSelfCareStrengthTier: (patientId: string, area: BodyArea) => 0 | 1 | 2;
  setSelfCareStrengthTier: (patientId: string, area: BodyArea, tier: 0 | 1 | 2) => void;
};

export type PatientGamificationSlice = {
  grantPatientCoins: (patientId: string, amount: number) => void;
  markArticleAsRead: (
    patientId: string,
    articleId: string,
    options?: { readerConfirmed?: boolean; didYouKnowLocalCalendarYmd?: string }
  ) => boolean;
  hasReadArticle: (patientId: string, articleId: string) => boolean;
  getPatientGear: (patientId: string) => PatientGearState;
  purchaseGearItem: (patientId: string, itemId: string) => GearPurchaseResult;
  equipGearItem: (patientId: string, itemId: string) => boolean;
  unequipGearSlot: (patientId: string, slot: GearEquipSlot) => void;
  purchaseStoreItem: (patientId: string, itemId: string) => StorePurchaseResult;
  equipStoreItem: (patientId: string, itemId: string) => boolean;
  unequipStoreItem: (patientId: string, itemId: string) => void;
  claimDailyLoginBonusIfNeeded: (patientId: string) => boolean;
  hasDailyLoginBonusPending: (patientId: string) => boolean;
  rewardFeedback: PatientRewardFeedback | null;
  clearRewardFeedback: () => void;
  getMountainDailyEnvironmentState: (clinicalYmd: string) => MountainDailyEnvironmentState;
  getMountainBackdropContext: (level: number, clinicalYmd: string) => MountainBackdropContext;
  knowledgeFacts: KnowledgeFact[];
  recordDidYouKnowTipOpened: (patientId: string, localCalendarYmd: string) => void;
  getDidYouKnowTipOpenedLocalYmd: (patientId: string) => string | null;
};

export type PatientSyncSlice = {
  supabaseSyncStatus: 'idle' | 'saving' | 'saved' | 'error';
  supabaseSyncError: string | null;
  supabaseLastSavedAt: string | null;
  supabaseConfigured: boolean;
  savePersistedStateToCloud: (options?: {
    exercisePlanChangeSummaryByPatientId?: Record<string, string>;
    immediate?: boolean;
    onPushComplete?: (result: SupabasePushResult) => void;
    persistSnapshotOverride?: PersistedPatientStateV1;
    trustKnowledgeFactDeletions?: boolean;
  }) => Promise<boolean>;
  saveSinglePatientPayloadToCloud: (
    patient: Patient,
    options?: { trustIncomingAccountControl?: boolean }
  ) => Promise<boolean>;
  saveExercisePlanForPatientToCloud: (
    patientId: string,
    exercises: PatientExercise[],
    options?: { changeSummary?: string; forceSave?: boolean }
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  persistExercisePlanCacheForPatient: (
    patientId: string,
    exercises: PatientExercise[]
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
};

/** Clinical mutations — body map, pain fields, notes, red flags, patient profile writes. */
export type PatientClinicalSlice = {
  resolveRedFlag: (patientId: string) => void;
  reportPatientUrgentRedFlag: (patientId: string, portalLogLine: string) => void;
  setPatientContactWhatsapp: (patientId: string, phoneDigitsOrEmpty: string) => void;
  updateTherapistNotes: (patientId: string, notes: string) => void;
  runClinicalAssessmentEngine: (patientId: string, notes: string) => void;
  applyInitialClinicalProfile: (
    patientId: string,
    primaryBodyArea: BodyArea,
    libraryExerciseIds: string[],
    extras?: InitialClinicalProfileExtras
  ) => void;
  deletePatient: (patientId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  updatePatient: (
    patientId: string,
    patch: Partial<Omit<Patient, 'id' | 'therapistId'>>
  ) => void;
  resetPatientPainReports: (patientId: string) => void;
  togglePatientInjuryHighlight: (patientId: string, area: BodyArea) => void;
  clearPatientInjuryHighlights: (patientId: string) => void;
  cycleTherapistBodyMapClinical: (patientId: string, area: BodyArea) => void;
  setTherapistPrimaryBodyArea: (patientId: string, area: BodyArea) => void;
  applyTherapistPainFields: (
    patientId: string,
    fields: {
      injuryHighlightSegments: BodyArea[];
      secondaryClinicalBodyAreas: BodyArea[];
      primaryBodyArea: BodyArea;
    }
  ) => void;
};

/** Therapist/patient AI suggestion queue and Guardian plan-adjustment requests. */
export type PatientAiQueueSlice = {
  aiSuggestions: AiSuggestion[];
  getPendingAiSuggestions: (patientId: string) => AiSuggestion[];
  getAwaitingTherapistSuggestions: (patientId: string) => AiSuggestion[];
  patientAgreeToAiSuggestion: (suggestionId: string) => void;
  patientDeclineAiSuggestion: (suggestionId: string) => void;
  therapistApproveAiSuggestion: (suggestionId: string) => void;
  therapistDeclineAiSuggestion: (suggestionId: string) => void;
  submitGuardianRepsIncreaseRequest: (
    patientId: string,
    exerciseId: string,
    exerciseName: string,
    currentReps: number,
    suggestedReps: number
  ) => void;
};

const PatientRosterContext = createContext<PatientRosterSlice | null>(null);
const PatientChatContext = createContext<PatientChatSlice | null>(null);
const PatientExerciseContext = createContext<PatientExerciseSlice | null>(null);
const PatientGamificationContext = createContext<PatientGamificationSlice | null>(null);
const PatientSyncContext = createContext<PatientSyncSlice | null>(null);
const PatientClinicalContext = createContext<PatientClinicalSlice | null>(null);
const PatientAiQueueContext = createContext<PatientAiQueueSlice | null>(null);

export function PatientDomainProviders({
  roster,
  chat,
  exercise,
  gamification,
  sync,
  clinical,
  aiQueue,
  children,
}: {
  roster: PatientRosterSlice;
  chat: PatientChatSlice;
  exercise: PatientExerciseSlice;
  gamification: PatientGamificationSlice;
  sync: PatientSyncSlice;
  clinical: PatientClinicalSlice;
  aiQueue: PatientAiQueueSlice;
  children: ReactNode;
}) {
  return (
    <PatientRosterContext.Provider value={roster}>
      <PatientChatContext.Provider value={chat}>
        <PatientExerciseContext.Provider value={exercise}>
          <PatientGamificationContext.Provider value={gamification}>
            <PatientSyncContext.Provider value={sync}>
              <PatientClinicalContext.Provider value={clinical}>
                <PatientAiQueueContext.Provider value={aiQueue}>
                  {children}
                </PatientAiQueueContext.Provider>
              </PatientClinicalContext.Provider>
            </PatientSyncContext.Provider>
          </PatientGamificationContext.Provider>
        </PatientExerciseContext.Provider>
      </PatientChatContext.Provider>
    </PatientRosterContext.Provider>
  );
}

export function usePatientRosterContext(): PatientRosterSlice {
  const ctx = useContext(PatientRosterContext);
  if (!ctx) throw new Error('usePatientRoster must be used inside PatientProvider');
  return ctx;
}

export function usePatientChatContext(): PatientChatSlice {
  const ctx = useContext(PatientChatContext);
  if (!ctx) throw new Error('usePatientChat must be used inside PatientProvider');
  return ctx;
}

export function usePatientExerciseContext(): PatientExerciseSlice {
  const ctx = useContext(PatientExerciseContext);
  if (!ctx) throw new Error('usePatientExercisePlans must be used inside PatientProvider');
  return ctx;
}

export function usePatientGamificationContext(): PatientGamificationSlice {
  const ctx = useContext(PatientGamificationContext);
  if (!ctx) throw new Error('usePatientGamification must be used inside PatientProvider');
  return ctx;
}

export function usePatientSyncContext(): PatientSyncSlice {
  const ctx = useContext(PatientSyncContext);
  if (!ctx) throw new Error('usePatientCloudSync must be used inside PatientProvider');
  return ctx;
}

export function usePatientClinicalContext(): PatientClinicalSlice {
  const ctx = useContext(PatientClinicalContext);
  if (!ctx) throw new Error('usePatientClinical must be used inside PatientProvider');
  return ctx;
}

export function usePatientAiQueueContext(): PatientAiQueueSlice {
  const ctx = useContext(PatientAiQueueContext);
  if (!ctx) throw new Error('usePatientAiQueue must be used inside PatientProvider');
  return ctx;
}
