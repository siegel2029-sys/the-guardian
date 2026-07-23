// @refresh reset
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  startTransition,
  type ReactNode,
} from 'react';
import type {
  Patient,
  NavSection,
  Message,
  ExercisePlan,
  DailySession,
  PatientExercise,
  AiSuggestion,
  Exercise,
  PainLevel,
  ExerciseSession,
  SafetyAlert,
  ClinicalSafetyTier,
  DailyHistoryEntry,
  BodyArea,
  SelfCareSessionReport,
  PatientExerciseFinishReport,
  InitialClinicalProfileExtras,
  KnowledgeFact,
  PainRecord,
} from '../types';
import { getClinicalAlertStandardMessage } from '../ai/patientProgressReasoning';
import {
  rollingClinicalDayKeys,
  AI_PROGRAM_LONGITUDINAL_WINDOW_DAYS,
  type AiDevLongitudinalScenario,
} from '../ai/aiProgramLongitudinalGate';
import {
  screenPatientFreeTextForEmergency,
  type EmergencyScreenResult,
} from '../safety/clinicalEmergencyScreening';
import { mockTherapist, mockTherapistB } from '../data/mockData';
import { getClinicalDate, getClinicalYesterday, addClinicalDays } from '../utils/clinicalCalendar';
import { addDevCalendarOffsetDays, bumpDevCalendarOffsetDays } from '../utils/debugMockDate';
import { canPilot11DebugMutatePatient } from '../utils/pilot11GamificationDebug';
import { mergeHistoryFromSessions } from '../utils/dailyHistory';
import {
  pickCanonicalExercisePlan,
  mergeFetchedExercisePlanWithLocal,
  normalizeCachedPatientExercises,
} from '../utils/exercisePlanCanonical';
import {
  savePersistedPatientState,
  PATIENT_STATE_STORAGE_KEY,
  type PersistedPatientStateV1,
} from './patientPersistence';
import {
  ensurePatientAccountsForPatients,
  removePatientAccountsForPatient,
  clearAllPatientAccountsFromStorage,
} from './authPersistence';
import { readPersistedOnce } from '../bootstrap/persistedBootstrap';
import {
  xpRequiredToReachNextLevel,
  clampPatientLevel,
  patientWithLifetimeXp,
  lifetimeXpFromPatient,
} from '../body/patientLevelXp';
import { computeStreakForPatient } from '../utils/exerciseStreak';
import { type GearEquipSlot } from '../config/gearCatalog';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isSupabaseAuthEnabled } from '../lib/patientPortalAuth';
import { ensureSupabaseSessionReady, isAuthSessionMissingMessage } from '../lib/supabaseSessionGuard';
import {
  getAppKbHydratedFromCloud,
  resetAppKbHydrationGate,
  setAppKbHydratedFromCloud,
} from '../lib/kbHydrationGate';
import {
  normalizePatientsTherapistIds,
  patientMatchesTherapistScope,
} from './patientContextRoster';

export { randomPatientPassword } from './patientContextRoster';
import {
  fetchPatients,
  fetchPatientPayloadsForTherapist,
  deletePatientRowFromSupabase,
  fetchActiveExercisePlanForPatient,
  updatePatientExercises,
  upsertPatientRecords,
  upsertTreatmentReport,
  getPatientById,
  fetchUnlinkedPortalPatientIds,
  postgrestHttpStatus,
  mergePatientPayloadForUpsert,
  mergeSessionCompletionByDateMaps,
  mergeKnowledgeFactsForUpsert,
  resolveTherapistIdForSupabaseRls,
} from '../services/clinicalService';
import {
  fetchSessionHistoryBetween,
  mergeDailySessionsWithServerForPatient,
  aggregateFinishReportsFromSessionRows,
  buildSessionCompletionByDateFromDailySessions,
  hydrateDailySessionsFromSessionCompletionMap,
} from '../services/exerciseService';
import { pushPersistedStateToSupabase, pullPersistedState, type PushPersistedStateOptions, type SupabasePushResult } from '../lib/supabaseSync';
import {
  mergeClinicalInsightsSnapshots,
  pullClinicalInsightsFromPatientPayloads,
} from '../utils/clinicalInsightsPayload';
import { touchPatientPortalLastSeenThrottled } from '../services/patientPushNotifications';
import { purgeProactiveAbsenceFromClinicalQueue } from '../ai/proactiveAbsenceAlerts';
import { migratePatientsClinicalIntakeProfiles } from '../utils/clinicalIntakeProfileMigration';
import { useAuth } from './AuthContext';
import { normalizeKnowledgeFactsList, tryBuildManualKnowledgeFactRow } from '../utils/knowledgeFactNormalize';
import { fetchAppKnowledgeBaseFromSupabase } from '../services/gamificationService';
import {
  fetchChatMessages,
  markChatMessagesRead,
  insertPatientChatMessage,
  insertTherapistChatMessage,
  mergeChatMessage,
  mergeChatMessages,
  countUnreadForTherapist,
  subscribeChatMessages,
  type ChatViewerRole,
} from '../services/chatMessages';
import { dispatchTherapistChatPushNotification, fetchPatientChatPushContext } from '../services/therapistChatPush';
import type { MuscleEvolutionStage } from '../body/anatomicalEvolution';
import { useGamification } from '../hooks/useGamification';
import type {
  GearPurchaseResult,
  MountainBackdropContext,
  MountainDailyEnvironmentState,
  PatientAvatarPostureTier,
  PatientRewardFeedback,
} from '../hooks/useGamification';
import {
  getMountainDailyEnvironmentState,
  getMountainBackdropContext,
  getGuardiMountainAmbientLine,
  getPatientAvatarMountainElevationY,
  getPatientAvatarPostureTier,
  getPatientAvatarPostureTorsoPitchOffset,
  getPatientAvatarPhysiqueScale,
  getPatientAvatarStrengthAura,
  getPatientAvatarMuscleVisualStage,
} from '../hooks/gamificationScenery';
import {
  PatientDomainProviders,
  type PatientRosterSlice,
  type PatientChatSlice,
  type PatientExerciseSlice,
  type PatientGamificationSlice,
  type PatientSyncSlice,
} from './patientDomainContexts';
import { useExercisePlan } from '../hooks/useExercisePlan';
import { useClinicalData } from '../hooks/useClinicalData';
import {
  clampPain,
  defaultPatientRewardMeta,
  devClinicalDayKey,
  devSliceExerciseIdsForCompleted,
  recomputePatientAnalyticsAggregates,
  type PatientRewardMeta,
} from './patientDomainHelpers';
import {
  applySessionHistoryAnalyticsHydration,
  hydrateTherapistKnowledgeFactsFromSupabase,
} from './patientContextHydrate';
import {
  cloneExercisePlansForBaseline,
  exercisePlansDeltaForTherapistPush,
} from './patientContextExercise';
import {
  mergePatientForSingleCloudSave,
  mergePatientWithExercisePlanCache,
} from './patientContextPersist';
import {
  logChatAuthNotReady,
  logChatInsertFailed,
  logChatMissingTherapistIdOnPatient,
  logChatMissingTherapistUser,
  logChatTherapistReplyInvoked,
} from './patientContextChat';
import {
  defaultPatientGear,
  normalizePatientGear,
  type PatientGearState,
} from './patientGearUtils';
import { devError, devLog, devWarn, redactId } from '../lib/safeLog';

export type { PatientGearState } from './patientGearUtils';

export const THERAPIST_LOGIN_HUB_LANDING_SESSION_KEY = 'guardian-therapist-login-hub-landing-v1';

/** Re-export gamification types consumers import from PatientContext. */
export type {
  GearPurchaseResult,
  PatientRewardFeedback,
  MountainDailyEnvironmentState,
  MountainBackdropContext,
  PatientAvatarPostureTier,
};
export type { GearEquipSlot } from '../config/gearCatalog';

/**
 * PostgREST auth / validation failures during cloud save.
 * Non-blocking: user feedback flows through `supabaseSyncStatus` / `supabaseSyncError`
 * (shown in the settings panel, plan modal and debug panel) — no window.alert.
 */
function alertIfSupabaseClientFailure(message: string, httpStatus?: number, cause?: unknown) {
  if (isAuthSessionMissingMessage(message)) {
    devWarn('[PatientContext] Skipping cloud save alert — auth session not ready:', { message });
    return;
  }
  const st =
    httpStatus ??
    postgrestHttpStatus(cause) ??
    (/\b401\b/.test(message) ? 401 : /\b400\b/.test(message) ? 400 : undefined);
  if (st === 400 || st === 401) {
    devError(`[PatientContext] Cloud save failed (HTTP ${st})`, { message });
  }
}

// ── Context shape ────────────────────────────────────────────────

interface PatientContextValue {
  // Patients
  patients: Patient[];
  selectedPatient: Patient | null;
  /** Stable id for chat/send even when `selectedPatient` is briefly null during roster hydration. */
  selectedPatientId: string;
  selectPatient: (id: string, options?: { openSection?: NavSection }) => void;

  // Navigation
  activeSection: NavSection;
  setActiveSection: (s: NavSection) => void;

  // Messages
  messages: Message[];
  markMessageRead: (id: string) => void;
  getPatientMessages: (patientId: string) => Message[];
  sendTherapistReply: (patientId: string, content: string) => void;
  /** Simulated patient → therapist (unread for therapist). */
  sendPatientMessage: (patientId: string, content: string) => void;
  /** התראה קלינית ממנוע PHYSIOSHIELD לתיבת המטפל */
  sendAiClinicalAlert: (
    patientId: string,
    detailHebrew?: string,
    tier?: ClinicalSafetyTier
  ) => void;

  /** התראות בטיחות לדשבורד מטפל */
  safetyAlerts: SafetyAlert[];
  dismissSafetyAlert: (alertId: string) => void;
  /** נעילת תרגול אחרי חירום — רק מטפל משחרר */
  isPatientExerciseSafetyLocked: (patientId: string) => boolean;
  clearPatientExerciseSafetyLock: (patientId: string) => void;
  /** מזהה חירום בטקסט מטופל (צ׳אט/הודעה) — מחזיר true אם טופל כחירום */
  screenAndHandleEmergencyText: (patientId: string, text: string, sourceLabel: string) => boolean;
  /** לתצוגת מודל חירום בתצוגת מטופל */
  emergencyModalPatientId: string | null;
  setEmergencyModalPatientId: (id: string | null) => void;

  /** כניסה כמטופל בפורטל — נפרד מדשבורד המטפל */
  isPatientSessionLocked: boolean;
  /**
   * יצירת מטופל + מזהה פורטל קבוע (רמזים) וסיסמה.
   * עם Supabase Auth — נרשם משתמש Auth; בדמו מקומי — גם localStorage.
   */
  createPatientWithAccess: (
    displayName: string,
    access: { portalUsername: string; password?: string }
  ) => Promise<
    | { ok: true; loginId: string; password: string; patientId: string }
    | { ok: false; message: string }
  >;

  // Red flags
  resolveRedFlag: (patientId: string) => void;
  /** דגל אדום ממטופל — רישום בפורטל + סימון דגל (לצד דוא״ל שנפתח ב־UI) */
  reportPatientUrgentRedFlag: (patientId: string, portalLogLine: string) => void;

  /** שדה קשר ישן (מספר בינלאומי) — נשמר ב־localStorage; התראות קליניות בדוא״ל */
  setPatientContactWhatsapp: (patientId: string, phoneDigitsOrEmpty: string) => void;

  // Exercise plans (mutable)
  exercisePlans: ExercisePlan[];
  getExercisePlan: (patientId: string) => ExercisePlan | undefined;
  /** Reads exercisePlansRef — safe immediately after flushSync updates in the same event turn. */
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

  // Daily sessions & לוח קליני (04:00)
  dailySessions: DailySession[];
  /** תאריך קליני נוכחי (מתעדכן אוטומטית, כולל מעבר ב־04:00) */
  clinicalToday: string;
  /** היסטוריה יומית לפי מטופל — מסונכרנת מ־dailySessions */
  dailyHistoryByPatient: Record<string, Record<string, DailyHistoryEntry>>;
  getTodaySession: (patientId: string) => DailySession;
  toggleExercise: (patientId: string, exerciseId: string, xpReward: number) => void;
  /** Patient flow: record pain/effort, award XP, optional red flag, merge daily session. */
  submitExerciseReport: (
    patientId: string,
    exerciseId: string,
    painLevel: number,
    effortRating: number,
    xpReward: number,
    options?: {
      skipPainHistory?: boolean;
      completionSource?: 'rehab' | 'self-care';
      /** אזור תרגול (כוח) או יעד שיקום — לזיהוי שרשרת */
      sessionBodyArea?: BodyArea;
      optionalPoolNoReward?: boolean;
      /** Supabase exercise_plans.id — sent to complete_exercise_safe when is_active row is missing */
      planRowId?: string;
      /** Portal uses patients.payload._exercisePlanCache when exercise_plans has no row */
      isManualPlan?: boolean;
    }
  ) => boolean | Promise<boolean>;

  // AI suggestions (מטופל מאשר → awaiting_therapist; מטפל מאשר → עדכון תוכנית)
  aiSuggestions: AiSuggestion[];
  getPendingAiSuggestions: (patientId: string) => AiSuggestion[];
  getAwaitingTherapistSuggestions: (patientId: string) => AiSuggestion[];
  getTotalAwaitingTherapistCount: () => number;
  /** מטופל: אישור הצעה → נשלחת בקשה למטפל (לא מעדכן תרגיל) */
  patientAgreeToAiSuggestion: (suggestionId: string) => void;
  /** מטופל: דחיית הצעה */
  patientDeclineAiSuggestion: (suggestionId: string) => void;
  /** מטפל: אישור סופי — מיישם שינוי בתוכנית */
  therapistApproveAiSuggestion: (suggestionId: string) => void;
  /** מטפל: דחייה אחרי בקשת מטופל */
  therapistDeclineAiSuggestion: (suggestionId: string) => void;
  /** PHYSIOSHIELD: בקשת העלאת חזרות למטפל */
  submitGuardianRepsIncreaseRequest: (
    patientId: string,
    exerciseId: string,
    exerciseName: string,
    currentReps: number,
    suggestedReps: number
  ) => void;
  /** מטופל: שליחת הצעת שינוי תוכנית (מסך אימונים + Gemini) ישירות למטפל */
  submitPatientAiPlanAdjustmentRequest: (suggestion: AiSuggestion) => void;

  /** בונוס למידה (מטבעות) בתצוגת מטופל */
  grantPatientCoins: (patientId: string, amount: number) => void;
  /**
   * מאמר / הידעת — פרס חד-פעמי לכל articleId (שמור ב-localStorage).
   * דורש שפתיחת הקישור נרשמה ו־readerConfirmed (תיבת סימון).
   */
  markArticleAsRead: (
    patientId: string,
    articleId: string,
    options?: { readerConfirmed?: boolean; didYouKnowLocalCalendarYmd?: string }
  ) => boolean;
  hasReadArticle: (patientId: string, articleId: string) => boolean;
  /** YYYY-MM-DD מקומי שבו נאסף פרס הידעת (או null) — להסתרת הנורה עד מחר */
  getDidYouKnowRewardClaimedLocalYmd: (patientId: string) => string | null;
  /** סימון שלחצו על סמל הידעת ביום מקומי — מנורה סטטית עד מחר */
  recordDidYouKnowTipOpened: (patientId: string, localCalendarYmd: string) => void;
  getDidYouKnowTipOpenedLocalYmd: (patientId: string) => string | null;
  recordArticleLinkOpened: (patientId: string, articleId: string) => void;
  hasArticleLinkOpened: (patientId: string, articleId: string) => boolean;
  hasDailyLoginBonusPending: (patientId: string) => boolean;

  getPatientGear: (patientId: string) => PatientGearState;
  purchaseGearItem: (patientId: string, itemId: string) => GearPurchaseResult;
  /** כינוי ל־purchaseGearItem (תאימות API) */
  purchaseItem: (patientId: string, itemId: string) => GearPurchaseResult;
  equipGearItem: (patientId: string, itemId: string) => boolean;
  unequipGearSlot: (patientId: string, slot: GearEquipSlot) => void;
  /** רכישת פריט חנות 3D (MVP — כדור, משקולת, כלב) */
  purchaseStoreItem: (patientId: string, itemId: string) => import('../config/storeCatalog').StorePurchaseResult;
  equipStoreItem: (patientId: string, itemId: string) => boolean;
  unequipStoreItem: (patientId: string, itemId: string) => void;
  /** בונוס XP לכניסה ראשונה ביום קליני (חד-פעמי ליום) */
  claimDailyLoginBonusIfNeeded: (patientId: string) => boolean;
  /** אות להצגת אנימציית פרס בכותרת הפורטל */
  rewardFeedback: PatientRewardFeedback | null;
  clearRewardFeedback: () => void;

  /** נוף יומי למסע ההר — שמיים/מזג/מבקרים; יציב לפי תאריך קליני (toDateString) */
  getMountainDailyEnvironmentState: (clinicalYmd: string) => MountainDailyEnvironmentState;
  getMountainBackdropContext: (level: number, clinicalYmd: string) => MountainBackdropContext;
  /** שורת מזג/טבע לגארדי — לעיתים null */
  getGuardiMountainAmbientLine: (clinicalYmd: string, level?: number) => string | null;
  /** גובה אנכי לאווטאר המטופל במסע ההר (לא לגארדי) */
  getPatientAvatarMountainElevationY: (level: number) => number;
  getPatientAvatarPostureTier: (level: number) => PatientAvatarPostureTier;
  getPatientAvatarPostureTorsoPitchOffset: (level: number) => number;
  getPatientAvatarPhysiqueScale: (level: number) => [number, number, number];
  getPatientAvatarStrengthAura: (level: number) => {
    enabled: boolean;
    intensity: number;
    thickness: number;
  };
  getPatientAvatarMuscleVisualStage: (level: number) => MuscleEvolutionStage;

  /** אזור גוף + תוכנית התחלתית מספרייה (אונבורדינג מטופל חדש/ממתין) */
  applyInitialClinicalProfile: (
    patientId: string,
    primaryBodyArea: BodyArea,
    libraryExerciseIds: string[],
    extras?: InitialClinicalProfileExtras
  ) => void;

  /** הערות מטפל — נשמרות ב-localStorage */
  updateTherapistNotes: (patientId: string, notes: string) => void;
  /**
   * שמירת הערכה קלינית + יצירת הצעת תרגיל pending למטופל (לפי המלצת המערכת והנתונים).
   */
  runClinicalAssessmentEngine: (patientId: string, notes: string) => void;

  /**
   * החלפת תוכנית התרגול המלאה לפי תוצאות אינטייק קליני (תרגילים מהספרייה).
   */
  applyIntakeExercisePlan: (patientId: string, exercises: Exercise[], primaryBodyArea: BodyArea) => void;

  /**
   * מחיקת מטופל מהמערכת (כולל auth פורטל).
   * עם Supabase: ממתין למחיקת השורה בשרת לפני ניקוי מצב מקומי — אם נכשל, הנתונים המקומיים נשמרים.
   */
  deletePatient: (patientId: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** מיזוג חלקי לשדות מטופל — מצב מקומי (localStorage) + אפשרות לדחיפה ל-Supabase בנפרד */
  updatePatient: (
    patientId: string,
    patch: Partial<Omit<Patient, 'id' | 'therapistId'>>
  ) => void;
  /**
   * דיבוג בלבד: רמה 1, XP 0, מטבעות 0, איפוס ציוד (owned/equipped) — נשמר ב־localStorage.
   */
  resetPatientToCleanAvatar: (patientId: string) => void;
  /** דיבוג: 7 ימים רצופים עם דיווח ב־dailySessions + sessionHistory */
  devMockSevenDayExerciseHistory: (patientId: string) => void;
  /** דיבוג: מוחק סשן של אתמול — שובר רצף */
  devBreakStreakRemoveYesterday: (patientId: string) => void;
  /** דיבוג: ±XP מצטבר (כולל עליות/ירידות רמה) */
  devAdjustPatientLifetimeXp: (patientId: string, delta: number) => void;
  devSetPatientLifetimeXp: (patientId: string, lifetimeXp: number) => void;
  /** דיבוג: יום קלנדרי +1, איפוס יומי (הידעת, סשן, פרהאב) — רענון מיידי */
  devSkipToNextCalendarDay: (patientId: string) => void;
  /** דיבוג: דילוג מספר ימים קליניים קדימה (חוזר על לוגיקת «יום הבא») */
  devSkipClinicalDaysAhead: (patientId: string, days: number) => void;
  /** דיבוג: מילוי 4 הימים האחרונים בנתונים סינתטיים לבדיקת שער הצעות AI */
  devSeedAiLongitudinalWindow: (patientId: string, scenario: AiDevLongitudinalScenario) => void;
  /** דיבוג: יום קלנדרי −1 — נתונים לפי אותו תאריך בעבר (ללא מחיקת היסטוריה) */
  devSkipToPreviousCalendarDay: (patientId: string) => void;
  resetPatientExercisePlan: (patientId: string) => void;
  resetPatientMessageHistory: (patientId: string) => void;
  resetPatientPainReports: (patientId: string) => void;

  /** הדגשת מקטע אנטומי כ«פגיעה» (זוהר אדום ב־3D) — מתג */
  togglePatientInjuryHighlight: (patientId: string, area: BodyArea) => void;
  clearPatientInjuryHighlights: (patientId: string) => void;
  /**
   * מפת מטפל: מחזור מוקד ראשי (אדום) / משני (כתום) / כבוי לפי מקטע.
   */
  cycleTherapistBodyMapClinical: (patientId: string, area: BodyArea) => void;
  /** מוקד פעיל (אזור ראשי) — מעדכן primary ומסנכרן סינון פרהאב */
  setTherapistPrimaryBodyArea: (patientId: string, area: BodyArea) => void;
  /** רשימת מוקדי כאב ראשיים/משניים + primaryBodyArea — מנקה נעילות מקטע */
  applyTherapistPainFields: (
    patientId: string,
    fields: {
      injuryHighlightSegments: BodyArea[];
      secondaryClinicalBodyAreas: BodyArea[];
      primaryBodyArea: BodyArea;
    }
  ) => void;

  /** אזורי פרהאב/כוח שנבחרו על ידי המטופל (לא כולל אזור קליני ראשי) */
  getSelfCareZones: (patientId: string) => BodyArea[];
  toggleSelfCareZone: (patientId: string, area: BodyArea) => void;
  /** דיווחי תרגילי self-care לפי תאריך קליני */
  logSelfCareSession: (
    patientId: string,
    exerciseId: string,
    exerciseName: string,
    effortRating: number
  ) => void;
  getSelfCareReportsForPatient: (patientId: string) => SelfCareSessionReport[];
  getSelfCareReportsForClinicalDay: (patientId: string, clinicalDate: string) => SelfCareSessionReport[];

  /** דיווחי סיום מתוך מודאל האימון (נשמרים ב-localStorage) */
  patientExerciseFinishReportsByPatientId: Record<string, PatientExerciseFinishReport[]>;
  appendPatientExerciseFinishReport: (
    patientId: string,
    entry: Omit<PatientExerciseFinishReport, 'id' | 'patientId' | 'timestamp'>
  ) => void | Promise<void>;
  getPatientExerciseFinishReports: (patientId: string) => PatientExerciseFinishReport[];

  /** רמת קושי לתרגיל כוח לפי אזור (0–2 → שלבי שרשרת L1–L3) */
  getSelfCareStrengthTier: (patientId: string, area: BodyArea) => 0 | 1 | 2;
  setSelfCareStrengthTier: (patientId: string, area: BodyArea, tier: 0 | 1 | 2) => void;

  /**
   * Hybrid persistence: האפליקציה קוראת מ־localStorage (מהירות); Supabase — דחיפה ידנית בשלב זה,
   * לפני סנכרון מלא דו־כיווני.
   */
  supabaseConfigured: boolean;
  supabaseSyncStatus: 'idle' | 'saving' | 'saved' | 'error';
  supabaseSyncError: string | null;
  supabaseLastSavedAt: string | null;
  /**
   * IDs of patients whose portal account was created but `auth_user_id` is still
   * NULL (patient has never signed into the portal).  Populated after the therapist
   * patient list loads.  Does NOT affect therapist saves — only blocks patient
   * portal access until the patient signs in for the first time.
   */
  unlinkedPortalPatientIds: string[];
  savePersistedStateToCloud: (options?: {
    exercisePlanChangeSummaryByPatientId?: Record<string, string>;
    immediate?: boolean;
    onPushComplete?: (result: SupabasePushResult) => void;
    persistSnapshotOverride?: PersistedPatientStateV1;
    /** Therapist KB deletes: merge drops server-only facts */
    trustKnowledgeFactDeletions?: boolean;
  }) => Promise<boolean>;
  /**
   * שורת `patients` אחת ל-Supabase (כולל `payload` / תיעוד טיפולים) + מיזוג מיידי של התגובה ל-state.
   * עדיף על סנכרון מלא מדורג כשחייבים לשמור את אותו snapshot שהמשתמש ראה בלחיצה.
   */
  saveSinglePatientPayloadToCloud: (
    patient: Patient,
    options?: { trustIncomingAccountControl?: boolean }
  ) => Promise<boolean>;
  /** שמירת תוכנית תרגילים לטבלה `exercise_plans` (+ רענון מהשרת בעת הצלחה). למטפל בלבד. */
  saveExercisePlanForPatientToCloud: (
    patientId: string,
    exercises: PatientExercise[],
    options?: { changeSummary?: string; forceSave?: boolean }
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** עדכון `patients.payload._exercisePlanCache` בלבד (ללא `exercise_plans`) — למסלול תוכנית ידנית / RLS */
  persistExercisePlanCacheForPatient: (
    patientId: string,
    exercises: PatientExercise[]
  ) => Promise<{ ok: true } | { ok: false; message: string }>;
  /** החלפת רשימת תרגילים בזיכרון (דשבורד מטפל) */
  replaceExercisePlanForPatient: (patientId: string, exercises: PatientExercise[]) => void;

  /** בסיס ידע "הידעת?" — אישור מטפל וסנכרון */
  knowledgeFacts: KnowledgeFact[];
  addManualKnowledgeFact: (input: {
    teaser: string;
    title: string;
    explanation: string;
    sourceUrl: string;
  }) => void;
  deleteKnowledgeFactAndForceCloudSave: (factId: string) => void;
  /** טעינה מ־Supabase — מחליפה את רשימת העובדות מהענן */
  refreshKnowledgeBaseFromCloud: () => Promise<void>;
  /** true לאחר טעינת app_knowledge_base מהענן מאז הריענון (דשבורד מטפל + Auth). */
  hasHydratedKbFromCloud: boolean;
}

const PatientContext = createContext<PatientContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────

export function PatientProvider({
  children,
  restrictPatientSessionId = null,
  therapistScopeIds = null,
}: {
  children: ReactNode;
  /** כשמוגדר — רק מטופל זה, ללא דשבורד מטפל */
  restrictPatientSessionId?: string | null;
  /** מטפל מחובר — סינון רשימת מטופלים (תומך בכינוי דמו + UUID מ-Supabase) */
  therapistScopeIds?: string[] | null;
}) {
  const {
    isAuthenticated,
    therapist,
    therapistPatientScopeIds,
    sessionRole,
    isLoading: authLoading,
  } = useAuth();

  const [clinicalTick, setClinicalTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setClinicalTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const [allPatients, setAllPatients] = useState<Patient[]>(() => {
    if (isSupabaseAuthEnabled()) return [];
    const persisted = readPersistedOnce().patient;
    const base = persisted?.patients ?? [];
    return normalizePatientsTherapistIds(base, {});
  });
  const allPatientsRef = useRef(allPatients);
  allPatientsRef.current = allPatients;

  const patients = useMemo(() => {
    if (restrictPatientSessionId) {
      return allPatients.filter((p) => p.id === restrictPatientSessionId);
    }
    if (therapistScopeIds && therapistScopeIds.length > 0) {
      return allPatients.filter((p) => patientMatchesTherapistScope(p, therapistScopeIds));
    }
    return allPatients;
  }, [allPatients, therapistScopeIds, restrictPatientSessionId]);

  const [selectedPatientId, setSelectedPatientId] = useState<string>(() => {
    if (isSupabaseAuthEnabled()) {
      return restrictPatientSessionId ?? '';
    }
    const persisted = readPersistedOnce().patient;
    const listAll = normalizePatientsTherapistIds(persisted?.patients ?? [], {});
    if (restrictPatientSessionId && listAll.some((p) => p.id === restrictPatientSessionId)) {
      return restrictPatientSessionId;
    }
    const scoped =
      therapistScopeIds && therapistScopeIds.length > 0
        ? listAll.filter((p) => patientMatchesTherapistScope(p, therapistScopeIds))
        : listAll;
    const id = persisted?.selectedPatientId;
    if (id && scoped.some((p) => p.id === id)) return id;
    return '';
  });
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [messages, setMessages] = useState<Message[]>(() => {
    if (isSupabaseAuthEnabled()) return [];
    const persisted = readPersistedOnce().patient;
    return persisted?.messages ?? [];
  });
  const [exercisePlans, setExercisePlans] = useState<ExercisePlan[]>(() => {
    if (isSupabaseAuthEnabled()) return [];
    const persisted = readPersistedOnce().patient;
    return persisted?.exercisePlans ?? [];
  });
  const exercisePlansRef = useRef(exercisePlans);
  exercisePlansRef.current = exercisePlans;

  const readExercisePlanSnapshot = useCallback((patientId: string): PatientExercise[] => {
    const plan = pickCanonicalExercisePlan(exercisePlansRef.current, patientId);
    if (!plan?.exercises?.length) return [];
    return normalizeCachedPatientExercises(plan.exercises);
  }, []);
  const [dailySessions, setDailySessions] = useState<DailySession[]>(() => {
    if (isSupabaseAuthEnabled()) return [];
    const persisted = readPersistedOnce().patient;
    return persisted?.dailySessions ?? [];
  });
  const dailySessionsRef = useRef(dailySessions);
  dailySessionsRef.current = dailySessions;

  const [dailyHistoryByPatient, setDailyHistoryByPatient] = useState<
    Record<string, Record<string, DailyHistoryEntry>>
  >(() => {
    if (isSupabaseAuthEnabled()) return {};
    const persisted = readPersistedOnce().patient;
    return mergeHistoryFromSessions(
      persisted?.dailySessions ?? [],
      persisted?.exercisePlans ?? [],
      {}
    );
  });
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>(() => {
    if (isSupabaseAuthEnabled()) return [];
    const persisted = readPersistedOnce().patient;
    return persisted?.aiSuggestions ?? [];
  });
  const [safetyAlerts, setSafetyAlerts] = useState<SafetyAlert[]>(() => {
    if (isSupabaseAuthEnabled()) return [];
    const persisted = readPersistedOnce().patient;
    return persisted?.safetyAlerts ?? [];
  });
  const [exerciseSafetyLockedPatientIds, setExerciseSafetyLockedPatientIds] = useState<
    Record<string, boolean>
  >(() => {
    if (isSupabaseAuthEnabled()) return {};
    const persisted = readPersistedOnce().patient;
    return persisted?.exerciseSafetyLockedPatientIds ?? {};
  });
  const [emergencyModalPatientId, setEmergencyModalPatientId] = useState<string | null>(null);
  const [selfCareZonesByPatientId, setSelfCareZonesByPatientId] = useState<
    Record<string, BodyArea[]>
  >(() => {
    if (isSupabaseAuthEnabled()) return {};
    return readPersistedOnce().patient?.selfCareZonesByPatientId ?? {};
  });
  const [selfCareReportsByPatientId, setSelfCareReportsByPatientId] = useState<
    Record<string, SelfCareSessionReport[]>
  >(() => {
    if (isSupabaseAuthEnabled()) return {};
    return readPersistedOnce().patient?.selfCareReportsByPatientId ?? {};
  });
  const [patientExerciseFinishReportsByPatientId, setPatientExerciseFinishReportsByPatientId] =
    useState<Record<string, PatientExerciseFinishReport[]>>(() => {
      if (isSupabaseAuthEnabled()) return {};
      return readPersistedOnce().patient?.patientExerciseFinishReportsByPatientId ?? {};
    });
  const [selfCareStrengthTierByPatientId, setSelfCareStrengthTierByPatientId] = useState<
    Record<string, Partial<Record<BodyArea, 0 | 1 | 2>>>
  >(() => {
    if (isSupabaseAuthEnabled()) return {};
    return readPersistedOnce().patient?.selfCareStrengthTierByPatientId ?? {};
  });

  const [patientRewardMetaByPatientId, setPatientRewardMetaByPatientId] = useState<
    Record<string, PatientRewardMeta>
  >(() => {
    if (isSupabaseAuthEnabled()) return {};
    const raw = readPersistedOnce().patient?.patientRewardMetaByPatientId ?? {};
    const out: Record<string, PatientRewardMeta> = {};
    for (const [pid, v] of Object.entries(raw)) {
      out[pid] = {
        readArticleIds: [...(v?.readArticleIds ?? [])],
        lastLoginBonusClinicalDate: v?.lastLoginBonusClinicalDate ?? null,
        articleLinkOpenedIds: [...(v?.articleLinkOpenedIds ?? [])],
        dykRewardClaimedLocalYmd: v?.dykRewardClaimedLocalYmd ?? null,
        dykTipOpenedLocalYmd: v?.dykTipOpenedLocalYmd ?? null,
      };
    }
    return out;
  });

  const [patientGearByPatientId, setPatientGearByPatientId] = useState<
    Record<string, PatientGearState>
  >(() => {
    if (isSupabaseAuthEnabled()) return {};
    const raw = readPersistedOnce().patient?.patientGearByPatientId ?? {};
    const out: Record<string, PatientGearState> = {};
    for (const [pid, v] of Object.entries(raw)) {
      out[pid] = normalizePatientGear(v);
    }
    return out;
  });

  const [knowledgeFacts, setKnowledgeFacts] = useState<KnowledgeFact[]>(() => {
    if (isSupabaseAuthEnabled()) return [];
    const persisted = readPersistedOnce().patient;
    return normalizeKnowledgeFactsList(persisted?.knowledgeFacts);
  });
  const knowledgeFactsRef = useRef(knowledgeFacts);
  knowledgeFactsRef.current = knowledgeFacts;

  /** מאז ריענון: האם בוצעה טעינת app_knowledge_base מהענן (משמש נעילת upsert). */
  const [hasHydratedKbFromCloud, setHasHydratedKbFromCloud] = useState(false);

  const markKbHydratedFromCloudCb = useCallback(() => {
    setAppKbHydratedFromCloud(true);
    setHasHydratedKbFromCloud(true);
  }, []);

  /** צילום תוכניות מתאר טעינת דשבורד המטפל — דוחפים רק שינויי תוכן לעומתו */
  const exercisePlansSessionBaselineRef = useRef<ExercisePlan[] | null>(null);

  useEffect(() => {
    const isTherapistDashboard =
      sessionRole === 'therapist' && isAuthenticated && !restrictPatientSessionId;
    if (isTherapistDashboard) return;
    resetAppKbHydrationGate();
    setHasHydratedKbFromCloud(false);
    exercisePlansSessionBaselineRef.current = null;
  }, [sessionRole, isAuthenticated, restrictPatientSessionId]);

  /** אחרי הוספת טיפ — לא למשוך מ-app_knowledge_base למשך כמה שניות (מונע בועה נעלמת עד settle ב-DB). */
  const suppressAppKbCloudFetchUntilRef = useRef(0);
  const KB_CLOUD_FETCH_COOLDOWN_MS_AFTER_TIP_SAVE = 5000;

  /** רענון/אתחול: app_knowledge_base + aggregation של knowledgeFacts מכל ה-payloads ב-snapshot (בטעינה מועבר mergedPatientsForCloud מהשרת). */
  const refreshKnowledgeBaseFromCloudMerged = useCallback(
    async (patientsSnapshotOverride?: Patient[]) => {
      if (!supabase) return;
      const snapshot = patientsSnapshotOverride ?? allPatientsRef.current;
      await hydrateTherapistKnowledgeFactsFromSupabase(
        supabase,
        snapshot,
        setKnowledgeFacts,
        knowledgeFactsRef.current,
        {
          suppressCloudKbFetchUntilMs: suppressAppKbCloudFetchUntilRef.current,
          forceFreshKbFetch: true,
          markHydratedFromCloud: markKbHydratedFromCloudCb,
        }
      );
    },
    [supabase, markKbHydratedFromCloudCb]
  );

  const [supabaseSyncStatus, setSupabaseSyncStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [supabaseSyncError, setSupabaseSyncError] = useState<string | null>(null);
  const [supabaseLastSavedAt, setSupabaseLastSavedAt] = useState<string | null>(null);
  const [unlinkedPortalPatientIds, setUnlinkedPortalPatientIds] = useState<string[]>([]);

  /**
   * Mutex: prevents two concurrent savePersistedStateToCloud calls from racing each other
   * and causing a double-insert on exercise_plans (→ unique constraint violation).
   * Stores the in-flight promise; callers await it before starting a new save.
   */
  const cloudSaveMutexRef = useRef<Promise<boolean> | null>(null);

  /**
   * דחיית דחיפה לענן (מטפל + plans + בסיס ידע).
   * שינוי בתוכניות נשמר רק כשהשינוי אמיתי — ראו {@link upsertExercisePlans} (השוואת payload לפני גרסה חדשה).
   */
  const CLOUD_SAVE_DEBOUNCE_MS = 2800;
  const cloudSaveDebounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accumulatedCloudSaveOptionsRef = useRef<{
    exercisePlanChangeSummaryByPatientId?: Record<string, string>;
    onPushComplete?: (result: SupabasePushResult) => void;
    persistSnapshotOverride?: PersistedPatientStateV1;
    trustKnowledgeFactDeletions?: boolean;
    appendKnowledgeDeletedSeedIds?: string[];
  } | null>(null);
  const cloudSaveDebouncedResolversRef = useRef<Array<(ok: boolean) => void>>([]);
  /** True while a cloud push is actively in flight after acquiring the mutex (full or plan save). */
  const cloudSaveInFlightRef = useRef(false);
  /** Blocks a second explicit exercise-plan cloud save before the previous one finishes. */
  const exercisePlanCloudSaveBusyRef = useRef(false);

  useEffect(() => {
    return () => {
      if (cloudSaveDebounceTimerRef.current) {
        clearTimeout(cloudSaveDebounceTimerRef.current);
        cloudSaveDebounceTimerRef.current = null;
      }
    };
  }, []);

  const isPatientSessionLocked = restrictPatientSessionId != null && restrictPatientSessionId !== '';

  useEffect(() => {
    if (!restrictPatientSessionId) return;
    setSelectedPatientId(restrictPatientSessionId);
  }, [restrictPatientSessionId]);

  useEffect(() => {
    ensurePatientAccountsForPatients(
      allPatients.map((p) => ({
        id: p.id,
        therapistId: p.therapistId,
        portalUsername: p.portalUsername,
      }))
    );
  }, [allPatients]);

  /** Debug: Supabase auth uid vs. therapist scope used to filter the list (see App.tsx therapistScopeIds). */
  useEffect(() => {
    if (restrictPatientSessionId) return;
    if (sessionRole !== 'therapist') return;
    let cancelled = false;
    void (async () => {
      const authUserId = supabase ? (await supabase.auth.getUser()).data.user?.id ?? null : null;
      if (cancelled) return;
      console.log('[Patients load scope]', {
        authUserId,
        therapistId: therapist?.id ?? null,
        therapistScopeIdsFiltered: therapistScopeIds,
        therapistPatientScopeIds,
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    restrictPatientSessionId,
    sessionRole,
    therapist?.id,
    therapistScopeIds,
    therapistPatientScopeIds,
  ]);

  /**
   * Non-demo Supabase therapists: remap legacy demo therapist ids on stored patients so RLS scope (real UID) matches.
   */
  useEffect(() => {
    if (!isSupabaseAuthEnabled() || !therapist) return;
    const em = therapist.email.trim().toLowerCase();
    if (em === mockTherapist.email.toLowerCase() || em === mockTherapistB.email.toLowerCase()) return;

    setAllPatients((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        if (p.therapistId === mockTherapist.id || p.therapistId === mockTherapistB.id) {
          changed = true;
          return { ...p, therapistId: therapist.id };
        }
        return p;
      });
      return changed ? next : prev;
    });
  }, [therapist?.id, therapist?.email]);

  /**
   * סנכרון מלא מ־Supabase לפורטל מטופל: `payload` + תוכנית פעילה מ־`exercise_plans`.
   */
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    if (!restrictPatientSessionId) return;
    if (authLoading || !isAuthenticated) return;

    const supabaseClient = supabase;

    devLog('[PatientPortal] מתחיל טעינת נתוני מטופל מ-Supabase', {
      patientId: redactId(restrictPatientSessionId),
      isAuthenticated,
      authLoading,
    });

    let cancelled = false;
    void (async () => {
      const res = await getPatientById(supabaseClient, restrictPatientSessionId);

      if (cancelled) return;
      if (res.ok === false) {
        devWarn('[PatientPortal] טעינת נתוני מטופל נכשלה', {
          patientId: redactId(restrictPatientSessionId),
          reason: res.message,
          hint: 'RLS may block patients row read for portal session',
        });
        return;
      }

      const { patient: fetched, exercisePlan } = res;
      devLog('[PatientPortal] נתוני מטופל התקבלו', {
        patientId: redactId(fetched.id),
        exercisePlanFound: !!exercisePlan,
        exerciseCount: exercisePlan?.exercises.length ?? 0,
      });

      // Non-blocking last-seen ping (throttled via localStorage + in-memory gate).
      void touchPatientPortalLastSeenThrottled(fetched.id);

      const clinicalDayForMerge = getClinicalDate();
      const histStart = addClinicalDays(clinicalDayForMerge, -30);
      const histRows = await fetchSessionHistoryBetween(
        supabaseClient,
        restrictPatientSessionId,
        histStart,
        clinicalDayForMerge
      );
      if (!cancelled && histRows && histRows.length > 0) {
        const totalCompletedSlots = histRows.reduce(
          (n, r) => n + (r.completedIds?.length ?? 0),
          0
        );
        const todayRow = histRows.find((r) => r.date === clinicalDayForMerge);
        devLog('[HYDRATE_COMPLETION] patient portal — session_history from cloud', {
          patientId: redactId(restrictPatientSessionId),
          daysWithRows: histRows.length,
          totalCompletedExerciseSlots: totalCompletedSlots,
          todayCompletedCount: todayRow?.completedIds?.length ?? 0,
        });
        setDailySessions((prev) =>
          mergeDailySessionsWithServerForPatient(prev, restrictPatientSessionId, histRows)
        );
      }

      const fromHistory =
        histRows && histRows.length > 0
          ? buildSessionCompletionByDateFromDailySessions(histRows)
          : undefined;
      const fetchedEnriched: Patient = {
        ...fetched,
        _sessionCompletionByDate: mergeSessionCompletionByDateMaps(
          fetched._sessionCompletionByDate,
          fromHistory
        ),
      };

      const prevPatients = allPatientsRef.current;
      const prevIx = prevPatients.findIndex((p) => p.id === fetchedEnriched.id);
      const mergedForCloud: Patient =
        prevIx < 0
          ? mergePatientPayloadForUpsert(undefined, fetchedEnriched, {
              clinicalToday: clinicalDayForMerge,
            })
          : mergePatientPayloadForUpsert(fetchedEnriched, prevPatients[prevIx], {
              clinicalToday: clinicalDayForMerge,
            });

      const planCountForHist = exercisePlan?.exercises.length ?? 0;
      const mergedWithSessionAnalytics =
        histRows && histRows.length > 0
          ? applySessionHistoryAnalyticsHydration(mergedForCloud, histRows, planCountForHist)
          : mergedForCloud;

      setAllPatients((prev) => {
        const ix = prev.findIndex((p) => p.id === fetchedEnriched.id);
        if (ix < 0) return [...prev, mergedWithSessionAnalytics];
        const next = [...prev];
        next[ix] = mergedWithSessionAnalytics;
        return next;
      });

      if (!cancelled) {
        const completionMap = mergedWithSessionAnalytics._sessionCompletionByDate;
        if (!histRows?.length && completionMap) {
          setDailySessions((prev) =>
            hydrateDailySessionsFromSessionCompletionMap(
              prev,
              restrictPatientSessionId,
              completionMap
            )
          );
        }
        if (
          mergedWithSessionAnalytics.id.trim() === restrictPatientSessionId.trim()
        ) {
          const syncRes = await upsertPatientRecords(
            supabaseClient,
            [mergedWithSessionAnalytics],
            new Date().toISOString(),
            { onlyPatientId: restrictPatientSessionId }
          );
          if (syncRes.ok === false && import.meta.env.DEV) {
            console.warn(
              '[PatientPortal] אחרי מיזוג מקומי+שרת — upsertPatientRecords נכשל',
              syncRes.message
            );
          }
        } else if (import.meta.env.DEV) {
          console.warn('[PatientPortal] skipping upsertPatientRecords — patient id mismatch', {
            sessionId: restrictPatientSessionId,
            mergedId: mergedWithSessionAnalytics.id,
          });
        }
      }

      const pid = fetched.id;
      setExercisePlans((prev) => {
        const rest = prev.filter((ep) => ep.patientId !== pid);
        const planSlice: ExercisePlan =
          exercisePlan ?? { patientId: pid, exercises: [] };
        return [
          ...rest,
          {
            ...planSlice,
            exercises: normalizeCachedPatientExercises(planSlice.exercises),
          },
        ];
      });

      // Fetch the global knowledge base so the 💡 "Did you know?" bubble is visible
      // in the patient portal. Supabase-auth sessions start with knowledgeFacts = []
      // because the therapist-scoped localStorage snapshot is not available.
      const portalTherapistId = fetched.therapistId?.trim();
      if (portalTherapistId) {
        console.warn(`[TIP_SYNC] Initializing fetch for Therapist ID: ${portalTherapistId}`);
      }
      try {
        const kbRes = await fetchAppKnowledgeBaseFromSupabase(supabaseClient, {
          approvedOnly: true,
          therapistAuthUserId: portalTherapistId,
        });
        if (!cancelled) {
          setKnowledgeFacts((prev) => mergeKnowledgeFactsForUpsert(kbRes?.items ?? [], prev));
        }
      } catch (e) {
        console.warn('[TIP_SYNC] fetchAppKnowledgeBaseFromSupabase failed — keeping prior tips', {
          patientId: restrictPatientSessionId,
          message: e instanceof Error ? e.message : String(e),
        });
      }

      const chatRes = await fetchChatMessages(supabaseClient, {
        patientId: restrictPatientSessionId,
        viewer: 'patient',
      });
      if (!cancelled && chatRes.ok) {
        setMessages((prev) => mergeChatMessages(prev, chatRes.messages, 'patient'));
      } else if (!cancelled && chatRes.ok === false && import.meta.env.DEV) {
        console.warn('[PatientPortal] fetchChatMessages', chatRes.message);
      }
    })();
    return () => { cancelled = true; };
  }, [restrictPatientSessionId, authLoading, isAuthenticated, supabase]);

  /** Hydrate patient list from Supabase (RLS returns only rows for the signed-in therapist). */
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    if (restrictPatientSessionId) return;
    if (authLoading) return;
    if (sessionRole !== 'therapist') return;
    if (!isAuthenticated || !therapist?.id) return;

    const supabaseClient = supabase;

    let cancelled = false;
    void (async () => {
      const res = await fetchPatients(supabaseClient);
      if (cancelled) return;
      if (res.ok === false) {
        console.warn('[PatientContext] fetchPatients failed — keeping current patient state', res.message);
        if (!cancelled) {
          await refreshKnowledgeBaseFromCloudMerged([]);
        }
        return;
      }
      const list = res.patients;

      if (list.length === 0) {
        const prevCount = allPatientsRef.current.length;
        if (prevCount > 0) {
          console.warn(
            '[PatientContext] Supabase returned 0 patients but local state still has',
            prevCount,
            '— not wiping (check patients.therapist_id vs auth.uid() in Network → patients request)'
          );
          return;
        }

        // Server is authoritative when there was no local roster: clear caches so stale data can't block re-creation
        try { localStorage.removeItem(PATIENT_STATE_STORAGE_KEY); } catch { /* ignore */ }
        try { clearAllPatientAccountsFromStorage(); } catch { /* ignore */ }

        setAllPatients([]);
        setSelectedPatientId('');
        setMessages([]);
        setExercisePlans([]);
        setDailySessions([]);
        setAiSuggestions([]);
        setSafetyAlerts([]);
        setExerciseSafetyLockedPatientIds({});
        setSelfCareZonesByPatientId({});
        setSelfCareReportsByPatientId({});
        setPatientExerciseFinishReportsByPatientId({});
        setSelfCareStrengthTierByPatientId({});
        setPatientRewardMetaByPatientId({});
        setPatientGearByPatientId({});
        exercisePlansSessionBaselineRef.current = [];
        await refreshKnowledgeBaseFromCloudMerged([]);
        setEmergencyModalPatientId(null);
        return;
      }

      const clinicalDayForMerge = getClinicalDate();
      const prevPatientsSnapshot = allPatientsRef.current;
      const normalizedServer = normalizePatientsTherapistIds(list, {
        fallbackTherapistId: therapist.id,
      });

      let mergedKbAfterHydrate: KnowledgeFact[] = [];
      if (!cancelled) {
        mergedKbAfterHydrate = await hydrateTherapistKnowledgeFactsFromSupabase(
          supabaseClient,
          normalizedServer,
          setKnowledgeFacts,
          knowledgeFactsRef.current,
          {
            suppressCloudKbFetchUntilMs: suppressAppKbCloudFetchUntilRef.current,
            forceFreshKbFetch: true,
            markHydratedFromCloud: markKbHydratedFromCloudCb,
          }
        );
      }

      let mergedPatientsForCloud: Patient[] = [];
      if (!cancelled) {
        const localById = new Map(prevPatientsSnapshot.map((p) => [p.id, p]));
        const kbSnap = mergedKbAfterHydrate;
        const mergedFromServer = normalizedServer.map((serverP) => {
          const local = localById.get(serverP.id);
          if (local) {
            const localDraft =
              kbSnap.length > 0 ? { ...local, knowledgeFacts: kbSnap } : local;
            return mergePatientPayloadForUpsert(serverP, localDraft, {
              clinicalToday: clinicalDayForMerge,
            });
          }
          return mergePatientPayloadForUpsert(undefined, serverP, {
            clinicalToday: clinicalDayForMerge,
          });
        });
        const serverIds = new Set(mergedFromServer.map((p) => p.id));
        const localOnly = prevPatientsSnapshot.filter((p) => !serverIds.has(p.id));
        mergedPatientsForCloud = [...mergedFromServer, ...localOnly];
        const intakeMigration = migratePatientsClinicalIntakeProfiles(mergedPatientsForCloud);
        if (intakeMigration.migratedPatientIds.length > 0 && import.meta.env.DEV) {
          console.info('[PatientContext] clinical intake profile legacy migration', {
            migratedCount: intakeMigration.migratedPatientIds.length,
            patientIds: intakeMigration.migratedPatientIds,
          });
        }
        mergedPatientsForCloud = intakeMigration.patients;
        setAllPatients(mergedPatientsForCloud);
      }

      if (!cancelled && mergedPatientsForCloud.length > 0) {
        const patientsForUpsert =
          mergedKbAfterHydrate.length > 0
            ? mergedPatientsForCloud.map((p) => ({ ...p, knowledgeFacts: mergedKbAfterHydrate }))
            : mergedPatientsForCloud;
        const syncRes = await upsertPatientRecords(
          supabaseClient,
          patientsForUpsert,
          new Date().toISOString()
        );
        if (syncRes.ok === false && import.meta.env.DEV) {
          console.warn('[PatientContext] אחרי מיזוג טעינת מטפל — upsertPatientRecords נכשל', syncRes.message);
        }
      }

      setExercisePlans(res.exercisePlans);
      exercisePlansSessionBaselineRef.current = cloneExercisePlansForBaseline(res.exercisePlans);

      const remoteInsights = pullClinicalInsightsFromPatientPayloads(normalizedServer);
      setAiSuggestions((prev) =>
        mergeClinicalInsightsSnapshots(
          { aiSuggestions: prev, safetyAlerts: [] },
          remoteInsights
        ).aiSuggestions
      );
      setSafetyAlerts((prev) =>
        mergeClinicalInsightsSnapshots(
          { aiSuggestions: [], safetyAlerts: prev },
          remoteInsights
        ).safetyAlerts
      );

      // After loading patients, check which portal accounts are still unlinked
      // (auth_user_id = NULL). This doesn't affect therapist saves but does block
      // patient portal access until each patient signs in for the first time.
      void fetchUnlinkedPortalPatientIds(supabaseClient).then(({ patientIds }) => {
        if (!cancelled) setUnlinkedPortalPatientIds(patientIds);
      });

      const chatRes = await fetchChatMessages(supabaseClient, { viewer: 'therapist' });
      if (!cancelled && chatRes.ok) {
        setMessages((prev) => mergeChatMessages(prev, chatRes.messages, 'therapist'));
        setAllPatients((prev) =>
          prev.map((p) => ({
            ...p,
            pendingMessages: countUnreadForTherapist(chatRes.messages, p.id),
          }))
        );
      } else if (!cancelled && chatRes.ok === false && import.meta.env.DEV) {
        console.warn('[PatientContext] fetchChatMessages (therapist)', chatRes.message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    authLoading,
    sessionRole,
    isAuthenticated,
    therapist?.id,
    restrictPatientSessionId,
    supabase,
    refreshKnowledgeBaseFromCloudMerged,
    markKbHydratedFromCloudCb,
  ]);

  /**
   * רענון תוכנית התרגול הפעילה מהענן בכל בחירת מטופל (דשבורד מטפל) — מאותר עד כניסה מהמכשיר השני.
   */
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    if (restrictPatientSessionId) return;
    if (authLoading || !isAuthenticated) return;
    if (sessionRole !== 'therapist') return;

    const pid = selectedPatientId.trim();
    if (!pid) return;

    const supabaseClient = supabase;

    let cancelled = false;
    void (async () => {
      const planRes = await fetchActiveExercisePlanForPatient(supabaseClient, pid);
      if (cancelled) return;
      setExercisePlans((prev) => {
        const rest = prev.filter((ep) => ep.patientId !== pid);
        const localPlan = prev.find((ep) => ep.patientId === pid);
        if (planRes.ok === false) {
          console.error(
            '[PatientContext] fetchActiveExercisePlanForPatient failed — using baseline plan so session_history hydration can still run',
            { patientId: pid, reason: planRes.message }
          );
          const patientRow = allPatientsRef.current.find((p) => p.id === pid);
          return [
            ...rest,
            mergeFetchedExercisePlanWithLocal(
              localPlan,
              null,
              pid,
              patientRow?._exercisePlanCache
            ),
          ];
        }
        const patientRow = allPatientsRef.current.find((p) => p.id === pid);
        return [
          ...rest,
          mergeFetchedExercisePlanWithLocal(
            localPlan,
            planRes.exercisePlan,
            pid,
            patientRow?._exercisePlanCache
          ),
        ];
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [
    supabase,
    selectedPatientId,
    authLoading,
    isAuthenticated,
    sessionRole,
    restrictPatientSessionId,
  ]);

  /** טעינת session_history + דיווחי סיום לדשבורד מטפל (Supabase Auth — ללא localStorage). */
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    if (restrictPatientSessionId) return;
    if (authLoading || !isAuthenticated) return;
    if (sessionRole !== 'therapist') return;

    const pid = selectedPatientId.trim();
    if (!pid) return;

    const supabaseClient = supabase;
    const today = getClinicalDate();
    const start = addClinicalDays(today, -120);

    let cancelled = false;
    void (async () => {
      const rows = await fetchSessionHistoryBetween(supabaseClient, pid, start, today);
      if (cancelled) return;

      setDailySessions((prev) => mergeDailySessionsWithServerForPatient(prev, pid, rows));

      const completionFromRows = buildSessionCompletionByDateFromDailySessions(rows);
      setAllPatients((prev) =>
        prev.map((p) => {
          if (p.id !== pid) return p;
          let next: Patient = p;
          if (completionFromRows && Object.keys(completionFromRows).length > 0) {
            next = {
              ...next,
              _sessionCompletionByDate: mergeSessionCompletionByDateMaps(
                next._sessionCompletionByDate,
                completionFromRows
              ),
            };
          }
          const planLen = exercisePlans.find((ep) => ep.patientId === pid)?.exercises.length ?? 0;
          return applySessionHistoryAnalyticsHydration(next, rows, planLen);
        })
      );

      const totalCompletedSlots = rows.reduce((n, r) => n + (r.completedIds?.length ?? 0), 0);
      const todayRow = rows.find((r) => r.date === today);
      devLog('[HYDRATE_COMPLETION] therapist — session_history merged for patient', {
        patientId: redactId(pid),
        daysWithRows: rows.length,
        totalCompletedExerciseSlots: totalCompletedSlots,
        todayCompletedCount: todayRow?.completedIds?.length ?? 0,
      });

      setPatientExerciseFinishReportsByPatientId((prev) => {
        const fromServer = aggregateFinishReportsFromSessionRows(rows);
        const byId = new Map<string, PatientExerciseFinishReport>();
        for (const r of prev[pid] ?? []) {
          byId.set(r.id, r);
        }
        for (const r of fromServer) {
          byId.set(r.id, r);
        }
        const merged = [...byId.values()].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        return { ...prev, [pid]: merged };
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [
    supabase,
    selectedPatientId,
    authLoading,
    isAuthenticated,
    sessionRole,
    restrictPatientSessionId,
    exercisePlans,
  ]);
  useEffect(() => {
    if (restrictPatientSessionId) return;
    if (authLoading || !isAuthenticated || sessionRole !== 'therapist') return;
    try {
      if (
        typeof sessionStorage === 'undefined' ||
        sessionStorage.getItem(THERAPIST_LOGIN_HUB_LANDING_SESSION_KEY) !== '1'
      ) {
        return;
      }
      sessionStorage.removeItem(THERAPIST_LOGIN_HUB_LANDING_SESSION_KEY);
      setSelectedPatientId('');
      setActiveSection('overview');
    } catch {
      /* ignore private mode */
    }
  }, [restrictPatientSessionId, authLoading, isAuthenticated, sessionRole]);

  useEffect(() => {
    if (restrictPatientSessionId) return;
    const mine =
      therapistScopeIds && therapistScopeIds.length > 0
        ? allPatients.filter((p) => patientMatchesTherapistScope(p, therapistScopeIds))
        : allPatients;
    if (selectedPatientId === '') return;
    if (mine.some((p) => p.id === selectedPatientId)) return;
    // Keep selection during hydration when therapist_id is not yet on the row (backend resolves on send).
    if (allPatients.some((p) => p.id === selectedPatientId)) return;
    setSelectedPatientId('');
  }, [therapistScopeIds, allPatients, selectedPatientId, restrictPatientSessionId]);

  const clinicalToday = useMemo(() => {
    void clinicalTick;
    return getClinicalDate();
  }, [clinicalTick]);

  useEffect(() => {
    setDailyHistoryByPatient(
      mergeHistoryFromSessions(dailySessions, exercisePlans, {})
    );
  }, [dailySessions, exercisePlans]);

  /** רצף נגזר מלוח + sessionHistory — מסונכן ל־currentStreak לשמירה ול־UI */
  useEffect(() => {
    setAllPatients((prev) => {
      let changed = false;
      const next = prev.map((p) => {
        const map = dailyHistoryByPatient[p.id] ?? {};
        const s = computeStreakForPatient(p, map, clinicalToday);
        const longest = Math.max(p.longestStreak, s);
        if (s === p.currentStreak && longest === p.longestStreak) return p;
        changed = true;
        return { ...p, currentStreak: s, longestStreak: longest };
      });
      return changed ? next : prev;
    });
  }, [dailyHistoryByPatient, clinicalToday]);

  /** מקור אמת מקומי — נטען מ־localStorage בהפעלה; כל שינוי נשמר חזרה מיד. Supabase = דחיפה נפרדת. */
  useEffect(() => {
    savePersistedPatientState({
      version: 1,
      patients: allPatients,
      messages,
      exercisePlans,
      dailySessions,
      aiSuggestions,
      selectedPatientId,
      safetyAlerts,
      exerciseSafetyLockedPatientIds,
      selfCareZonesByPatientId,
      selfCareReportsByPatientId,
      patientExerciseFinishReportsByPatientId,
      selfCareStrengthTierByPatientId,
      patientRewardMetaByPatientId,
      patientGearByPatientId,
      knowledgeFacts,
    });
  }, [
    allPatients,
    messages,
    exercisePlans,
    dailySessions,
    aiSuggestions,
    selectedPatientId,
    safetyAlerts,
    exerciseSafetyLockedPatientIds,
    selfCareZonesByPatientId,
    selfCareReportsByPatientId,
    patientExerciseFinishReportsByPatientId,
    selfCareStrengthTierByPatientId,
    patientRewardMetaByPatientId,
    patientGearByPatientId,
    knowledgeFacts,
  ]);

  const supabasePushOptions = useMemo((): PushPersistedStateOptions => {
    if (restrictPatientSessionId) {
      return { sessionRole: 'patient', patientSessionId: restrictPatientSessionId };
    }
    return { sessionRole: 'therapist' };
  }, [restrictPatientSessionId]);

  const latestCloudPersistRef = useRef<PersistedPatientStateV1 | null>(null);
  latestCloudPersistRef.current = {
    version: 1,
    patients: allPatients,
    messages,
    exercisePlans,
    dailySessions,
    aiSuggestions,
    selectedPatientId,
    safetyAlerts,
    exerciseSafetyLockedPatientIds,
    selfCareZonesByPatientId,
    selfCareReportsByPatientId,
    patientExerciseFinishReportsByPatientId,
    selfCareStrengthTierByPatientId,
    patientRewardMetaByPatientId,
    patientGearByPatientId,
    knowledgeFacts,
  };

  const mergeServerPatientsIntoState = useCallback(
    (synced: Patient[], orderedIds?: string[]) => {
      if (synced.length === 0) return;
      startTransition(() => {
        setAllPatients((prev) => {
          const byId = new Map(synced.map((s) => [s.id, s]));
          const merged = prev.map((p) => {
            const server = byId.get(p.id);
            if (!server) return p;
            return {
              ...p,
              ...server,
              pushToken: server.pushToken ?? p.pushToken,
              lastLoginAt: server.lastLoginAt ?? p.lastLoginAt,
              lastWorkoutAt: server.lastWorkoutAt ?? p.lastWorkoutAt,
            };
          });
          if (!orderedIds?.length) return merged;
          const orderIndex = new Map(orderedIds.map((id, i) => [id, i]));
          return [...merged].sort(
            (a, b) => (orderIndex.get(a.id) ?? 9999) - (orderIndex.get(b.id) ?? 9999)
          );
        });
      });
    },
    []
  );

  const performCloudPersistPush = useCallback(async (): Promise<boolean> => {
    const supabaseClient = supabase;
    if (!supabaseClient) {
      cloudSaveMutexRef.current = null;
      cloudSaveInFlightRef.current = false;
      setSupabaseSyncStatus('error');
      setSupabaseSyncError('מצב שמירה פנימי לא מוכן — רעננו את הדף.');
      return false;
    }

    if (isSupabaseConfigured && isSupabaseAuthEnabled() && (authLoading || !isAuthenticated)) {
      cloudSaveMutexRef.current = null;
      cloudSaveInFlightRef.current = false;
      setSupabaseSyncStatus('idle');
      console.warn('[performCloudPersistPush] Skipping database persistence: auth not ready yet.');
      return false;
    }

    if (cloudSaveMutexRef.current) {
      try {
        await cloudSaveMutexRef.current;
      } catch {
        /* ignore errors from the previous save — we'll attempt again below */
      }
    }

    cloudSaveInFlightRef.current = true;
    setSupabaseSyncStatus('saving');
    setSupabaseSyncError(null);

    if (
      isSupabaseConfigured &&
      isSupabaseAuthEnabled() &&
      supabasePushOptions.sessionRole === 'therapist' &&
      !restrictPatientSessionId
    ) {
      const deadline = Date.now() + 25_000;
      while (!getAppKbHydratedFromCloud() && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
    }

    const mergedExtra = accumulatedCloudSaveOptionsRef.current;
    accumulatedCloudSaveOptionsRef.current = null;

    const onPushComplete = mergedExtra?.onPushComplete;
    const summaryMap = mergedExtra?.exercisePlanChangeSummaryByPatientId;
    const appendKnowledgeDeletedSeedIds = mergedExtra?.appendKnowledgeDeletedSeedIds;
    const snap = mergedExtra?.persistSnapshotOverride ?? latestCloudPersistRef.current;
    if (!snap) {
      cloudSaveMutexRef.current = null;
      cloudSaveInFlightRef.current = false;
      setSupabaseSyncStatus('error');
      setSupabaseSyncError('מצב שמירה פנימי לא מוכן — רעננו את הדף.');
      return false;
    }

    if (isSupabaseConfigured && isSupabaseAuthEnabled()) {
      const guard = await ensureSupabaseSessionReady(supabaseClient, {
        context: 'שמירה מלאה לענן (דשבורד / פורטל)',
        alertUser: false,
      });
      if (guard.ok === false) {
        cloudSaveMutexRef.current = null;
        cloudSaveInFlightRef.current = false;
        setSupabaseSyncStatus('idle');
        setSupabaseSyncError(null);
        return false;
      }
    }

    let pushSnap = snap;
    const therapistExerciseDeltaPush =
      isSupabaseConfigured &&
      isSupabaseAuthEnabled() &&
      supabasePushOptions.sessionRole === 'therapist' &&
      !restrictPatientSessionId;
    if (therapistExerciseDeltaPush) {
      const baseline = exercisePlansSessionBaselineRef.current;
      const deltaPlans = exercisePlansDeltaForTherapistPush(snap.exercisePlans, baseline);
      pushSnap = { ...snap, exercisePlans: deltaPlans };
      if (import.meta.env.DEV) {
        console.log('[SAVE_CHECK] Exercise plans delta push', {
          totalInSnapshot: snap.exercisePlans.length,
          baselinePlans: baseline?.length ?? 0,
          deltaCount: deltaPlans.length,
        });
      }
    }

    const savePromise = pushPersistedStateToSupabase(
      supabaseClient,
      pushSnap,
      {
        ...supabasePushOptions,
        ...(summaryMap && Object.keys(summaryMap).length > 0
          ? { exercisePlanChangeSummaryByPatientId: summaryMap }
          : {}),
        ...(mergedExtra?.trustKnowledgeFactDeletions === true
          ? { trustKnowledgeFactDeletions: true }
          : {}),
        ...((appendKnowledgeDeletedSeedIds?.length ?? 0) > 0
          ? { appendKnowledgeDeletedSeedIds }
          : {}),
      }
    );
    cloudSaveMutexRef.current = savePromise.then((r) => r.ok);

    try {
      const result = await savePromise;
      cloudSaveMutexRef.current = null;
      onPushComplete?.(result);
      if (result.ok === true) {
        setSupabaseSyncStatus('saved');
        setSupabaseLastSavedAt(new Date().toISOString());
        if (result.syncedPatients?.length) {
          mergeServerPatientsIntoState(result.syncedPatients);
        }
        return true;
      }
      setSupabaseSyncStatus('error');
      setSupabaseSyncError(result.message);
      alertIfSupabaseClientFailure(result.message, result.httpStatus);
      return false;
    } catch (e) {
      cloudSaveMutexRef.current = null;
      const msg = e instanceof Error ? e.message : String(e);
      console.error('[savePersistedStateToCloud] שגיאה לא צפויה', msg, e);
      setSupabaseSyncStatus('error');
      setSupabaseSyncError(msg);
      alertIfSupabaseClientFailure(msg, undefined, e);
      return false;
    } finally {
      cloudSaveInFlightRef.current = false;
    }
  }, [
    supabase,
    supabasePushOptions,
    isSupabaseConfigured,
    mergeServerPatientsIntoState,
    restrictPatientSessionId,
    authLoading,
    isAuthenticated,
  ]);

  const savePersistedStateToCloud = useCallback(
    async (options?: {
      exercisePlanChangeSummaryByPatientId?: Record<string, string>;
      /** דילוג על debounce — מצב ענן חייב את המערך העדכני (טיפ חדש וכו׳) */
      immediate?: boolean;
      onPushComplete?: (result: SupabasePushResult) => void;
      /** דוחף snapshot זה במקום latestCloudPersistRef (מונע stale state לפני setState). */
      persistSnapshotOverride?: PersistedPatientStateV1;
      trustKnowledgeFactDeletions?: boolean;
      appendKnowledgeDeletedSeedIds?: string[];
    }) => {
      if (!supabase) {
        console.error(
          '[savePersistedStateToCloud] Supabase client is null — בדקו VITE_SUPABASE_URL ו־VITE_SUPABASE_ANON_KEY והפעילו מחדש את השרת.'
        );
        setSupabaseSyncError(
          'Supabase לא מוגדר: הוסיפו VITE_SUPABASE_URL ו־VITE_SUPABASE_ANON_KEY לקובץ .env והפעילו מחדש את השרת.'
        );
        setSupabaseSyncStatus('idle');
        return false;
      }
      /** Therapist/patient cloud writes require a real JWT — anon key cannot upsert profiles (400 / RLS). */
      if (isSupabaseConfigured && (authLoading || !isAuthenticated)) {
        setSupabaseSyncStatus('idle');
        return false;
      }

      const incoming = options?.exercisePlanChangeSummaryByPatientId;
      if (
        (incoming && Object.keys(incoming).length > 0) ||
        typeof options?.onPushComplete === 'function' ||
        options?.persistSnapshotOverride != null ||
        options?.trustKnowledgeFactDeletions === true ||
        (options?.appendKnowledgeDeletedSeedIds?.length ?? 0) > 0
      ) {
        const acc = accumulatedCloudSaveOptionsRef.current ?? {};
        const next: {
          exercisePlanChangeSummaryByPatientId?: Record<string, string>;
          onPushComplete?: (result: SupabasePushResult) => void;
          persistSnapshotOverride?: PersistedPatientStateV1;
          trustKnowledgeFactDeletions?: boolean;
          appendKnowledgeDeletedSeedIds?: string[];
        } = { ...acc };
        if (incoming && Object.keys(incoming).length > 0) {
          next.exercisePlanChangeSummaryByPatientId = {
            ...(acc.exercisePlanChangeSummaryByPatientId ?? {}),
            ...incoming,
          };
        }
        if (options?.onPushComplete) {
          next.onPushComplete = options.onPushComplete;
        }
        if (options?.persistSnapshotOverride) {
          next.persistSnapshotOverride = options.persistSnapshotOverride;
        }
        if (options?.trustKnowledgeFactDeletions === true || acc.trustKnowledgeFactDeletions === true) {
          next.trustKnowledgeFactDeletions = true;
        }
        const incomingSeeds = options?.appendKnowledgeDeletedSeedIds?.filter(
          (s) => typeof s === 'string' && s.trim() !== ''
        );
        if (incomingSeeds?.length) {
          next.appendKnowledgeDeletedSeedIds = [
            ...new Set([
              ...(acc.appendKnowledgeDeletedSeedIds ?? []),
              ...incomingSeeds.map((s) => s.trim()),
            ]),
          ];
        } else if (acc.appendKnowledgeDeletedSeedIds?.length) {
          next.appendKnowledgeDeletedSeedIds = acc.appendKnowledgeDeletedSeedIds;
        }
        accumulatedCloudSaveOptionsRef.current = next;
      }

      if (options?.immediate) {
        if (cloudSaveDebounceTimerRef.current) {
          clearTimeout(cloudSaveDebounceTimerRef.current);
          cloudSaveDebounceTimerRef.current = null;
        }
        const stackedResolvers = [...cloudSaveDebouncedResolversRef.current];
        cloudSaveDebouncedResolversRef.current = [];
        const outcome = await performCloudPersistPush();
        for (const r of stackedResolvers) r(outcome);
        return outcome;
      }

      return new Promise<boolean>((resolve) => {
        cloudSaveDebouncedResolversRef.current.push(resolve);

        if (cloudSaveDebounceTimerRef.current) {
          clearTimeout(cloudSaveDebounceTimerRef.current);
        }

        cloudSaveDebounceTimerRef.current = setTimeout(() => {
          void (async () => {
            cloudSaveDebounceTimerRef.current = null;

            const resolvers = cloudSaveDebouncedResolversRef.current;
            cloudSaveDebouncedResolversRef.current = [];

            if (cloudSaveMutexRef.current) {
              try {
                await cloudSaveMutexRef.current;
              } catch {
                /* ignore errors from the previous save — we'll attempt again below */
              }
            }

            const outcome = await performCloudPersistPush();

            for (const r of resolvers) r(outcome);
          })();
        }, CLOUD_SAVE_DEBOUNCE_MS);
      });
    },
    [performCloudPersistPush, isAuthenticated, authLoading, supabase, isSupabaseConfigured]
  );

  const saveSinglePatientPayloadToCloud = useCallback(
    async (
      patient: Patient,
      options?: { trustIncomingAccountControl?: boolean }
    ): Promise<boolean> => {
      if (!supabase) {
        console.error(
          '[saveSinglePatientPayloadToCloud] Supabase client is null — בדקו VITE_SUPABASE_URL ו־VITE_SUPABASE_ANON_KEY.'
        );
        return false;
      }
      if (isSupabaseConfigured && (authLoading || !isAuthenticated)) {
        console.warn(
          '[saveSinglePatientPayloadToCloud] Skipping database persistence: auth not ready yet.'
        );
        return false;
      }
      const supabaseClient = supabase;
      if (isSupabaseConfigured) {
        const guard = await ensureSupabaseSessionReady(supabaseClient, {
          context: 'שמירת מטופל בודד לענן',
          alertUser: false,
        });
        if (!guard.ok) return false;
      }
      const now = new Date().toISOString();
      try {
        if (restrictPatientSessionId && patient.id !== restrictPatientSessionId) {
          if (import.meta.env.DEV) {
            console.warn('[saveSinglePatientPayloadToCloud] ניתן לשמור רק את מטופל הפורטל הנוכחי');
          }
          return false;
        }

        const clinicalDayMerge = getClinicalDate();
        const trustControl =
          !restrictPatientSessionId && options?.trustIncomingAccountControl === true;
        const baseline = allPatientsRef.current.find((x) => x.id === patient.id);
        const patientPayload = mergePatientForSingleCloudSave(
          baseline,
          patient,
          clinicalDayMerge,
          trustControl
        );

      const result = restrictPatientSessionId
          ? await upsertTreatmentReport(supabaseClient, patientPayload, {
              now,
              onlyPatientId: restrictPatientSessionId,
            })
          : await upsertTreatmentReport(supabaseClient, patientPayload, {
              now,
              ...(trustControl ? { trustIncomingAccountControl: true } : {}),
            });

        if (result.ok === false) {
          if (import.meta.env.DEV) {
            console.warn('[saveSinglePatientPayloadToCloud] נכשל', result.message);
          }
          if (restrictPatientSessionId && !isAuthSessionMissingMessage(result.message)) {
            window.alert(`שמירת התקדמות לענן נכשלה:\n\n${result.message}`);
          }
          return false;
        }
        if (result.syncedPatients?.length) {
          mergeServerPatientsIntoState(result.syncedPatients);
        }
        return true;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error('[SYNC_ERROR] saveSinglePatientPayloadToCloud', e);
        console.error('[saveSinglePatientPayloadToCloud] שגיאה לא צפויה', msg, e);
        return false;
      }
    },
    [
      isAuthenticated,
      authLoading,
      isSupabaseConfigured,
      mergeServerPatientsIntoState,
      restrictPatientSessionId,
      supabase,
    ]
  );

  const notifyExerciseCloudSyncError = useCallback((message: string) => {
    if (isAuthSessionMissingMessage(message)) {
      console.warn('[PatientContext] Exercise cloud sync skipped — auth session not ready:', message);
      return;
    }
    window.alert(message);
  }, []);

  const getLatestPatientSnapshot = useCallback(
    (patientId: string) => allPatientsRef.current.find((p) => p.id === patientId),
    []
  );

  const getLatestDailySessionSnapshot = useCallback(
    (patientId: string, date: string) =>
      dailySessionsRef.current.find((s) => s.patientId === patientId && s.date === date),
    []
  );

  const saveExercisePlanForPatientToCloud = useCallback(
    async (
      patientId: string,
      exercises: PatientExercise[],
      options?: { changeSummary?: string; forceSave?: boolean }
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const fail = (msg: string): { ok: false; message: string } => ({ ok: false, message: msg });

      if (!supabase) {
        const msg =
          'Supabase לא מוגדר: הוסיפו VITE_SUPABASE_URL ו־VITE_SUPABASE_ANON_KEY לקובץ .env והפעילו מחדש את השרת.';
        console.error('[Exercise cloud save]', msg);
        setSupabaseSyncError(msg);
        setSupabaseSyncStatus('idle');
        return fail(msg);
      }
      const supabaseClient = supabase;
      if (!isSupabaseConfigured || !isAuthenticated) {
        setSupabaseSyncStatus('idle');
        const msg =
          'שמירת תוכנית לענן דורשת חיבור: התחברות מטפל ל-Supabase ולעיתים רענון הדף.';
        setSupabaseSyncError(msg);
        console.warn('[Exercise cloud save]', msg);
        return fail(msg);
      }
      if (restrictPatientSessionId || sessionRole !== 'therapist') {
        const msg = 'שמירת תוכנית לענן זמינה רק מדשבורד מטפל.';
        setSupabaseSyncError(msg);
        console.warn('[Exercise cloud save]', msg);
        return fail(msg);
      }

      if (exercisePlanCloudSaveBusyRef.current) {
        const msg =
          'שמירת תוכנית לענן כבר רצה — המתינו לסיום או נסו שוב בעוד רגע.';
        console.warn('[Exercise cloud save]', msg);
        return fail(msg);
      }

      exercisePlanCloudSaveBusyRef.current = true;
      try {
        if (cloudSaveMutexRef.current) {
          try {
            await cloudSaveMutexRef.current;
          } catch {
            /* ignore */
          }
        }

        cloudSaveInFlightRef.current = true;
        setSupabaseSyncStatus('saving');
        setSupabaseSyncError(null);

        let failureMessage: string | null = null;
        const work = (async (): Promise<boolean> => {
        const exercisesToPersist = normalizeCachedPatientExercises(
          exercises.length > 0
            ? exercises
            : (pickCanonicalExercisePlan(exercisePlansRef.current, patientId)?.exercises ?? [])
        );

        devLog('[Exercise cloud save] מתחיל שמירת תוכנית לענן', {
          patientId: redactId(patientId),
          exerciseCount: exercisesToPersist.length,
          changeSummary: options?.changeSummary ?? null,
        });

        // Pre-sync the patient row so that the exercise_plans RLS sub-query
        // (patients.therapist_id = auth.uid()::text) will succeed.
        // If this patient exists only in localStorage the INSERT would otherwise be
        // rejected by RLS or fail with "missing patient therapist_id".
        const patientForSync = allPatientsRef.current.find((p) => p.id === patientId);
        if (patientForSync) {
          const now = new Date().toISOString();
          const patientSyncResult = await upsertPatientRecords(supabaseClient, [patientForSync], now);
          if (patientSyncResult.ok === false) {
            devWarn(
              '[Exercise cloud save] אזהרה: סנכרון שורת המטופל נכשל (ממשיך לנסות לשמור את התוכנית)',
              { patientId: redactId(patientId), reason: patientSyncResult.message }
            );
            alertIfSupabaseClientFailure(
              patientSyncResult.message,
              patientSyncResult.httpStatus
            );
          } else {
            devLog('[Exercise cloud save] שורת המטופל סונכרנה בהצלחה', { patientId: redactId(patientId) });
          }
        } else {
          devWarn('[Exercise cloud save] המטופל לא נמצא בזיכרון — מדלג על סנכרון שורת patients', {
            patientId: redactId(patientId),
          });
        }

        const upd = await updatePatientExercises(
          supabaseClient,
          patientId,
          exercisesToPersist,
          undefined,
          {
            changeSummary: options?.changeSummary,
            forceSave: options?.forceSave,
          }
        );
        if (upd.ok === false) {
          failureMessage = upd.message;
          alertIfSupabaseClientFailure(upd.message, upd.httpStatus);
          devError('[Exercise cloud save] נכשל', { reason: upd.message, patientId: redactId(patientId) });
          return false;
        }
        devLog('[Exercise cloud save] נשמר בהצלחה ל־exercise_plans', { patientId: redactId(patientId) });

        // Mirror the exercises into patients.payload._exercisePlanCache.
        // This lets the patient portal read exercises even when the patient's JWT
        // is blocked by RLS on exercise_plans (therapist-only policies are common).
        const patientForCache = allPatientsRef.current.find((p) => p.id === patientId);
        if (patientForCache) {
          const now = new Date().toISOString();
          const clinicalDayMerge = getClinicalDate();
          const patientWithCache = mergePatientWithExercisePlanCache(
            patientForCache,
            patientForCache,
            exercisesToPersist,
            clinicalDayMerge
          );
          setAllPatients((prev) =>
            prev.map((p) => (p.id === patientId ? patientWithCache : p))
          );
          const cacheResult = await upsertPatientRecords(supabaseClient, [patientWithCache], now);
          if (cacheResult.ok === false) {
            devWarn('[Exercise cloud save] עדכון _exercisePlanCache ב-patients נכשל (לא קריטי)', { reason: cacheResult.message, patientId: redactId(patientId) });
          } else {
            devLog('[Exercise cloud save] _exercisePlanCache עודכן ב-patients.payload', { patientId: redactId(patientId), exerciseCount: exercisesToPersist.length });
          }
        }

        const fresh = await fetchActiveExercisePlanForPatient(supabaseClient, patientId);
        if (fresh.ok === false) {
          console.warn(
            '[Exercise cloud save] רענון תוכנית מהשרת נכשל לאחר שמירה — משמרים תוכנית מקומית ממוזגת',
            { patientId, reason: fresh.message }
          );
          const fallback = mergeFetchedExercisePlanWithLocal(
            pickCanonicalExercisePlan(exercisePlansRef.current, patientId),
            { patientId, exercises: exercisesToPersist },
            patientId,
            exercisesToPersist
          );
          setExercisePlans((prev) => {
            const rest = prev.filter((ep) => ep.patientId !== patientId);
            return [...rest, fallback];
          });
          exercisePlansSessionBaselineRef.current = cloneExercisePlansForBaseline(
            exercisePlansRef.current
              .filter((ep) => ep.patientId !== patientId)
              .concat([fallback])
          );
          setAllPatients((prev) =>
            prev.map((p) =>
              p.id === patientId ? { ...p, _exercisePlanCache: exercisesToPersist } : p
            )
          );
          return true;
        }
        const mergedPlan = mergeFetchedExercisePlanWithLocal(
          pickCanonicalExercisePlan(exercisePlansRef.current, patientId),
          fresh.exercisePlan ?? ({ patientId, exercises: exercisesToPersist } as ExercisePlan),
          patientId,
          exercisesToPersist
        );
        setExercisePlans((prev) => {
          const rest = prev.filter((ep) => ep.patientId !== patientId);
          return [...rest, mergedPlan];
        });
        const nextPlans = exercisePlansRef.current
          .filter((ep) => ep.patientId !== patientId)
          .concat([mergedPlan]);
        exercisePlansSessionBaselineRef.current = cloneExercisePlansForBaseline(nextPlans);
        setAllPatients((prev) =>
          prev.map((p) =>
            p.id === patientId ? { ...p, _exercisePlanCache: exercisesToPersist } : p
          )
        );
        return true;
        })();

        cloudSaveMutexRef.current = work;
        let ok = false;
        try {
          ok = await work;
        } finally {
          cloudSaveMutexRef.current = null;
        }

        if (ok) {
          setSupabaseSyncStatus('saved');
          setSupabaseLastSavedAt(new Date().toISOString());
          return { ok: true };
        }
        const finalMsg =
          failureMessage ?? 'שמירת תוכנית תרגילים לענן נכשלה';
        setSupabaseSyncStatus('error');
        setSupabaseSyncError(finalMsg);
        return fail(finalMsg);
      } finally {
        cloudSaveInFlightRef.current = false;
        exercisePlanCloudSaveBusyRef.current = false;
      }
    },
    [
      supabase,
      restrictPatientSessionId,
      sessionRole,
      isAuthenticated,
      isSupabaseConfigured,
      // allPatientsRef is a ref — stable across renders, safe to omit from deps,
      // but listed explicitly for clarity. upsertPatientRecords is a module-level fn.
    ]
  );

  const applyExternalSnapshot = useCallback(
    (data: PersistedPatientStateV1) => {
      setAllPatients(
        normalizePatientsTherapistIds(data.patients, { fallbackTherapistId: therapist?.id })
      );
      setMessages(data.messages ?? []);
      setExercisePlans(data.exercisePlans ?? []);
      setDailySessions(data.dailySessions ?? []);
      setAiSuggestions(data.aiSuggestions ?? []);
      setSafetyAlerts(data.safetyAlerts ?? []);
      setExerciseSafetyLockedPatientIds(data.exerciseSafetyLockedPatientIds ?? {});
      setSelfCareZonesByPatientId(data.selfCareZonesByPatientId ?? {});
      setSelfCareReportsByPatientId(data.selfCareReportsByPatientId ?? {});
      setPatientExerciseFinishReportsByPatientId(
        data.patientExerciseFinishReportsByPatientId ?? {}
      );
      setSelfCareStrengthTierByPatientId(data.selfCareStrengthTierByPatientId ?? {});
      const prm = data.patientRewardMetaByPatientId ?? {};
      const nextMeta: Record<string, PatientRewardMeta> = {};
      for (const [pid, v] of Object.entries(prm)) {
        nextMeta[pid] = {
          readArticleIds: [...(v?.readArticleIds ?? [])],
          lastLoginBonusClinicalDate: v?.lastLoginBonusClinicalDate ?? null,
          articleLinkOpenedIds: [...(v?.articleLinkOpenedIds ?? [])],
          dykRewardClaimedLocalYmd: v?.dykRewardClaimedLocalYmd ?? null,
          dykTipOpenedLocalYmd: v?.dykTipOpenedLocalYmd ?? null,
        };
      }
      setPatientRewardMetaByPatientId(nextMeta);
      const pg = data.patientGearByPatientId ?? {};
      const nextGear: Record<string, PatientGearState> = {};
      for (const [pid, v] of Object.entries(pg)) {
        nextGear[pid] = normalizePatientGear(v);
      }
      setPatientGearByPatientId(nextGear);
      setKnowledgeFacts(normalizeKnowledgeFactsList(data.knowledgeFacts));
      if (!restrictPatientSessionId) {
        setSelectedPatientId(data.selectedPatientId ?? '');
      }
    },
    [restrictPatientSessionId, therapist?.id]
  );

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== PATIENT_STATE_STORAGE_KEY || e.newValue == null) return;
      try {
        const data = JSON.parse(e.newValue) as PersistedPatientStateV1;
        if (data?.version === 1 && Array.isArray(data.patients)) applyExternalSnapshot(data);
      } catch {
        /* ignore */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [applyExternalSnapshot]);

  const selectedPatient = useMemo(
    () => allPatients.find((p) => p.id === selectedPatientId) ?? null,
    [allPatients, selectedPatientId]
  );

  // ── Patient selection ──────────────────────────────────────────
  const selectPatient = useCallback(
    (id: string, options?: { openSection?: NavSection }) => {
      if (restrictPatientSessionId && id !== restrictPatientSessionId) return;
      if (id !== '') {
        if (
          therapistScopeIds &&
          therapistScopeIds.length > 0 &&
          !allPatients.some((p) => p.id === id && patientMatchesTherapistScope(p, therapistScopeIds))
        ) {
          return;
        }
      }
      setSelectedPatientId(id);
      setActiveSection(options?.openSection ?? 'overview');
    },
    [restrictPatientSessionId, therapistScopeIds, allPatients]
  );

  /** Realtime chat: therapist dashboard (all patients) or patient portal (single thread). */
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    if (authLoading || !isAuthenticated) return;

    let viewer: ChatViewerRole | null = null;
    if (restrictPatientSessionId) {
      viewer = 'patient';
    } else if (sessionRole === 'therapist') {
      viewer = 'therapist';
    }
    if (!viewer) return;

    const supabaseClient = supabase;
    const patientFilter = restrictPatientSessionId?.trim() || undefined;

    const sub = subscribeChatMessages(supabaseClient, {
      patientId: patientFilter,
      viewer,
      onInsert: (msg) => {
        setMessages((prev) => {
          const next = mergeChatMessage(prev, msg, viewer!);
          if (viewer === 'therapist' && (msg.fromPatient || msg.aiClinicalAlert)) {
            setAllPatients((patients) =>
              patients.map((p) =>
                p.id === msg.patientId
                  ? { ...p, pendingMessages: countUnreadForTherapist(next, p.id) }
                  : p
              )
            );
          }
          return next;
        });
      },
    });

    return () => {
      sub.unsubscribe();
    };
  }, [
    supabase,
    authLoading,
    isAuthenticated,
    sessionRole,
    restrictPatientSessionId,
  ]);

  // ── Messages ───────────────────────────────────────────────────
  const getPatientMessages = useCallback(
    (patientId: string) => messages.filter((m) => m.patientId === patientId),
    [messages]
  );

  const markMessagesRead = useCallback(
    (messageIds: string | string[]) => {
      const ids = [...new Set((Array.isArray(messageIds) ? messageIds : [messageIds]).filter(Boolean))];
      if (ids.length === 0) return;

      setMessages((prev) => {
        const idSet = new Set(ids);
        const next = prev.map((m) => (idSet.has(m.id) ? { ...m, isRead: true } : m));
        if (!restrictPatientSessionId) {
          setAllPatients((patients) =>
            patients.map((p) => ({
              ...p,
              pendingMessages: countUnreadForTherapist(next, p.id),
            }))
          );
        }
        return next;
      });

      if (!supabase || !isSupabaseConfigured) return;
      const viewer = restrictPatientSessionId ? ('patient' as const) : ('therapist' as const);
      void markChatMessagesRead(supabase, ids, viewer).then((res) => {
        if (res.ok === false) {
          console.warn('[markMessagesRead] cloud persist failed', res.message);
        }
      });
    },
    [supabase, restrictPatientSessionId]
  );

  const markMessageRead = useCallback(
    (messageId: string) => {
      markMessagesRead(messageId);
    },
    [markMessagesRead]
  );

  const applyEmergencyProtocol = useCallback(
    (patientId: string, patientTextSnippet: string, r: EmergencyScreenResult, sourceLabel: string) => {
      const now = new Date().toISOString();
      const alertId = `sa-em-${Date.now()}-${patientId}`;
      setExerciseSafetyLockedPatientIds((prev) => ({ ...prev, [patientId]: true }));
      setEmergencyModalPatientId(patientId);
      setSafetyAlerts((prev) => [
        ...prev,
        {
          id: alertId,
          patientId,
          reasonCode: r.reasonCode,
          reasonHebrew: r.reasonHebrew,
          severity: 'emergency',
          createdAt: now,
        },
      ]);
      const exactPatientText =
        patientTextSnippet.length > 8000
          ? `${patientTextSnippet.slice(0, 8000)}\n…(קוצר — המשך בצ׳אט המטופל)`
          : patientTextSnippet;
      const content =
        `🚨 התראת חירום קלינית (${sourceLabel})\n` +
        `${r.reasonHebrew}\n\n` +
        `הטקסט המדויק שכתב/ה המטופל:\n«${exactPatientText}»`;
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-em-${Date.now()}`,
          patientId,
          content,
          timestamp: now,
          isRead: false,
          fromPatient: false,
          aiClinicalAlert: true,
          clinicalSafetyTier: 'emergency',
        },
      ]);
      setAllPatients((prev) =>
        prev.map((p) =>
          p.id === patientId
            ? { ...p, hasRedFlag: true, pendingMessages: p.pendingMessages + 1 }
            : p
        )
      );
    },
    []
  );

  const screenAndHandleEmergencyText = useCallback(
    (patientId: string, text: string, sourceLabel: string): boolean => {
      const r = screenPatientFreeTextForEmergency(text);
      if (!r.isEmergency) return false;
      applyEmergencyProtocol(patientId, text, r, sourceLabel);
      return true;
    },
    [applyEmergencyProtocol]
  );

  const dismissSafetyAlert = useCallback((alertId: string) => {
    setSafetyAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  const isPatientExerciseSafetyLocked = useCallback(
    (patientId: string) => !!exerciseSafetyLockedPatientIds[patientId],
    [exerciseSafetyLockedPatientIds]
  );

  const clearPatientExerciseSafetyLock = useCallback((patientId: string) => {
    setExerciseSafetyLockedPatientIds((prev) => {
      const next = { ...prev };
      delete next[patientId];
      return next;
    });
    setEmergencyModalPatientId((cur) => (cur === patientId ? null : cur));
  }, []);

  const sendTherapistReply = useCallback(
    (patientId: string, content: string) => {
      const body = content.trim();
      const pid = patientId.trim();
      if (import.meta.env.DEV) {
        logChatTherapistReplyInvoked(pid, body.length > 0);
      }
      if (!body) return;
      if (!pid) return;

      const appendLocal = (msg: Message) => {
        setMessages((prev) => mergeChatMessage(prev, msg, 'therapist'));
      };

      const appendLocalFallback = () => {
        appendLocal({
          id: `msg-local-${Date.now()}`,
          patientId: pid,
          content: body,
          timestamp: new Date().toISOString(),
          isRead: true,
          fromPatient: false,
        });
      };

      if (!supabase || !isSupabaseConfigured) {
        appendLocal({
          id: `msg-${Date.now()}`,
          patientId: pid,
          content: body,
          timestamp: new Date().toISOString(),
          isRead: true,
          fromPatient: false,
        });
        return;
      }

      // Isolated from Gemini / roster hydration — session + DB row are authoritative.
      void (async () => {
        const guard = await ensureSupabaseSessionReady(supabase, { context: 'sendTherapistReply' });
        if (!guard.ok) {
          logChatAuthNotReady();
          appendLocalFallback();
          return;
        }

        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user?.id) {
          logChatMissingTherapistUser();
          appendLocalFallback();
          return;
        }

        const pushCtx = await fetchPatientChatPushContext(supabase, pid);
        const memoryPatient = allPatientsRef.current.find((p) => p.id === pid);
        const patientTherapistId =
          pushCtx?.therapistId?.trim() || memoryPatient?.therapistId?.trim() || '';

        if (!patientTherapistId) {
          logChatMissingTherapistIdOnPatient(pid);
          appendLocalFallback();
          return;
        }

        const therapistRowId =
          resolveTherapistIdForSupabaseRls(patientTherapistId, user) ?? user.id;

        const res = await insertTherapistChatMessage(supabase, {
          patientId: pid,
          therapistId: therapistRowId,
          content: body,
        });

        if (res.ok) {
          appendLocal(res.message);
          void dispatchTherapistChatPushNotification(supabase, {
            patientId: pid,
            pushToken: pushCtx?.pushToken,
            messagePreview: body,
          });
          return;
        }

        logChatInsertFailed('therapist', res.message);
        appendLocalFallback();
      })();
    },
    [supabase, isSupabaseConfigured]
  );

  const sendPatientMessage = useCallback(
    (patientId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;

      const patient = allPatients.find((p) => p.id === patientId);
      const therapistKey = patient?.therapistId?.trim();
      const em = screenPatientFreeTextForEmergency(trimmed);

      const appendLocalPatientMessage = (msg: Message) => {
        setMessages((prev) => mergeChatMessage(prev, msg, 'patient'));
        setAllPatients((prev) =>
          prev.map((p) =>
            p.id === patientId ? { ...p, pendingMessages: p.pendingMessages + 1 } : p
          )
        );
      };

      if (!supabase || !isSupabaseConfigured || !therapistKey) {
        appendLocalPatientMessage({
          id: `msg-${Date.now()}`,
          patientId,
          content: trimmed,
          timestamp: new Date().toISOString(),
          isRead: true,
          fromPatient: true,
        });
        if (em.isEmergency) {
          applyEmergencyProtocol(patientId, trimmed, em, 'הודעה למטפל');
        }
        return;
      }

      void (async () => {
        const res = await insertPatientChatMessage(supabase, {
          patientId,
          therapistId: therapistKey,
          content: trimmed,
        });

        if (res.ok) {
          setMessages((prev) => mergeChatMessage(prev, res.message, 'patient'));
          setAllPatients((prev) =>
            prev.map((p) =>
              p.id === patientId ? { ...p, pendingMessages: p.pendingMessages + 1 } : p
            )
          );
        } else {
          logChatInsertFailed('patient', res.message);
          appendLocalPatientMessage({
            id: `msg-local-${Date.now()}`,
            patientId,
            content: trimmed,
            timestamp: new Date().toISOString(),
            isRead: true,
            fromPatient: true,
          });
        }

        if (em.isEmergency) {
          applyEmergencyProtocol(patientId, trimmed, em, 'הודעה למטפל');
        }
      })();
    },
    [applyEmergencyProtocol, allPatients, supabase]
  );

  const sendAiClinicalAlert = useCallback(
    (patientId: string, detailHebrew?: string, tier: ClinicalSafetyTier = 'standard') => {
      const base = getClinicalAlertStandardMessage();
      let content: string;
      if (tier === 'high_priority') {
        content =
          detailHebrew ??
          `${base}\n\nנדרשת התייחסות המטפל בהקדם האפשרי.`;
      } else if (tier === 'emergency') {
        content = detailHebrew ?? base;
      } else {
        content = detailHebrew ? `${base}\n\n${detailHebrew}` : base;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-ai-${Date.now()}`,
          patientId,
          content,
          timestamp: new Date().toISOString(),
          isRead: false,
          fromPatient: false,
          aiClinicalAlert: true,
          clinicalSafetyTier: tier,
        },
      ]);
      setAllPatients((prev) =>
        prev.map((p) =>
          p.id === patientId ? { ...p, pendingMessages: p.pendingMessages + 1 } : p
        )
      );
    },
    []
  );

  const gamification = useGamification({
    allPatients,
    setAllPatients,
    patientRewardMetaByPatientId,
    setPatientRewardMetaByPatientId,
    patientGearByPatientId,
    setPatientGearByPatientId,
    knowledgeFacts,
    setKnowledgeFacts,
  });

  const addManualKnowledgeFactAndForceCloudSave = useCallback(
    (input: {
      teaser: string;
      title: string;
      explanation: string;
      sourceUrl: string;
    }) => {
      suppressAppKbCloudFetchUntilRef.current = Date.now() + KB_CLOUD_FETCH_COOLDOWN_MS_AFTER_TIP_SAVE;
      const row = tryBuildManualKnowledgeFactRow(input);
      if (!row) return;

      const baseSnap = latestCloudPersistRef.current;
      const prevKb = normalizeKnowledgeFactsList(baseSnap?.knowledgeFacts ?? knowledgeFactsRef.current);
      const nextFacts = [...prevKb, row];

      setKnowledgeFacts(nextFacts);
      setAllPatients((prevPatients) =>
        prevPatients.map((p) => ({ ...p, knowledgeFacts: nextFacts }))
      );

      if (!baseSnap) {
        console.error('[TIP_SYNC] Cannot cloud-save tip — persist snapshot ref empty');
        return;
      }

      /** מאפשר upsert ל-app_knowledge_base גם אם טעינת KB ראשונית תקועה / נכשלה */
      markKbHydratedFromCloudCb();
      console.warn('[TIP_SYNC] KB hydration gate opened before therapist tip save (emergency release)');

      const persistSnapshotOverride: PersistedPatientStateV1 = {
        ...baseSnap,
        knowledgeFacts: nextFacts,
        patients: baseSnap.patients.map((p) => ({ ...p, knowledgeFacts: nextFacts })),
      };

      void savePersistedStateToCloud({
        immediate: true,
        persistSnapshotOverride,
        onPushComplete: (pushResult) => {
          console.log('[TIP_SYNC] Supabase cloud push — full result after therapist tip save:', pushResult);
          const kbUpsert = pushResult.knowledgeBaseUpsert;
          if (kbUpsert !== undefined) {
            console.log('[TIP_SYNC] app_knowledge_base upsert response:', kbUpsert);
            if (!kbUpsert.ok) {
              console.warn('[TIP_SYNC] KB upsert error:', kbUpsert.message, {
                httpStatus: kbUpsert.httpStatus,
                raw: kbUpsert.raw,
              });
            }
          }
          if (!pushResult.ok) {
            console.warn('[TIP_SYNC] Cloud push failed:', pushResult.message, pushResult.httpStatus);
            return;
          }
          const client = supabase;
          if (!client) return;
          if (kbUpsert?.ok === true && kbUpsert.skippedReason === 'kb-not-hydrated') return;
          if (kbUpsert?.ok === false) return;
          void (async () => {
            const uid = (await client.auth.getUser()).data.user?.id?.trim();
            if (!uid) return;
            const row = await fetchAppKnowledgeBaseFromSupabase(client, {
              therapistAuthUserId: uid,
            });
            const authoritative = normalizeKnowledgeFactsList(row?.items ?? []);
            setKnowledgeFacts(authoritative);
            setAllPatients((prev) =>
              prev.map((p) => ({ ...p, knowledgeFacts: authoritative }))
            );
          })();
        },
      });
    },
    [savePersistedStateToCloud, markKbHydratedFromCloudCb, supabase]
  );

  const deleteKnowledgeFactAndForceCloudSave = useCallback(
    (factId: string) => {
      suppressAppKbCloudFetchUntilRef.current = Date.now() + KB_CLOUD_FETCH_COOLDOWN_MS_AFTER_TIP_SAVE;
      const trimmedId = factId.trim();
      if (!trimmedId) return;

      const baseSnap = latestCloudPersistRef.current;
      const prevKb = normalizeKnowledgeFactsList(baseSnap?.knowledgeFacts ?? knowledgeFactsRef.current);
      const livePatients = allPatientsRef.current;
      const removedFact =
        prevKb.find((f) => f.id === trimmedId) ??
        livePatients
          .flatMap((p) => normalizeKnowledgeFactsList(p.knowledgeFacts))
          .find((f) => f.id === trimmedId);
      const seedToAppend = removedFact?.seedId?.trim() ?? '';
      const scrubbedPatientCount = livePatients.filter((p) =>
        normalizeKnowledgeFactsList(p.knowledgeFacts).some((f) => f.id === trimmedId)
      ).length;

      const nextFacts = prevKb.filter((f) => f.id !== trimmedId);
      const patientsWithoutFact = livePatients.map((p) => {
        const stripped = normalizeKnowledgeFactsList(p.knowledgeFacts).filter((f) => f.id !== trimmedId);
        return {
          ...p,
          knowledgeFacts: stripped.length > 0 ? stripped : undefined,
        };
      });

      const factWasPresent =
        prevKb.some((f) => f.id === trimmedId) ||
        livePatients.some((p) =>
          normalizeKnowledgeFactsList(p.knowledgeFacts).some((f) => f.id === trimmedId)
        );

      if (!factWasPresent) {
        if (import.meta.env.DEV) {
          console.warn(
            '[TIP_SYNC] deleteKnowledgeFactAndForceCloudSave — fact id not in local KB or patient payloads',
            trimmedId
          );
        }
        return;
      }

      knowledgeFactsRef.current = nextFacts;

      setKnowledgeFacts(nextFacts);
      setAllPatients(patientsWithoutFact);

      if (!baseSnap) {
        console.error('[TIP_SYNC] Cannot cloud-save KB delete — persist snapshot ref empty');
        return;
      }

      markKbHydratedFromCloudCb();
      console.warn('[TIP_SYNC] KB hydration gate opened before therapist tip delete (emergency release)');

      const persistSnapshotOverride: PersistedPatientStateV1 = {
        ...baseSnap,
        knowledgeFacts: nextFacts,
        patients: patientsWithoutFact,
      };

      void savePersistedStateToCloud({
        immediate: true,
        persistSnapshotOverride,
        /** ממופה ל-`therapistTrustKnowledgeFactDeletions` ב-merge לטבלת patients (מניעת «הקמה מחדש» מ-payload ישן). */
        trustKnowledgeFactDeletions: true,
        ...(seedToAppend ? { appendKnowledgeDeletedSeedIds: [seedToAppend] } : {}),
        onPushComplete: (pushResult) => {
          console.log('[TIP_SYNC] Supabase cloud push — full result after therapist tip delete:', pushResult);
          const kbUpsert = pushResult.knowledgeBaseUpsert;
          if (kbUpsert !== undefined) {
            console.log('[TIP_SYNC] app_knowledge_base upsert response (delete):', kbUpsert);
            if (!kbUpsert.ok) {
              console.warn('[TIP_SYNC] KB upsert error (delete):', kbUpsert.message, {
                httpStatus: kbUpsert.httpStatus,
                raw: kbUpsert.raw,
              });
            }
          }
          if (!pushResult.ok) {
            console.warn('[TIP_SYNC] Cloud push failed (delete):', pushResult.message, pushResult.httpStatus);
            return;
          }
          console.log(
            `[SYNC_DEBUG] Fact ${trimmedId} scrubbed from ${scrubbedPatientCount} patients and global row.`
          );
          const client = supabase;
          if (!client) return;
          if (kbUpsert?.ok === true && kbUpsert.skippedReason === 'kb-not-hydrated') return;
          if (kbUpsert?.ok === false) return;
          void (async () => {
            const uid = (await client.auth.getUser()).data.user?.id?.trim();
            if (!uid) return;
            const fetched = await fetchAppKnowledgeBaseFromSupabase(client, {
              therapistAuthUserId: uid,
            });
            const authoritative = normalizeKnowledgeFactsList(fetched?.items ?? []);
            setKnowledgeFacts(authoritative);
            setAllPatients((prev) =>
              prev.map((p) => ({ ...p, knowledgeFacts: authoritative }))
            );
            console.log(
              `[TIP_SYNC] KB delete verified from cloud — server row item count: ${authoritative.length}`
            );
          })();
        },
      });
    },
    [savePersistedStateToCloud, markKbHydratedFromCloudCb, supabase]
  );

  const exercise = useExercisePlan({
    patients,
    allPatients,
    setAllPatients,
    exercisePlans,
    setExercisePlans,
    dailySessions,
    setDailySessions,
    clinicalTick,
    clinicalToday,
    aiSuggestions,
    setAiSuggestions,
    selfCareZonesByPatientId,
    setSelfCareZonesByPatientId,
    selfCareReportsByPatientId,
    setSelfCareReportsByPatientId,
    patientExerciseFinishReportsByPatientId,
    setPatientExerciseFinishReportsByPatientId,
    selfCareStrengthTierByPatientId,
    setSelfCareStrengthTierByPatientId,
    patientGearByPatientId,
    setPatientGearByPatientId,
    setExerciseSafetyLockedPatientIds,
    setSafetyAlerts,
    sendAiClinicalAlert,
    pushRewardFeedback: gamification.pushRewardFeedback,
    therapistScopeIds,
    setSelectedPatientId,
    setActiveSection,
    supabaseClient: supabase,
    patientPortalPatientId: restrictPatientSessionId ?? null,
    persistPatientPayloadToCloud: saveSinglePatientPayloadToCloud,
    onExerciseCloudSyncError: notifyExerciseCloudSyncError,
    getLatestPatient: getLatestPatientSnapshot,
    getLatestDailySession: getLatestDailySessionSnapshot,
  });

  const persistExercisePlanCacheForPatient = useCallback(
    async (
      patientId: string,
      exercises: PatientExercise[]
    ): Promise<{ ok: true } | { ok: false; message: string }> => {
      const fail = (message: string): { ok: false; message: string } => ({ ok: false, message });

      const normalized = normalizeCachedPatientExercises(exercises);
      exercise.replaceExercisePlanForPatient(patientId, normalized);

      if (!isSupabaseConfigured || !supabase) {
        setAllPatients((prev) =>
          prev.map((p) =>
            p.id === patientId ? { ...p, _exercisePlanCache: normalized } : p
          )
        );
        return { ok: true };
      }
      if (restrictPatientSessionId || sessionRole !== 'therapist' || !isAuthenticated) {
        return fail('אין הרשאת מטפל לשמירת תוכנית');
      }

      const patientForCache = allPatientsRef.current.find((p) => p.id === patientId);
      if (!patientForCache) {
        return fail('מטופל לא נמצא');
      }

      const now = new Date().toISOString();
      const clinicalDayMerge = getClinicalDate();
      const patientWithCache = mergePatientWithExercisePlanCache(
        patientForCache,
        patientForCache,
        normalized,
        clinicalDayMerge
      );

      setAllPatients((prev) =>
        prev.map((p) => (p.id === patientId ? patientWithCache : p))
      );

      const cacheResult = await upsertPatientRecords(supabase, [patientWithCache], now);
      if (cacheResult.ok === false) {
        devWarn('[Exercise cache save] עדכון _exercisePlanCache נכשל', {
          patientId: redactId(patientId),
          message: cacheResult.message,
        });
        return fail(cacheResult.message);
      }

      return { ok: true };
    },
    [
      exercise,
      isSupabaseConfigured,
      supabase,
      restrictPatientSessionId,
      sessionRole,
      isAuthenticated,
    ]
  );

  const clinical = useClinicalData({
    allPatients,
    setAllPatients,
    setMessages,
    setSelfCareZonesByPatientId,
    exercisePlans,
    aiSuggestions,
    setAiSuggestions,
    safetyAlerts,
    clinicalToday,
    dailyHistoryByPatient,
    restrictPatientSessionId,
    onClinicalQueueUpdated: () => {
      void savePersistedStateToCloud({ immediate: true });
    },
  });

  const therapistApproveAiSuggestion = useCallback(
    (suggestionId: string) => {
      const result = exercise.therapistApproveAiSuggestion(suggestionId);
      if (result) {
        void clinical.commitTherapistAiSuggestionDecision(suggestionId, 'approved', {
          appliedPlanUpdates: result.appliedPlanUpdates,
        });
      }
    },
    [exercise.therapistApproveAiSuggestion, clinical.commitTherapistAiSuggestionDecision]
  );

  const therapistDeclineAiSuggestion = useCallback(
    (suggestionId: string) => {
      const found = exercise.therapistDeclineAiSuggestion(suggestionId);
      if (found) {
        void clinical.commitTherapistAiSuggestionDecision(suggestionId, 'dismissed');
      }
    },
    [exercise.therapistDeclineAiSuggestion, clinical.commitTherapistAiSuggestionDecision]
  );

  /**
   * Cross-device patient → therapist clinical queue sync.
   * Primary: Supabase Realtime UPDATE events on `patients` (RLS-scoped) trigger a
   * debounced re-pull. Fallback: a slow 15-minute poll in case Realtime disconnects
   * (previously this was a full-payload poll every 3 minutes).
   */
  const CLINICAL_INSIGHTS_FALLBACK_POLL_MS = 15 * 60 * 1000;
  const CLINICAL_INSIGHTS_REALTIME_DEBOUNCE_MS = 3_000;
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    if (restrictPatientSessionId) return;
    if (sessionRole !== 'therapist') return;
    if (authLoading || !isAuthenticated) return;

    let cancelled = false;
    const client = supabase;

    const pullInsights = async () => {
      const [insightsRes, patientsRes] = await Promise.all([
        pullPersistedState(client),
        fetchPatientPayloadsForTherapist(client),
      ]);
      if (cancelled) return;

      if (insightsRes.ok) {
        setAiSuggestions((prev) =>
          mergeClinicalInsightsSnapshots(
            { aiSuggestions: prev, safetyAlerts: [] },
            insightsRes.clinicalInsights
          ).aiSuggestions
        );
        setSafetyAlerts((prev) =>
          mergeClinicalInsightsSnapshots(
            { aiSuggestions: [], safetyAlerts: prev },
            insightsRes.clinicalInsights
          ).safetyAlerts
        );
      }

      if (patientsRes.ok && patientsRes.patients.length > 0) {
        mergeServerPatientsIntoState(
          patientsRes.patients,
          patientsRes.patients.map((p) => p.id)
        );
      }
    };

    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    const schedulePull = () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        debounceTimer = null;
        void pullInsights();
      }, CLINICAL_INSIGHTS_REALTIME_DEBOUNCE_MS);
    };

    const channel = client
      .channel('patients-clinical-queue')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'patients' },
        schedulePull
      )
      .subscribe();

    void pullInsights();
    const timer = setInterval(() => void pullInsights(), CLINICAL_INSIGHTS_FALLBACK_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (debounceTimer) clearTimeout(debounceTimer);
      void client.removeChannel(channel);
    };
  }, [
    supabase,
    restrictPatientSessionId,
    sessionRole,
    authLoading,
    isAuthenticated,
    isSupabaseConfigured,
    mergeServerPatientsIntoState,
  ]);

  /** Remove legacy prolonged-absence sidebar/queue items — roster card color handles absence. */
  useEffect(() => {
    if (restrictPatientSessionId) return;
    if (sessionRole !== 'therapist') return;

    const purged = purgeProactiveAbsenceFromClinicalQueue(safetyAlerts, aiSuggestions);
    if (!purged.changed) return;

    setSafetyAlerts(purged.safetyAlerts);
    setAiSuggestions(purged.aiSuggestions);

    const snap = latestCloudPersistRef.current;
    if (snap) {
      void savePersistedStateToCloud({
        immediate: true,
        persistSnapshotOverride: {
          ...snap,
          safetyAlerts: purged.safetyAlerts,
          aiSuggestions: purged.aiSuggestions,
        },
      });
    }
  }, [
    safetyAlerts,
    aiSuggestions,
    restrictPatientSessionId,
    sessionRole,
    savePersistedStateToCloud,
  ]);

  const resolveRedFlag = useCallback(
    (patientId: string) => {
      let payloadForCloud: Patient | null = null;
      setAllPatients((prev) =>
        prev.map((p) => {
          if (p.id !== patientId) return p;
          const next = { ...p, hasRedFlag: false, redFlagActive: false };
          payloadForCloud = next;
          return next;
        })
      );
      if (payloadForCloud) {
        void saveSinglePatientPayloadToCloud(payloadForCloud);
      }
    },
    [saveSinglePatientPayloadToCloud]
  );

  const reportPatientUrgentRedFlag = useCallback(
    (patientId: string, portalLogLine: string) => {
      const baseline = allPatientsRef.current.find((p) => p.id === patientId);
      clinical.reportPatientUrgentRedFlag(patientId, portalLogLine);
      if (baseline) {
        void saveSinglePatientPayloadToCloud({
          ...baseline,
          hasRedFlag: true,
          redFlagActive: true,
          pendingMessages: baseline.pendingMessages + 1,
        });
      }
    },
    [clinical.reportPatientUrgentRedFlag, saveSinglePatientPayloadToCloud]
  );

  const updatePatient = useCallback(
    (patientId: string, patch: Partial<Omit<Patient, 'id' | 'therapistId'>>) => {
      setAllPatients((prev) => {
        return prev.map((p) => {
          if (p.id !== patientId) return p;
          const next = { ...p, ...patch } as Patient;
          const L = Math.round(Number(next.level));
          next.level = clampPatientLevel(L) as Patient['level'];
          if (typeof next.xp === 'number' && next.xp < 0) next.xp = 0;
          if (typeof next.currentStreak === 'number' && next.currentStreak < 0) {
            next.currentStreak = 0;
          }
          if (typeof next.coins === 'number' && next.coins < 0) next.coins = 0;
          if (typeof next.xpForNextLevel !== 'number' || next.xpForNextLevel < 1) {
            next.xpForNextLevel = xpRequiredToReachNextLevel(next.level);
          }
          return next;
        });
      });
    },
    []
  );

  const resetPatientToCleanAvatar = useCallback((patientId: string) => {
    if (!canPilot11DebugMutatePatient(allPatientsRef.current, patientId)) return;
    const gate = xpRequiredToReachNextLevel(1);
    setDailySessions((prev) => prev.filter((s) => s.patientId !== patientId));
    setAllPatients((prev) =>
      prev.map((p) =>
        p.id === patientId
          ? {
              ...p,
              level: 1,
              xp: 0,
              xpForNextLevel: gate,
              coins: 0,
              currentStreak: 0,
              longestStreak: 0,
              lastSessionDate: p.joinDate,
              hasRedFlag: false,
              redFlagActive: false,
              ownedStoreItemIds: [],
              equippedItems: [],
              analytics: {
                ...p.analytics,
                sessionHistory: [],
                totalSessions: 0,
              },
            }
          : p
      )
    );
    setPatientGearByPatientId((prev) => ({
      ...prev,
      [patientId]: defaultPatientGear(),
    }));
  }, []);


  const devBreakStreakRemoveYesterday = useCallback(
    (patientId: string) => {
      if (!canPilot11DebugMutatePatient(allPatientsRef.current, patientId)) return;
      const y = getClinicalYesterday();
      setDailySessions((prev) =>
        prev.filter((s) => !(s.patientId === patientId && s.date === y))
      );
      setAllPatients((prev) =>
        prev.map((p) => {
          if (p.id !== patientId) return p;
          const sessionHistory = p.analytics.sessionHistory.filter((s) => s.date !== y);
          return {
            ...p,
            analytics: {
              ...p.analytics,
              sessionHistory,
              totalSessions: sessionHistory.length,
            },
          };
        })
      );
    },
    []
  );

  const devAdjustPatientLifetimeXp = useCallback((patientId: string, delta: number) => {
    if (!canPilot11DebugMutatePatient(allPatientsRef.current, patientId)) return;
    setAllPatients((prev) =>
      prev.map((p) => {
        if (p.id !== patientId) return p;
        const nextLife = Math.max(0, lifetimeXpFromPatient(p) + Math.round(delta));
        return patientWithLifetimeXp(p, nextLife);
      })
    );
  }, []);

  const devSetPatientLifetimeXp = useCallback((patientId: string, lifetimeXp: number) => {
    if (!canPilot11DebugMutatePatient(allPatientsRef.current, patientId)) return;
    setAllPatients((prev) =>
      prev.map((p) => {
        if (p.id !== patientId) return p;
        return patientWithLifetimeXp(p, Math.max(0, Math.floor(lifetimeXp)));
      })
    );
  }, []);

  const devSkipToNextCalendarDay = useCallback((patientId: string) => {
    if (!canPilot11DebugMutatePatient(allPatientsRef.current, patientId)) return;
    bumpDevCalendarOffsetDays({ allowInProd: true });
    const nextClinical = getClinicalDate();
    setPatientRewardMetaByPatientId((prev) => {
      const cur = prev[patientId] ?? defaultPatientRewardMeta();
      return {
        ...prev,
        [patientId]: {
          ...cur,
          dykRewardClaimedLocalYmd: null,
          dykTipOpenedLocalYmd: null,
          readArticleIds: [],
          articleLinkOpenedIds: [],
        },
      };
    });
    setDailySessions((prev) =>
      prev.filter((s) => !(s.patientId === patientId && s.date === nextClinical))
    );
    setSelfCareReportsByPatientId((prev) => ({
      ...prev,
      [patientId]: (prev[patientId] ?? []).filter((r) => r.clinicalDate !== nextClinical),
    }));
    setClinicalTick((t) => t + 1);
  }, []);

  const devSkipToPreviousCalendarDay = useCallback((patientId: string) => {
    if (!canPilot11DebugMutatePatient(allPatientsRef.current, patientId)) return;
    addDevCalendarOffsetDays(-1, { allowInProd: true });
    setClinicalTick((t) => t + 1);
  }, []);

  const devSkipClinicalDaysAhead = useCallback(
    (patientId: string, days: number) => {
      if (days <= 0 || !canPilot11DebugMutatePatient(allPatientsRef.current, patientId)) return;
      const n = Math.min(31, Math.floor(days));
      for (let i = 0; i < n; i++) {
        devSkipToNextCalendarDay(patientId);
      }
    },
    [devSkipToNextCalendarDay]
  );

  const devSeedAiLongitudinalWindow = useCallback(
    (patientId: string, scenario: AiDevLongitudinalScenario) => {
      if (!canPilot11DebugMutatePatient(allPatientsRef.current, patientId)) return;
      const plan = pickCanonicalExercisePlan(exercisePlans, patientId);
      const planIds = plan?.exercises.map((e) => e.id) ?? [];
      const totalExercises = Math.max(1, planIds.length);
      const days = rollingClinicalDayKeys(clinicalToday, AI_PROGRAM_LONGITUDINAL_WINDOW_DAYS);

      const completedForDay = (index: number): number => {
        if (scenario === 'rising_pain' || scenario === 'steady_clear') {
          if (scenario === 'steady_clear') return totalExercises;
          return Math.max(1, Math.floor(totalExercises * 0.8));
        }
        if (scenario === 'low_compliance') {
          const rates = [0.4, 0.35, 0.3, 0.95];
          return Math.floor(totalExercises * rates[index]);
        }
        const declineSeq = [
          totalExercises,
          totalExercises - 1,
          totalExercises - 2,
          totalExercises - 3,
        ].map((c) => Math.max(0, c));
        return declineSeq[index] ?? 0;
      };

      const capCompleted = (raw: number) =>
        planIds.length === 0 ? 0 : Math.min(Math.max(0, raw), planIds.length);

      setDailySessions((prev) => {
        const without = prev.filter(
          (s) => !(s.patientId === patientId && days.includes(s.date))
        );
        const additions: DailySession[] = days.map((date, i) => {
          const nDone = capCompleted(completedForDay(i));
          return {
            patientId,
            date,
            completedIds: devSliceExerciseIdsForCompleted(planIds, nDone),
            sessionXp: 40 + i * 5,
          };
        });
        return [...without, ...additions];
      });

      setAllPatients((prev) =>
        prev.map((p) => {
          if (p.id !== patientId) return p;
          const ph = p.analytics.painHistory.filter((r) => !days.includes(devClinicalDayKey(r.date)));
          const sh = p.analytics.sessionHistory.filter((s) => !days.includes(devClinicalDayKey(s.date)));

          const painLevels: PainLevel[] =
            scenario === 'rising_pain'
              ? [5, 6, 7, 8].map((x) => clampPain(x))
              : scenario === 'low_compliance'
                ? [3, 3, 3, 3].map((x) => clampPain(x))
                : scenario === 'functional_decline'
                  ? [4, 4, 4, 4].map((x) => clampPain(x))
                  : [4, 4, 4, 4].map((x) => clampPain(x));

          const newPain: PainRecord[] = days.map((d, i) => ({
            date: d,
            painLevel: painLevels[i] ?? clampPain(3),
            bodyArea: p.primaryBodyArea,
          }));

          const newSessions: ExerciseSession[] = days.map((date, i) => {
            const exercisesCompleted = capCompleted(completedForDay(i));
            return {
              date,
              exercisesCompleted,
              totalExercises,
              difficultyRating: 3,
              xpEarned: 50 + i * 3,
            };
          });

          const mergedPain = [...ph, ...newPain].sort((a, b) => a.date.localeCompare(b.date));
          const mergedSh = [...sh, ...newSessions].sort((a, b) => a.date.localeCompare(b.date));
          const agg = recomputePatientAnalyticsAggregates(mergedPain, mergedSh);
          return {
            ...p,
            lastSessionDate: clinicalToday,
            analytics: {
              ...p.analytics,
              ...agg,
              painHistory: mergedPain,
              sessionHistory: mergedSh,
            },
          };
        })
      );
    },
    [clinicalToday, exercisePlans]
  );

  const deletePatient = useCallback(
    async (patientId: string): Promise<{ ok: true } | { ok: false; message: string }> => {
      if (isSupabaseConfigured && isSupabaseAuthEnabled()) {
        const client = supabase;
        if (!client) {
          console.error('[deletePatient] Supabase client is null — לא ניתן למחוק שורה מרחוק', {
            patientId,
          });
          return { ok: false, message: 'Supabase client לא זמין למחיקה מרחוק.' };
        }
        const remote = await deletePatientRowFromSupabase(client, patientId);
        if (remote.ok === false) {
          devError('[deletePatient] Remote delete failed', { reason: remote.message, patientId: redactId(patientId) });
          return { ok: false, message: remote.message };
        }
      }

      removePatientAccountsForPatient(patientId);
      setAllPatients((prev) => prev.filter((p) => p.id !== patientId));
      setExercisePlans((prev) => prev.filter((ep) => ep.patientId !== patientId));
      setMessages((prev) => prev.filter((m) => m.patientId !== patientId));
      setDailySessions((prev) => prev.filter((s) => s.patientId !== patientId));
      setAiSuggestions((prev) => prev.filter((s) => s.patientId !== patientId));
      setSafetyAlerts((prev) => prev.filter((a) => a.patientId !== patientId));
      setExerciseSafetyLockedPatientIds((prev) => {
        const next = { ...prev };
        delete next[patientId];
        return next;
      });
      setSelfCareZonesByPatientId((prev) => {
        const next = { ...prev };
        delete next[patientId];
        return next;
      });
      setSelfCareReportsByPatientId((prev) => {
        const next = { ...prev };
        delete next[patientId];
        return next;
      });
      setPatientExerciseFinishReportsByPatientId((prev) => {
        const next = { ...prev };
        delete next[patientId];
        return next;
      });
      setSelfCareStrengthTierByPatientId((prev) => {
        const next = { ...prev };
        delete next[patientId];
        return next;
      });
      setSelectedPatientId((cur) => (cur === patientId ? '' : cur));
      setEmergencyModalPatientId((cur) => (cur === patientId ? null : cur));
      setPatientRewardMetaByPatientId((prev) => {
        const next = { ...prev };
        delete next[patientId];
        return next;
      });
      setPatientGearByPatientId((prev) => {
        const next = { ...prev };
        delete next[patientId];
        return next;
      });
      return { ok: true };
    },
    [isSupabaseConfigured, supabase]
  );



  const resetPatientMessageHistory = useCallback((patientId: string) => {
    setMessages((prev) => prev.filter((m) => m.patientId !== patientId));
  }, []);



  const patientContextValue = useMemo(
    () => ({
        patients, selectedPatient, selectedPatientId, selectPatient,
        activeSection, setActiveSection,
        messages, markMessageRead, getPatientMessages, sendTherapistReply, sendPatientMessage, sendAiClinicalAlert,
        safetyAlerts,
        dismissSafetyAlert,
        isPatientExerciseSafetyLocked,
        clearPatientExerciseSafetyLock,
        screenAndHandleEmergencyText,
        emergencyModalPatientId,
        setEmergencyModalPatientId,
        isPatientSessionLocked,
        createPatientWithAccess: exercise.createPatientWithAccess,
        resolveRedFlag,
        reportPatientUrgentRedFlag,
        setPatientContactWhatsapp: clinical.setPatientContactWhatsapp,
        exercisePlans,
        getExercisePlan: exercise.getExercisePlan,
        readExercisePlanSnapshot,
        addExerciseToPlan: exercise.addExerciseToPlan,
        removeExerciseFromPlan: exercise.removeExerciseFromPlan,
        updateExerciseInPlan: exercise.updateExerciseInPlan,
        clinicalToday,
        dailyHistoryByPatient,
        dailySessions,
        getTodaySession: exercise.getTodaySession,
        toggleExercise: exercise.toggleExercise,
        submitExerciseReport: exercise.submitExerciseReport,
        aiSuggestions,
        getPendingAiSuggestions: exercise.getPendingAiSuggestions,
        getAwaitingTherapistSuggestions: exercise.getAwaitingTherapistSuggestions,
        getTotalAwaitingTherapistCount: exercise.getTotalAwaitingTherapistCount,
        patientAgreeToAiSuggestion: exercise.patientAgreeToAiSuggestion,
        patientDeclineAiSuggestion: exercise.patientDeclineAiSuggestion,
        therapistApproveAiSuggestion,
        therapistDeclineAiSuggestion,
        submitGuardianRepsIncreaseRequest: exercise.submitGuardianRepsIncreaseRequest,
        submitPatientAiPlanAdjustmentRequest: exercise.submitPatientAiPlanAdjustmentRequest,
        grantPatientCoins: gamification.grantPatientCoins,
        markArticleAsRead: gamification.markArticleAsRead,
        hasReadArticle: gamification.hasReadArticle,
        getDidYouKnowRewardClaimedLocalYmd: gamification.getDidYouKnowRewardClaimedLocalYmd,
        recordDidYouKnowTipOpened: gamification.recordDidYouKnowTipOpened,
        getDidYouKnowTipOpenedLocalYmd: gamification.getDidYouKnowTipOpenedLocalYmd,
        recordArticleLinkOpened: gamification.recordArticleLinkOpened,
        hasArticleLinkOpened: gamification.hasArticleLinkOpened,
        hasDailyLoginBonusPending: gamification.hasDailyLoginBonusPending,
        getPatientGear: gamification.getPatientGear,
        purchaseGearItem: gamification.purchaseGearItem,
        purchaseItem: gamification.purchaseGearItem,
        equipGearItem: gamification.equipGearItem,
        unequipGearSlot: gamification.unequipGearSlot,
        purchaseStoreItem: gamification.purchaseStoreItem,
        equipStoreItem: gamification.equipStoreItem,
        unequipStoreItem: gamification.unequipStoreItem,
        claimDailyLoginBonusIfNeeded: gamification.claimDailyLoginBonusIfNeeded,
        rewardFeedback: gamification.rewardFeedback,
        clearRewardFeedback: gamification.clearRewardFeedback,
        getMountainDailyEnvironmentState,
        getMountainBackdropContext,
        getGuardiMountainAmbientLine,
        getPatientAvatarMountainElevationY,
        getPatientAvatarPostureTier,
        getPatientAvatarPostureTorsoPitchOffset,
        getPatientAvatarPhysiqueScale,
        getPatientAvatarStrengthAura,
        getPatientAvatarMuscleVisualStage,
        applyInitialClinicalProfile: exercise.applyInitialClinicalProfile,
        updateTherapistNotes: clinical.updateTherapistNotes,
        runClinicalAssessmentEngine: clinical.runClinicalAssessmentEngine,
        applyIntakeExercisePlan: exercise.applyIntakeExercisePlan,
        deletePatient,
        updatePatient,
        resetPatientToCleanAvatar,
        devMockSevenDayExerciseHistory: exercise.devMockSevenDayExerciseHistory,
        devBreakStreakRemoveYesterday,
        devAdjustPatientLifetimeXp,
        devSetPatientLifetimeXp,
        devSkipToNextCalendarDay,
        devSkipClinicalDaysAhead,
        devSeedAiLongitudinalWindow,
        devSkipToPreviousCalendarDay,
        resetPatientExercisePlan: exercise.resetPatientExercisePlan,
        resetPatientMessageHistory,
        resetPatientPainReports: clinical.resetPatientPainReports,
        togglePatientInjuryHighlight: clinical.togglePatientInjuryHighlight,
        clearPatientInjuryHighlights: clinical.clearPatientInjuryHighlights,
        cycleTherapistBodyMapClinical: clinical.cycleTherapistBodyMapClinical,
        setTherapistPrimaryBodyArea: clinical.setTherapistPrimaryBodyArea,
        applyTherapistPainFields: clinical.applyTherapistPainFields,
        getSelfCareZones: exercise.getSelfCareZones,
        toggleSelfCareZone: exercise.toggleSelfCareZone,
        logSelfCareSession: exercise.logSelfCareSession,
        getSelfCareReportsForPatient: exercise.getSelfCareReportsForPatient,
        getSelfCareReportsForClinicalDay: exercise.getSelfCareReportsForClinicalDay,
        patientExerciseFinishReportsByPatientId,
        appendPatientExerciseFinishReport: exercise.appendPatientExerciseFinishReport,
        getPatientExerciseFinishReports: exercise.getPatientExerciseFinishReports,
        getSelfCareStrengthTier: exercise.getSelfCareStrengthTier,
        setSelfCareStrengthTier: exercise.setSelfCareStrengthTier,
        supabaseConfigured: isSupabaseConfigured,
        supabaseSyncStatus,
        supabaseSyncError,
        supabaseLastSavedAt,
        unlinkedPortalPatientIds,
        savePersistedStateToCloud,
        saveSinglePatientPayloadToCloud,
        saveExercisePlanForPatientToCloud,
        persistExercisePlanCacheForPatient,
        replaceExercisePlanForPatient: exercise.replaceExercisePlanForPatient,
        knowledgeFacts: gamification.knowledgeFacts,
        addManualKnowledgeFact: addManualKnowledgeFactAndForceCloudSave,
        deleteKnowledgeFactAndForceCloudSave,
        refreshKnowledgeBaseFromCloud: refreshKnowledgeBaseFromCloudMerged,
        hasHydratedKbFromCloud,
    }),
    [
      patients,
      selectedPatient,
      selectedPatientId,
      selectPatient,
      activeSection,
      setActiveSection,
      messages,
      markMessageRead,
      getPatientMessages,
      sendTherapistReply,
      sendPatientMessage,
      sendAiClinicalAlert,
      safetyAlerts,
      dismissSafetyAlert,
      isPatientExerciseSafetyLocked,
      clearPatientExerciseSafetyLock,
      screenAndHandleEmergencyText,
      emergencyModalPatientId,
      setEmergencyModalPatientId,
      isPatientSessionLocked,
      exercise.createPatientWithAccess,
      resolveRedFlag,
      reportPatientUrgentRedFlag,
      clinical.setPatientContactWhatsapp,
      exercisePlans,
      exercise.getExercisePlan,
      readExercisePlanSnapshot,
      exercise.addExerciseToPlan,
      exercise.removeExerciseFromPlan,
      exercise.updateExerciseInPlan,
      clinicalToday,
      dailyHistoryByPatient,
      dailySessions,
      exercise.getTodaySession,
      exercise.toggleExercise,
      exercise.submitExerciseReport,
      aiSuggestions,
      exercise.getPendingAiSuggestions,
      exercise.getAwaitingTherapistSuggestions,
      exercise.getTotalAwaitingTherapistCount,
      exercise.patientAgreeToAiSuggestion,
      exercise.patientDeclineAiSuggestion,
      therapistApproveAiSuggestion,
      therapistDeclineAiSuggestion,
      exercise.submitGuardianRepsIncreaseRequest,
      exercise.submitPatientAiPlanAdjustmentRequest,
      gamification.grantPatientCoins,
      gamification.markArticleAsRead,
      gamification.hasReadArticle,
      gamification.getDidYouKnowRewardClaimedLocalYmd,
      gamification.recordDidYouKnowTipOpened,
      gamification.getDidYouKnowTipOpenedLocalYmd,
      gamification.recordArticleLinkOpened,
      gamification.hasArticleLinkOpened,
      gamification.hasDailyLoginBonusPending,
      gamification.getPatientGear,
      gamification.purchaseGearItem,
      gamification.equipGearItem,
      gamification.unequipGearSlot,
      gamification.purchaseStoreItem,
      gamification.equipStoreItem,
      gamification.unequipStoreItem,
      gamification.claimDailyLoginBonusIfNeeded,
      gamification.rewardFeedback,
      gamification.clearRewardFeedback,
      exercise.applyInitialClinicalProfile,
      clinical.updateTherapistNotes,
      clinical.runClinicalAssessmentEngine,
      exercise.applyIntakeExercisePlan,
      deletePatient,
      updatePatient,
      resetPatientToCleanAvatar,
      exercise.devMockSevenDayExerciseHistory,
      devBreakStreakRemoveYesterday,
      devAdjustPatientLifetimeXp,
      devSetPatientLifetimeXp,
      devSkipToNextCalendarDay,
      devSkipClinicalDaysAhead,
      devSeedAiLongitudinalWindow,
      devSkipToPreviousCalendarDay,
      exercise.resetPatientExercisePlan,
      resetPatientMessageHistory,
      clinical.resetPatientPainReports,
      clinical.togglePatientInjuryHighlight,
      clinical.clearPatientInjuryHighlights,
      clinical.cycleTherapistBodyMapClinical,
      clinical.setTherapistPrimaryBodyArea,
      clinical.applyTherapistPainFields,
      exercise.getSelfCareZones,
      exercise.toggleSelfCareZone,
      exercise.logSelfCareSession,
      exercise.getSelfCareReportsForPatient,
      exercise.getSelfCareReportsForClinicalDay,
      patientExerciseFinishReportsByPatientId,
      exercise.appendPatientExerciseFinishReport,
      exercise.getPatientExerciseFinishReports,
      exercise.getSelfCareStrengthTier,
      exercise.setSelfCareStrengthTier,
      isSupabaseConfigured,
      supabaseSyncStatus,
      supabaseSyncError,
      supabaseLastSavedAt,
      unlinkedPortalPatientIds,
      savePersistedStateToCloud,
      saveSinglePatientPayloadToCloud,
      saveExercisePlanForPatientToCloud,
      persistExercisePlanCacheForPatient,
      exercise.replaceExercisePlanForPatient,
      gamification.knowledgeFacts,
      addManualKnowledgeFactAndForceCloudSave,
      deleteKnowledgeFactAndForceCloudSave,
      refreshKnowledgeBaseFromCloudMerged,
      hasHydratedKbFromCloud,
    ]
  );

  const rosterSlice = useMemo<PatientRosterSlice>(
    () => ({
      patients: patientContextValue.patients,
      selectedPatient: patientContextValue.selectedPatient,
      selectedPatientId: patientContextValue.selectedPatientId,
      selectPatient: patientContextValue.selectPatient,
      activeSection: patientContextValue.activeSection,
      setActiveSection: patientContextValue.setActiveSection,
      isPatientSessionLocked: patientContextValue.isPatientSessionLocked,
      createPatientWithAccess: patientContextValue.createPatientWithAccess,
      getTotalAwaitingTherapistCount: patientContextValue.getTotalAwaitingTherapistCount,
      aiSuggestions: patientContextValue.aiSuggestions,
      unlinkedPortalPatientIds: patientContextValue.unlinkedPortalPatientIds,
    }),
    [
      patientContextValue.patients,
      patientContextValue.selectedPatient,
      patientContextValue.selectedPatientId,
      patientContextValue.selectPatient,
      patientContextValue.activeSection,
      patientContextValue.setActiveSection,
      patientContextValue.isPatientSessionLocked,
      patientContextValue.createPatientWithAccess,
      patientContextValue.getTotalAwaitingTherapistCount,
      patientContextValue.aiSuggestions,
      patientContextValue.unlinkedPortalPatientIds,
    ]
  );

  const chatSlice = useMemo<PatientChatSlice>(
    () => ({
      messages: patientContextValue.messages,
      markMessageRead: patientContextValue.markMessageRead,
      getPatientMessages: patientContextValue.getPatientMessages,
      sendTherapistReply: patientContextValue.sendTherapistReply,
      sendPatientMessage: patientContextValue.sendPatientMessage,
      sendAiClinicalAlert: patientContextValue.sendAiClinicalAlert,
      safetyAlerts: patientContextValue.safetyAlerts,
      dismissSafetyAlert: patientContextValue.dismissSafetyAlert,
      screenAndHandleEmergencyText: patientContextValue.screenAndHandleEmergencyText,
      emergencyModalPatientId: patientContextValue.emergencyModalPatientId,
      setEmergencyModalPatientId: patientContextValue.setEmergencyModalPatientId,
    }),
    [
      patientContextValue.messages,
      patientContextValue.markMessageRead,
      patientContextValue.getPatientMessages,
      patientContextValue.sendTherapistReply,
      patientContextValue.sendPatientMessage,
      patientContextValue.sendAiClinicalAlert,
      patientContextValue.safetyAlerts,
      patientContextValue.dismissSafetyAlert,
      patientContextValue.screenAndHandleEmergencyText,
      patientContextValue.emergencyModalPatientId,
      patientContextValue.setEmergencyModalPatientId,
    ]
  );

  const exerciseSlice = useMemo<PatientExerciseSlice>(
    () => ({
      exercisePlans: patientContextValue.exercisePlans,
      getExercisePlan: patientContextValue.getExercisePlan,
      readExercisePlanSnapshot: patientContextValue.readExercisePlanSnapshot,
      addExerciseToPlan: patientContextValue.addExerciseToPlan,
      removeExerciseFromPlan: patientContextValue.removeExerciseFromPlan,
      updateExerciseInPlan: patientContextValue.updateExerciseInPlan,
      dailySessions: patientContextValue.dailySessions,
      clinicalToday: patientContextValue.clinicalToday,
      dailyHistoryByPatient: patientContextValue.dailyHistoryByPatient,
      getTodaySession: patientContextValue.getTodaySession,
      toggleExercise: patientContextValue.toggleExercise,
      submitExerciseReport: patientContextValue.submitExerciseReport,
      isPatientExerciseSafetyLocked: patientContextValue.isPatientExerciseSafetyLocked,
      submitPatientAiPlanAdjustmentRequest: patientContextValue.submitPatientAiPlanAdjustmentRequest,
      getSelfCareZones: patientContextValue.getSelfCareZones,
      toggleSelfCareZone: patientContextValue.toggleSelfCareZone,
      logSelfCareSession: patientContextValue.logSelfCareSession,
      getSelfCareReportsForPatient: patientContextValue.getSelfCareReportsForPatient,
      appendPatientExerciseFinishReport: patientContextValue.appendPatientExerciseFinishReport,
      getPatientExerciseFinishReports: patientContextValue.getPatientExerciseFinishReports,
      getSelfCareStrengthTier: patientContextValue.getSelfCareStrengthTier,
      setSelfCareStrengthTier: patientContextValue.setSelfCareStrengthTier,
    }),
    [
      patientContextValue.exercisePlans,
      patientContextValue.getExercisePlan,
      patientContextValue.readExercisePlanSnapshot,
      patientContextValue.addExerciseToPlan,
      patientContextValue.removeExerciseFromPlan,
      patientContextValue.updateExerciseInPlan,
      patientContextValue.dailySessions,
      patientContextValue.clinicalToday,
      patientContextValue.dailyHistoryByPatient,
      patientContextValue.getTodaySession,
      patientContextValue.toggleExercise,
      patientContextValue.submitExerciseReport,
      patientContextValue.isPatientExerciseSafetyLocked,
      patientContextValue.submitPatientAiPlanAdjustmentRequest,
      patientContextValue.getSelfCareZones,
      patientContextValue.toggleSelfCareZone,
      patientContextValue.logSelfCareSession,
      patientContextValue.getSelfCareReportsForPatient,
      patientContextValue.appendPatientExerciseFinishReport,
      patientContextValue.getPatientExerciseFinishReports,
      patientContextValue.getSelfCareStrengthTier,
      patientContextValue.setSelfCareStrengthTier,
    ]
  );

  const gamificationSlice = useMemo<PatientGamificationSlice>(
    () => ({
      grantPatientCoins: patientContextValue.grantPatientCoins,
      markArticleAsRead: patientContextValue.markArticleAsRead,
      hasReadArticle: patientContextValue.hasReadArticle,
      getPatientGear: patientContextValue.getPatientGear,
      purchaseGearItem: patientContextValue.purchaseGearItem,
      equipGearItem: patientContextValue.equipGearItem,
      unequipGearSlot: patientContextValue.unequipGearSlot,
      purchaseStoreItem: patientContextValue.purchaseStoreItem,
      equipStoreItem: patientContextValue.equipStoreItem,
      unequipStoreItem: patientContextValue.unequipStoreItem,
      claimDailyLoginBonusIfNeeded: patientContextValue.claimDailyLoginBonusIfNeeded,
      hasDailyLoginBonusPending: patientContextValue.hasDailyLoginBonusPending,
      rewardFeedback: patientContextValue.rewardFeedback,
      clearRewardFeedback: patientContextValue.clearRewardFeedback,
      getMountainDailyEnvironmentState: patientContextValue.getMountainDailyEnvironmentState,
      getMountainBackdropContext: patientContextValue.getMountainBackdropContext,
      knowledgeFacts: patientContextValue.knowledgeFacts,
    }),
    [
      patientContextValue.grantPatientCoins,
      patientContextValue.markArticleAsRead,
      patientContextValue.hasReadArticle,
      patientContextValue.getPatientGear,
      patientContextValue.purchaseGearItem,
      patientContextValue.equipGearItem,
      patientContextValue.unequipGearSlot,
      patientContextValue.purchaseStoreItem,
      patientContextValue.equipStoreItem,
      patientContextValue.unequipStoreItem,
      patientContextValue.claimDailyLoginBonusIfNeeded,
      patientContextValue.hasDailyLoginBonusPending,
      patientContextValue.rewardFeedback,
      patientContextValue.clearRewardFeedback,
      patientContextValue.getMountainDailyEnvironmentState,
      patientContextValue.getMountainBackdropContext,
      patientContextValue.knowledgeFacts,
    ]
  );

  const syncSlice = useMemo<PatientSyncSlice>(
    () => ({
      supabaseSyncStatus: patientContextValue.supabaseSyncStatus,
      supabaseSyncError: patientContextValue.supabaseSyncError,
      supabaseLastSavedAt: patientContextValue.supabaseLastSavedAt,
      supabaseConfigured: patientContextValue.supabaseConfigured,
      savePersistedStateToCloud: patientContextValue.savePersistedStateToCloud,
    }),
    [
      patientContextValue.supabaseSyncStatus,
      patientContextValue.supabaseSyncError,
      patientContextValue.supabaseLastSavedAt,
      patientContextValue.supabaseConfigured,
      patientContextValue.savePersistedStateToCloud,
    ]
  );

  return (
    <PatientContext.Provider value={patientContextValue}>
      <PatientDomainProviders
        roster={rosterSlice}
        chat={chatSlice}
        exercise={exerciseSlice}
        gamification={gamificationSlice}
        sync={syncSlice}
      >
        {children}
      </PatientDomainProviders>
    </PatientContext.Provider>
  );
}

export function usePatient() {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error('usePatient must be used inside PatientProvider');
  return ctx;
}


