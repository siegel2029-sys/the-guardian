// @refresh reset
import {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  useEffect,
  useRef,
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
import { getClinicalDate, getClinicalYesterday } from '../utils/clinicalCalendar';
import { addDevCalendarOffsetDays, bumpDevCalendarOffsetDays } from '../utils/debugMockDate';
import { canPilot11DebugMutatePatient } from '../utils/pilot11GamificationDebug';
import { mergeHistoryFromSessions } from '../utils/dailyHistory';
import { pickCanonicalExercisePlan } from '../utils/exercisePlanCanonical';
import {
  savePersistedPatientState,
  PATIENT_STATE_STORAGE_KEY,
  type PersistedPatientStateV1,
  type PatientGearPersistedV1,
} from './patientPersistence';
import { ensurePatientAccountsForPatients, removePatientAccountsForPatient } from './authPersistence';
import { readPersistedOnce } from '../bootstrap/persistedBootstrap';
import {
  xpRequiredToReachNextLevel,
  normalizePatientProgressFields,
  clampPatientLevel,
  patientWithLifetimeXp,
  lifetimeXpFromPatient,
} from '../body/patientLevelXp';
import { computeStreakForPatient } from '../utils/exerciseStreak';
import { type GearEquipSlot } from '../config/gearCatalog';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { isSupabaseAuthEnabled } from '../lib/patientPortalAuth';
import { fetchPatientPayloadsForTherapist } from '../services/clinicalService';
import { pushPersistedStateToSupabase, type PushPersistedStateOptions } from '../lib/supabaseSync';
import { useAuth } from './AuthContext';
import { normalizeKnowledgeFactsList } from '../utils/knowledgeFactNormalize';
import type {
  GearPurchaseResult,
  PatientRewardFeedback,
  MountainDailyEnvironmentState,
  MountainBackdropContext,
  PatientAvatarPostureTier,
} from '../hooks/useGamification';
import type { MuscleEvolutionStage } from '../body/anatomicalEvolution';
import { useGamification } from '../hooks/useGamification';
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

export type {
  GearPurchaseResult,
  PatientRewardFeedback,
  MountainDailyEnvironmentState,
  MountainBackdropContext,
  PatientAvatarPostureTier,
} from '../hooks/useGamification';
export type { GearEquipSlot } from '../config/gearCatalog';

export type PatientGearState = PatientGearPersistedV1;

function defaultPatientGear(): PatientGearState {
  return {
    ownedGearIds: [],
    equippedSkin: null,
    equippedAura: null,
    equippedHands: null,
    equippedTorso: null,
    equippedChestEmblem: null,
    equippedFeetFx: null,
    equippedCape: null,
    equippedPassiveId: null,
    streakShieldCharges: 0,
  };
}

function normalizePatientGear(v: Partial<PatientGearState> | undefined): PatientGearState {
  return {
    ownedGearIds: [...(v?.ownedGearIds ?? [])],
    equippedSkin: v?.equippedSkin ?? null,
    equippedAura: v?.equippedAura ?? null,
    equippedHands: v?.equippedHands ?? null,
    equippedTorso: v?.equippedTorso ?? null,
    equippedChestEmblem: v?.equippedChestEmblem ?? null,
    equippedFeetFx: v?.equippedFeetFx ?? null,
    equippedCape: v?.equippedCape ?? null,
    equippedPassiveId: v?.equippedPassiveId ?? null,
    streakShieldCharges: Math.max(0, v?.streakShieldCharges ?? 0),
  };
}

// ── Context shape ────────────────────────────────────────────────

interface PatientContextValue {
  // Patients
  patients: Patient[];
  selectedPatient: Patient | null;
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
  addExerciseToPlan: (patientId: string, exercise: Exercise) => void;
  removeExerciseFromPlan: (patientId: string, exerciseId: string) => void;
  updateExerciseInPlan: (
    patientId: string,
    exerciseId: string,
    updates: Partial<
      Pick<PatientExercise, 'patientReps' | 'patientSets' | 'patientWeightKg' | 'isOptional'>
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
    }
  ) => void;

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

  /** מחיקת מטופל מהמערכת (כולל auth פורטל) */
  deletePatient: (patientId: string) => void;
  /**
   * מיזוג חלקי לשדות מטופל — לדיבוג פיתוח בלבד (ב־production אין השפעה).
   */
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

  /** אזורי פרהאב/כוח שנבחרו על ידי המטופל (לא כולל אזור קליני ראשי) */
  getSelfCareZones: (patientId: string) => BodyArea[];
  toggleSelfCareZone: (patientId: string, area: BodyArea) => void;
  /** דיווחי תרגילי self-care לפי תאריך קליני */
  logSelfCareSession: (
    patientId: string,
    exerciseId: string,
    exerciseName: string,
    effortRating: 1 | 2 | 3 | 4 | 5
  ) => void;
  getSelfCareReportsForPatient: (patientId: string) => SelfCareSessionReport[];
  getSelfCareReportsForClinicalDay: (patientId: string, clinicalDate: string) => SelfCareSessionReport[];

  /** דיווחי סיום מתוך מודאל האימון (נשמרים ב-localStorage) */
  patientExerciseFinishReportsByPatientId: Record<string, PatientExerciseFinishReport[]>;
  appendPatientExerciseFinishReport: (
    patientId: string,
    entry: Omit<PatientExerciseFinishReport, 'id' | 'patientId' | 'timestamp'>
  ) => void;
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
  savePersistedStateToCloud: (options?: {
    exercisePlanChangeSummaryByPatientId?: Record<string, string>;
  }) => Promise<boolean>;

  /** בסיס ידע "הידעת?" — אישור מטפל וסנכרון */
  knowledgeFacts: KnowledgeFact[];
  addManualKnowledgeFact: (input: {
    teaser: string;
    title: string;
    explanation: string;
    sourceUrl: string;
  }) => void;
  removeKnowledgeFact: (factId: string) => void;
  /** טעינה מ־Supabase — מחליפה את רשימת העובדות מהענן */
  refreshKnowledgeBaseFromCloud: () => Promise<void>;
}

const PatientContext = createContext<PatientContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────

export function randomPatientPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function normalizePatientsTherapistIds(
  list: Patient[],
  options?: { fallbackTherapistId?: string | null }
): Patient[] {
  const fallback = options?.fallbackTherapistId ?? '';
  return list.map((p) => {
    const wa = (p.contactWhatsappE164 ?? '').replace(/\D/g, '');
    return normalizePatientProgressFields({
      ...p,
      therapistId: p.therapistId ?? fallback,
      injuryHighlightSegments: Array.isArray(p.injuryHighlightSegments)
        ? p.injuryHighlightSegments
        : [],
      secondaryClinicalBodyAreas: Array.isArray(p.secondaryClinicalBodyAreas)
        ? p.secondaryClinicalBodyAreas
        : [],
      contactWhatsappE164: wa.length >= 9 ? wa : undefined,
      redFlagActive: p.redFlagActive === true,
    });
  });
}

function patientMatchesTherapistScope(p: Patient, scopeIds: string[] | null | undefined): boolean {
  if (!scopeIds || scopeIds.length === 0) return true;
  return scopeIds.includes(p.therapistId);
}

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
    return scoped[0]?.id ?? listAll[0]?.id ?? '';
  });
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [messages, setMessages] = useState<Message[]>(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.messages ?? [];
  });
  const [exercisePlans, setExercisePlans] = useState<ExercisePlan[]>(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.exercisePlans ?? [];
  });
  const [dailySessions, setDailySessions] = useState<DailySession[]>(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.dailySessions ?? [];
  });
  const [dailyHistoryByPatient, setDailyHistoryByPatient] = useState<
    Record<string, Record<string, DailyHistoryEntry>>
  >(() => {
    const persisted = readPersistedOnce().patient;
    return mergeHistoryFromSessions(
      persisted?.dailySessions ?? [],
      persisted?.exercisePlans ?? [],
      {}
    );
  });
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.aiSuggestions ?? [];
  });
  const [safetyAlerts, setSafetyAlerts] = useState<SafetyAlert[]>(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.safetyAlerts ?? [];
  });
  const [exerciseSafetyLockedPatientIds, setExerciseSafetyLockedPatientIds] = useState<
    Record<string, boolean>
  >(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.exerciseSafetyLockedPatientIds ?? {};
  });
  const [emergencyModalPatientId, setEmergencyModalPatientId] = useState<string | null>(null);
  const [selfCareZonesByPatientId, setSelfCareZonesByPatientId] = useState<
    Record<string, BodyArea[]>
  >(() => readPersistedOnce().patient?.selfCareZonesByPatientId ?? {});
  const [selfCareReportsByPatientId, setSelfCareReportsByPatientId] = useState<
    Record<string, SelfCareSessionReport[]>
  >(() => readPersistedOnce().patient?.selfCareReportsByPatientId ?? {});
  const [patientExerciseFinishReportsByPatientId, setPatientExerciseFinishReportsByPatientId] =
    useState<Record<string, PatientExerciseFinishReport[]>>(
      () => readPersistedOnce().patient?.patientExerciseFinishReportsByPatientId ?? {}
    );
  const [selfCareStrengthTierByPatientId, setSelfCareStrengthTierByPatientId] = useState<
    Record<string, Partial<Record<BodyArea, 0 | 1 | 2>>>
  >(() => readPersistedOnce().patient?.selfCareStrengthTierByPatientId ?? {});

  const [patientRewardMetaByPatientId, setPatientRewardMetaByPatientId] = useState<
    Record<string, PatientRewardMeta>
  >(() => {
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
    const raw = readPersistedOnce().patient?.patientGearByPatientId ?? {};
    const out: Record<string, PatientGearState> = {};
    for (const [pid, v] of Object.entries(raw)) {
      out[pid] = normalizePatientGear(v);
    }
    return out;
  });

  const [knowledgeFacts, setKnowledgeFacts] = useState<KnowledgeFact[]>(() => {
    const persisted = readPersistedOnce().patient;
    return normalizeKnowledgeFactsList(persisted?.knowledgeFacts);
  });

  const [supabaseSyncStatus, setSupabaseSyncStatus] = useState<
    'idle' | 'saving' | 'saved' | 'error'
  >('idle');
  const [supabaseSyncError, setSupabaseSyncError] = useState<string | null>(null);
  const [supabaseLastSavedAt, setSupabaseLastSavedAt] = useState<string | null>(null);

  /** דילוג על ריצה ראשונה — מניעת דחיפה מלאה לענן בטעינת דף ללא שינוי */
  const dailySessionsHydratedRef = useRef(false);
  const knowledgeFactsHydratedRef = useRef(false);
  /**
   * Mutex: prevents two concurrent savePersistedStateToCloud calls from racing each other
   * and causing a double-insert on exercise_plans (→ unique constraint violation).
   * Stores the in-flight promise; callers await it before starting a new save.
   */
  const cloudSaveMutexRef = useRef<Promise<boolean> | null>(null);

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
   * Hydrate own patient record from Supabase when a patient is logged in on a fresh device.
   * RLS `patients_select_patient` (auth_user_id = auth.uid()) returns only their own row.
   * This is required because allPatients initialises from localStorage/mockPatients which
   * won't contain the real patient on a brand-new device.
   */
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    if (!restrictPatientSessionId) return;
    if (authLoading || !isAuthenticated) return;
    if (allPatientsRef.current.some((p) => p.id === restrictPatientSessionId)) return;

    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('patients')
        .select('payload')
        .eq('id', restrictPatientSessionId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        if (import.meta.env.DEV) console.warn('[PatientContext] patient self-fetch', error.message);
        return;
      }
      const payload = (data as { payload?: unknown } | null)?.payload;
      if (
        !payload ||
        typeof payload !== 'object' ||
        !('id' in payload) ||
        typeof (payload as { id?: unknown }).id !== 'string'
      ) return;

      const fetched = payload as Patient;
      setAllPatients((prev) => {
        if (prev.some((p) => p.id === fetched.id)) return prev;
        return [...prev, fetched];
      });
    })();
    return () => { cancelled = true; };
  }, [restrictPatientSessionId, authLoading, isAuthenticated]);

  /** Hydrate patient list from Supabase (RLS returns only rows for the signed-in therapist). */
  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) return;
    if (restrictPatientSessionId) return;
    if (authLoading) return;
    if (sessionRole !== 'therapist') return;
    if (!isAuthenticated || !therapist?.id) return;

    let cancelled = false;
    void (async () => {
      const list = await fetchPatientPayloadsForTherapist(supabase);
      if (cancelled || list.length === 0) return;
      setAllPatients((prev) => {
        const normalized = normalizePatientsTherapistIds(list, { fallbackTherapistId: therapist.id });
        const byId = new Map<string, Patient>(normalized.map((p) => [p.id, p]));
        for (const p of prev) {
          if (!byId.has(p.id)) byId.set(p.id, p);
        }
        return normalizePatientsTherapistIds([...byId.values()], { fallbackTherapistId: therapist.id });
      });
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
  ]);

  useEffect(() => {
    if (!therapistScopeIds?.length || restrictPatientSessionId) return;
    const mine = allPatients.filter((p) => patientMatchesTherapistScope(p, therapistScopeIds));
    if (!mine.some((p) => p.id === selectedPatientId)) {
      setSelectedPatientId(mine[0]?.id ?? '');
    }
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

  const buildPersistSnapshot = useCallback((): PersistedPatientStateV1 => {
    return {
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

  const savePersistedStateToCloud = useCallback(
    async (options?: {
      exercisePlanChangeSummaryByPatientId?: Record<string, string>;
    }) => {
      if (!supabase) {
        setSupabaseSyncError(
          'Supabase לא מוגדר: הוסיפו VITE_SUPABASE_URL ו־VITE_SUPABASE_ANON_KEY לקובץ .env והפעילו מחדש את השרת.'
        );
        setSupabaseSyncStatus('idle');
        return false;
      }
      /** Therapist/patient cloud writes require a real JWT — anon key cannot upsert profiles (400 / RLS). */
      if (isSupabaseConfigured && !isAuthenticated) {
        setSupabaseSyncStatus('idle');
        return false;
      }

      // Wait for any in-flight save to finish before starting a new one.
      // This prevents two concurrent calls from racing on exercise_plans inserts.
      if (cloudSaveMutexRef.current) {
        try {
          await cloudSaveMutexRef.current;
        } catch {
          /* ignore errors from the previous save — we'll attempt again below */
        }
      }

      setSupabaseSyncStatus('saving');
      setSupabaseSyncError(null);
      const savePromise = pushPersistedStateToSupabase(supabase, buildPersistSnapshot(), {
        ...supabasePushOptions,
        ...options,
      });
      cloudSaveMutexRef.current = savePromise.then((r) => r.ok);
      const result = await savePromise;
      cloudSaveMutexRef.current = null;
      if (result.ok) {
        setSupabaseSyncStatus('saved');
        setSupabaseLastSavedAt(new Date().toISOString());
        return true;
      }
      setSupabaseSyncStatus('error');
      setSupabaseSyncError(result.message);
      return false;
    },
    [buildPersistSnapshot, supabasePushOptions, isAuthenticated]
  );

  /** אחרי עדכון סשנים יומיים — דחיפה ל־Supabase (מטפל: מלא; מטופל בפורטל: רק שורת patients) */
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!dailySessionsHydratedRef.current) {
      dailySessionsHydratedRef.current = true;
      return;
    }
    const t = window.setTimeout(() => {
      void savePersistedStateToCloud();
    }, 320);
    return () => window.clearTimeout(t);
  }, [dailySessions, savePersistedStateToCloud]);

  /** ידע כללי — דחיפה מלאה רק למטפל; למטופל רק שורת ה־payload ב־patients */
  useEffect(() => {
    if (!isSupabaseConfigured) return;
    if (!knowledgeFactsHydratedRef.current) {
      knowledgeFactsHydratedRef.current = true;
      return;
    }
    const t = window.setTimeout(() => {
      void savePersistedStateToCloud();
    }, 400);
    return () => window.clearTimeout(t);
  }, [knowledgeFacts, savePersistedStateToCloud]);

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
      if (
        therapistScopeIds &&
        therapistScopeIds.length > 0 &&
        !allPatients.some((p) => p.id === id && patientMatchesTherapistScope(p, therapistScopeIds))
      ) {
        return;
      }
      setSelectedPatientId(id);
      setActiveSection(options?.openSection ?? 'overview');
    },
    [restrictPatientSessionId, therapistScopeIds, allPatients]
  );

  // ── Messages ───────────────────────────────────────────────────
  const getPatientMessages = useCallback(
    (patientId: string) => messages.filter((m) => m.patientId === patientId),
    [messages]
  );

  const markMessageRead = useCallback((messageId: string) => {
    setMessages((prev) => {
      const next = prev.map((m) => (m.id === messageId ? { ...m, isRead: true } : m));
      setAllPatients((prev) =>
        prev.map((p) => ({
          ...p,
          pendingMessages: next.filter(
            (m) =>
              m.patientId === p.id &&
              !m.isRead &&
              (m.fromPatient || m.aiClinicalAlert)
          ).length,
        }))
      );
      return next;
    });
  }, []);

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

  const sendTherapistReply = useCallback((patientId: string, content: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `msg-${Date.now()}`,
        patientId,
        content,
        timestamp: new Date().toISOString(),
        isRead: false,
        fromPatient: false,
      },
    ]);
  }, []);

  const sendPatientMessage = useCallback(
    (patientId: string, content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return;
      const em = screenPatientFreeTextForEmergency(trimmed);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}`,
          patientId,
          content: trimmed,
          timestamp: new Date().toISOString(),
          isRead: false,
          fromPatient: true,
        },
      ]);
      setAllPatients((prev) =>
        prev.map((p) =>
          p.id === patientId ? { ...p, pendingMessages: p.pendingMessages + 1 } : p
        )
      );
      if (em.isEmergency) {
        applyEmergencyProtocol(patientId, trimmed, em, 'הודעה למטפל');
      }
    },
    [applyEmergencyProtocol]
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
  });

  const clinical = useClinicalData({
    allPatients,
    setAllPatients,
    setMessages,
    setSelfCareZonesByPatientId,
    exercisePlans,
    setAiSuggestions,
    clinicalToday,
    restrictPatientSessionId,
  });


  const updatePatient = useCallback(
    (patientId: string, patch: Partial<Omit<Patient, 'id' | 'therapistId'>>) => {
      setAllPatients((prev) => {
        if (!canPilot11DebugMutatePatient(prev, patientId)) return prev;
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
          if (typeof next.xpForNextLevel === 'number' && next.xpForNextLevel < 1) {
            next.xpForNextLevel = 100;
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

  const deletePatient = useCallback((patientId: string) => {
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
  }, []);



  const resetPatientMessageHistory = useCallback((patientId: string) => {
    setMessages((prev) => prev.filter((m) => m.patientId !== patientId));
  }, []);



  return (
    <PatientContext.Provider
      value={{
        patients, selectedPatient, selectPatient,
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
        resolveRedFlag: clinical.resolveRedFlag,
        reportPatientUrgentRedFlag: clinical.reportPatientUrgentRedFlag,
        setPatientContactWhatsapp: clinical.setPatientContactWhatsapp,
        exercisePlans,
        getExercisePlan: exercise.getExercisePlan,
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
        therapistApproveAiSuggestion: exercise.therapistApproveAiSuggestion,
        therapistDeclineAiSuggestion: exercise.therapistDeclineAiSuggestion,
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
        claimDailyLoginBonusIfNeeded: gamification.claimDailyLoginBonusIfNeeded,
        rewardFeedback: gamification.rewardFeedback,
        clearRewardFeedback: gamification.clearRewardFeedback,
        getMountainDailyEnvironmentState: gamification.getMountainDailyEnvironmentState,
        getMountainBackdropContext: gamification.getMountainBackdropContext,
        getGuardiMountainAmbientLine: gamification.getGuardiMountainAmbientLine,
        getPatientAvatarMountainElevationY: gamification.getPatientAvatarMountainElevationY,
        getPatientAvatarPostureTier: gamification.getPatientAvatarPostureTier,
        getPatientAvatarPostureTorsoPitchOffset: gamification.getPatientAvatarPostureTorsoPitchOffset,
        getPatientAvatarPhysiqueScale: gamification.getPatientAvatarPhysiqueScale,
        getPatientAvatarStrengthAura: gamification.getPatientAvatarStrengthAura,
        getPatientAvatarMuscleVisualStage: gamification.getPatientAvatarMuscleVisualStage,
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
        savePersistedStateToCloud,
        knowledgeFacts: gamification.knowledgeFacts,
        addManualKnowledgeFact: gamification.addManualKnowledgeFact,
        removeKnowledgeFact: gamification.removeKnowledgeFact,
        refreshKnowledgeBaseFromCloud: gamification.refreshKnowledgeBaseFromCloud,
      }}
    >
      {children}
    </PatientContext.Provider>
  );
}

export function usePatient() {
  const ctx = useContext(PatientContext);
  if (!ctx) throw new Error('usePatient must be used inside PatientProvider');
  return ctx;
}


