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
  Patient, NavSection, Message, ExercisePlan, DailySession,
  PatientExercise, AiSuggestion, Exercise, PainLevel, ExerciseSession, AiSuggestionSource,
  SafetyAlert, ClinicalSafetyTier, DailyHistoryEntry, BodyArea,
  SelfCareSessionReport,
  PatientExerciseFinishReport,
} from '../types';
import { bodyAreaLabels } from '../types';
import {
  mockPatients, mockMessages, mockExercisePlans, mockAiSuggestions, EXERCISE_LIBRARY, mockTherapist,
} from '../data/mockData';
import { getClinicalAlertStandardMessage } from '../ai/patientProgressReasoning';
import {
  screenPatientFreeTextForEmergency,
  PAIN_SURGE_PATIENT_COPY,
  DIFFICULTY_MAX_PATIENT_COPY,
  type EmergencyScreenResult,
} from '../safety/clinicalEmergencyScreening';
import { getClinicalDate, getClinicalYesterday, addClinicalDays } from '../utils/clinicalCalendar';
import { computeClinicalProgressInsight } from '../ai/clinicalCommandInsight';
import { mergeHistoryFromSessions } from '../utils/dailyHistory';
import {
  savePersistedPatientState,
  PATIENT_STATE_STORAGE_KEY,
  type PersistedPatientStateV1,
  type PatientGearPersistedV1,
} from './patientPersistence';
import {
  addPatientAccount,
  ensurePatientAccountsForPatients,
  removePatientAccountsForPatient,
} from './authPersistence';
import { readPersistedOnce } from '../bootstrap/persistedBootstrap';
import { bodyAreaBlocksSelfCare, bodyAreaIsClinicalFocus } from '../body/bodyPickMapping';
import { isChainReactionZoneForPrimary } from '../body/chainReactionZones';
import { getTherapistAlertEmail, openClinicalMailto } from '../utils/clinicalAlertEmail';
import {
  PATIENT_MAX_LEVEL,
  xpRequiredToReachNextLevel,
  normalizePatientProgressFields,
  clampPatientLevel,
  patientWithLifetimeXp,
  lifetimeXpFromPatient,
} from '../body/patientLevelXp';
import { computeStreakForPatient } from '../utils/exerciseStreak';
import { sendDataToTherapist } from '../utils/therapistAnalytics';
import { DEFAULT_EXERCISE_DEMO_VIDEO_URL } from '../data/exerciseVideoDefaults';
import {
  PATIENT_REWARDS,
  exerciseBaseXp,
  getStreakXpMultiplier,
} from '../config/patientRewards';
import {
  GEAR_BY_ID,
  isGearItemId,
  type GearEquipSlot,
} from '../config/gearCatalog';

export type { GearEquipSlot } from '../config/gearCatalog';

export type PatientGearState = PatientGearPersistedV1;

export type GearPurchaseResult =
  | 'ok'
  | 'insufficient'
  | 'insufficient_xp'
  | 'already_owned'
  | 'invalid';

const XP_BOOSTER_MULT = 1.15;

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

function gearSlotToStateKey(slot: GearEquipSlot): keyof PatientGearState | null {
  switch (slot) {
    case 'skin':
      return 'equippedSkin';
    case 'aura':
      return 'equippedAura';
    case 'hands':
      return 'equippedHands';
    case 'torso':
      return 'equippedTorso';
    case 'chest':
      return 'equippedChestEmblem';
    case 'feet':
      return 'equippedFeetFx';
    case 'cape':
      return 'equippedCape';
    default:
      return null;
  }
}

function buildEmptySession(patientId: string, clinicalDate: string): DailySession {
  return { patientId, date: clinicalDate, completedIds: [], sessionXp: 0 };
}

function clampPain(n: number): PainLevel {
  const r = Math.round(Math.min(10, Math.max(0, n)));
  return r as PainLevel;
}

function clampEffort(n: number): 1 | 2 | 3 | 4 | 5 {
  const r = Math.round(Math.min(5, Math.max(1, n)));
  return r as 1 | 2 | 3 | 4 | 5;
}

function applyXpCoinsLevelUp(p: Patient, xpDelta: number, coinsDelta: number): Patient {
  let { xp, level, xpForNextLevel, coins } = p;
  coins += coinsDelta;
  xp += xpDelta;
  while (xp >= xpForNextLevel && level < PATIENT_MAX_LEVEL) {
    xp -= xpForNextLevel;
    level += 1;
    xpForNextLevel = xpRequiredToReachNextLevel(level);
  }
  return {
    ...p,
    coins,
    xp,
    level: level as Patient['level'],
    xpForNextLevel,
  };
}

export type PatientRewardFeedback = {
  id: number;
  xpAdded: number;
  coinsAdded: number;
  streakBonusXp?: number;
  message?: string;
};

type PatientRewardMeta = {
  readArticleIds: string[];
  lastLoginBonusClinicalDate: string | null;
  /** מאמרים שפתחו את הקישור החיצוני (נדרש לפני איסוף פרס) */
  articleLinkOpenedIds: string[];
};

function defaultPatientRewardMeta(): PatientRewardMeta {
  return { readArticleIds: [], lastLoginBonusClinicalDate: null, articleLinkOpenedIds: [] };
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
  /** התראה קלינית ממנוע Guardian לתיבת המטפל */
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
  /** יצירת מטופל + מזהה גישה וסיסמה (נשמר ב-localStorage) */
  createPatientWithAccess: (displayName: string) => {
    loginId: string;
    password: string;
    patientId: string;
  };

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
    updates: Partial<Pick<PatientExercise, 'patientReps' | 'patientSets' | 'patientWeightKg'>>
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
  /** Guardian: בקשת העלאת חזרות למטפל */
  submitGuardianRepsIncreaseRequest: (
    patientId: string,
    exerciseId: string,
    exerciseName: string,
    currentReps: number,
    suggestedReps: number
  ) => void;

  /** בונוס למידה (מטבעות) בתצוגת מטופל */
  grantPatientCoins: (patientId: string, amount: number) => void;
  /**
   * מאמר / הידעת — פרס חד-פעמי לכל articleId (שמור ב-localStorage).
   * דורש שפתיחת הקישור נרשמה ו־readerConfirmed (תיבת סימון).
   */
  markArticleAsRead: (
    patientId: string,
    articleId: string,
    options?: { readerConfirmed?: boolean }
  ) => boolean;
  hasReadArticle: (patientId: string, articleId: string) => boolean;
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

  /** אזור גוף + תוכנית התחלתית מספרייה (אונבורדינג מטופל חדש/ממתין) */
  applyInitialClinicalProfile: (
    patientId: string,
    primaryBodyArea: BodyArea,
    libraryExerciseIds: string[],
    extras?: { displayName?: string; intakeStory?: string }
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
}

const PatientContext = createContext<PatientContextValue | null>(null);

// ── Provider ─────────────────────────────────────────────────────

function randomPatientPassword(): string {
  const chars = 'abcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

const NEUTRAL_PRIMARY_BODY_AREA: BodyArea = 'neck';

function applyTherapistClinicalCycle(p: Patient, area: BodyArea): Patient {
  const sec = [...(p.secondaryClinicalBodyAreas ?? [])];
  if (sec.includes(area)) {
    return { ...p, secondaryClinicalBodyAreas: sec.filter((a) => a !== area) };
  }
  if (p.primaryBodyArea === area) {
    if (area === NEUTRAL_PRIMARY_BODY_AREA) {
      return { ...p, secondaryClinicalBodyAreas: [...sec, area] };
    }
    return {
      ...p,
      primaryBodyArea: NEUTRAL_PRIMARY_BODY_AREA,
      secondaryClinicalBodyAreas: sec.includes(area) ? sec : [...sec, area],
    };
  }
  if (bodyAreaIsClinicalFocus(area, p.primaryBodyArea)) {
    return { ...p, secondaryClinicalBodyAreas: [...sec, area] };
  }
  return {
    ...p,
    primaryBodyArea: area,
    secondaryClinicalBodyAreas: sec.filter((a) => a !== area),
  };
}

function normalizePatientsTherapistIds(list: Patient[]): Patient[] {
  return list.map((p) => {
    const wa = (p.contactWhatsappE164 ?? '').replace(/\D/g, '');
    return normalizePatientProgressFields({
      ...p,
      therapistId: p.therapistId ?? mockTherapist.id,
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

export function PatientProvider({
  children,
  restrictPatientSessionId = null,
  therapistScopeId = null,
}: {
  children: ReactNode;
  /** כשמוגדר — רק מטופל זה, ללא דשבורד מטפל */
  restrictPatientSessionId?: string | null;
  /** מטפל מחובר — סינון רשימת מטופלים בדשבורד */
  therapistScopeId?: string | null;
}) {
  const [clinicalTick, setClinicalTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setClinicalTick((n) => n + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const [allPatients, setAllPatients] = useState<Patient[]>(() => {
    const persisted = readPersistedOnce().patient;
    const base = persisted?.patients ?? mockPatients;
    return normalizePatientsTherapistIds(base);
  });

  const patients = useMemo(() => {
    if (restrictPatientSessionId) {
      return allPatients.filter((p) => p.id === restrictPatientSessionId);
    }
    if (therapistScopeId) {
      return allPatients.filter((p) => p.therapistId === therapistScopeId);
    }
    return allPatients;
  }, [allPatients, therapistScopeId, restrictPatientSessionId]);

  const [selectedPatientId, setSelectedPatientId] = useState<string>(() => {
    const persisted = readPersistedOnce().patient;
    const listAll = normalizePatientsTherapistIds(persisted?.patients ?? mockPatients);
    if (restrictPatientSessionId && listAll.some((p) => p.id === restrictPatientSessionId)) {
      return restrictPatientSessionId;
    }
    const scoped = therapistScopeId
      ? listAll.filter((p) => p.therapistId === therapistScopeId)
      : listAll;
    const id = persisted?.selectedPatientId;
    if (id && scoped.some((p) => p.id === id)) return id;
    return scoped[0]?.id ?? listAll[0]?.id ?? '';
  });
  const [activeSection, setActiveSection] = useState<NavSection>('overview');
  const [messages, setMessages] = useState<Message[]>(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.messages ?? mockMessages;
  });
  const [exercisePlans, setExercisePlans] = useState<ExercisePlan[]>(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.exercisePlans ?? mockExercisePlans;
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
      persisted?.exercisePlans ?? mockExercisePlans,
      {}
    );
  });
  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>(() => {
    const persisted = readPersistedOnce().patient;
    return persisted?.aiSuggestions ?? mockAiSuggestions;
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

  const [rewardFeedback, setRewardFeedback] = useState<PatientRewardFeedback | null>(null);
  const rewardFeedbackIdRef = useRef(0);

  const isPatientSessionLocked = restrictPatientSessionId != null && restrictPatientSessionId !== '';

  useEffect(() => {
    if (!restrictPatientSessionId) return;
    setSelectedPatientId(restrictPatientSessionId);
  }, [restrictPatientSessionId]);

  useEffect(() => {
    ensurePatientAccountsForPatients(
      allPatients.map((p) => ({ id: p.id, therapistId: p.therapistId }))
    );
  }, [allPatients]);

  useEffect(() => {
    if (!therapistScopeId || restrictPatientSessionId) return;
    const mine = allPatients.filter((p) => p.therapistId === therapistScopeId);
    if (!mine.some((p) => p.id === selectedPatientId)) {
      setSelectedPatientId(mine[0]?.id ?? '');
    }
  }, [therapistScopeId, allPatients, selectedPatientId, restrictPatientSessionId]);

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
  ]);

  const applyExternalSnapshot = useCallback(
    (data: PersistedPatientStateV1) => {
      setAllPatients(normalizePatientsTherapistIds(data.patients));
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
        };
      }
      setPatientRewardMetaByPatientId(nextMeta);
      const pg = data.patientGearByPatientId ?? {};
      const nextGear: Record<string, PatientGearState> = {};
      for (const [pid, v] of Object.entries(pg)) {
        nextGear[pid] = normalizePatientGear(v);
      }
      setPatientGearByPatientId(nextGear);
      if (!restrictPatientSessionId) {
        setSelectedPatientId(data.selectedPatientId ?? '');
      }
    },
    [restrictPatientSessionId]
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
        therapistScopeId &&
        !allPatients.some((p) => p.id === id && p.therapistId === therapistScopeId)
      ) {
        return;
      }
      setSelectedPatientId(id);
      setActiveSection(options?.openSection ?? 'overview');
    },
    [restrictPatientSessionId, therapistScopeId, allPatients]
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

  // ── Red flags ──────────────────────────────────────────────────
  const resolveRedFlag = useCallback((patientId: string) => {
    setAllPatients((prev) =>
      prev.map((p) =>
        p.id === patientId ? { ...p, hasRedFlag: false, redFlagActive: false } : p
      )
    );
  }, []);

  const reportPatientUrgentRedFlag = useCallback((patientId: string, portalLogLine: string) => {
    const trimmed = portalLogLine.trim();
    if (!trimmed) return;
    setAllPatients((prev) =>
      prev.map((p) =>
        p.id === patientId
          ? {
              ...p,
              hasRedFlag: true,
              redFlagActive: true,
              pendingMessages: p.pendingMessages + 1,
            }
          : p
      )
    );
    setMessages((prev) => [
      ...prev,
      {
        id: `urgent-rf-${Date.now()}`,
        patientId,
        content: trimmed,
        timestamp: new Date().toISOString(),
        isRead: false,
        fromPatient: true,
      },
    ]);
  }, []);

  const setPatientContactWhatsapp = useCallback((patientId: string, phoneRaw: string) => {
    const d = phoneRaw.replace(/\D/g, '');
    const contactWhatsappE164 = d.length >= 9 ? d : undefined;
    setAllPatients((prev) =>
      prev.map((p) => (p.id === patientId ? { ...p, contactWhatsappE164 } : p))
    );
  }, []);

  // ── Exercise plan CRUD ─────────────────────────────────────────
  const getExercisePlan = useCallback(
    (patientId: string) => exercisePlans.find((ep) => ep.patientId === patientId),
    [exercisePlans]
  );

  const addExerciseToPlan = useCallback((patientId: string, exercise: Exercise) => {
    const newEntry: PatientExercise = {
      ...exercise,
      videoUrl: exercise.videoUrl || DEFAULT_EXERCISE_DEMO_VIDEO_URL,
      id: `${patientId}-${exercise.id}-${Date.now()}`,
      patientSets: exercise.sets,
      patientReps: exercise.reps ?? 0,
      addedAt: new Date().toISOString(),
    };
    setExercisePlans((prev) => {
      const existing = prev.find((ep) => ep.patientId === patientId);
      if (existing) {
        // Don't add duplicates (check base exercise id)
        const alreadyIn = existing.exercises.some((e) =>
          e.id === newEntry.id || e.id.includes(exercise.id)
        );
        if (alreadyIn) return prev;
        return prev.map((ep) =>
          ep.patientId === patientId
            ? { ...ep, exercises: [...ep.exercises, newEntry] }
            : ep
        );
      }
      return [...prev, { patientId, exercises: [newEntry] }];
    });
  }, []);

  const removeExerciseFromPlan = useCallback((patientId: string, exerciseId: string) => {
    setExercisePlans((prev) =>
      prev.map((ep) =>
        ep.patientId === patientId
          ? { ...ep, exercises: ep.exercises.filter((e) => e.id !== exerciseId) }
          : ep
      )
    );
    // Clean up any daily session completions for this exercise
    setDailySessions((prev) =>
      prev.map((s) =>
        s.patientId === patientId
          ? { ...s, completedIds: s.completedIds.filter((id) => id !== exerciseId) }
          : s
      )
    );
  }, []);

  const updateExerciseInPlan = useCallback(
    (
      patientId: string,
      exerciseId: string,
      updates: Partial<Pick<PatientExercise, 'patientReps' | 'patientSets' | 'patientWeightKg'>>
    ) => {
      setExercisePlans((prev) =>
        prev.map((ep) =>
          ep.patientId === patientId
            ? {
                ...ep,
                exercises: ep.exercises.map((e) =>
                  e.id === exerciseId ? { ...e, ...updates } : e
                ),
              }
            : ep
        )
      );
    },
    []
  );

  // ── Daily sessions ─────────────────────────────────────────────
  const getTodaySession = useCallback(
    (patientId: string): DailySession => {
      void clinicalTick;
      const cd = getClinicalDate();
      return (
        dailySessions.find((s) => s.patientId === patientId && s.date === cd) ??
        buildEmptySession(patientId, cd)
      );
    },
    [dailySessions, clinicalTick]
  );

  const toggleExercise = useCallback(
    (patientId: string, exerciseId: string, xpReward: number) => {
      const cd = getClinicalDate();
      setDailySessions((prev) => {
        const existing = prev.find((s) => s.patientId === patientId && s.date === cd);
        if (!existing) {
          return [...prev, { patientId, date: cd, completedIds: [exerciseId], sessionXp: xpReward }];
        }
        const alreadyDone = existing.completedIds.includes(exerciseId);
        const updated: DailySession = {
          ...existing,
          completedIds: alreadyDone
            ? existing.completedIds.filter((id) => id !== exerciseId)
            : [...existing.completedIds, exerciseId],
          sessionXp: alreadyDone
            ? Math.max(0, existing.sessionXp - xpReward)
            : existing.sessionXp + xpReward,
        };
        return prev.map((s) => (s.patientId === patientId && s.date === cd ? updated : s));
      });
    },
    [clinicalTick]
  );

  const pushRewardFeedback = useCallback(
    (xpAdded: number, coinsAdded: number, streakBonusXp?: number, message?: string) => {
      rewardFeedbackIdRef.current += 1;
      setRewardFeedback({
        id: rewardFeedbackIdRef.current,
        xpAdded,
        coinsAdded,
        streakBonusXp: streakBonusXp && streakBonusXp > 0 ? streakBonusXp : undefined,
        message,
      });
    },
    []
  );

  const clearRewardFeedback = useCallback(() => setRewardFeedback(null), []);

  const grantPatientCoins = useCallback(
    (patientId: string, amount: number) => {
      if (amount <= 0) return;
      setAllPatients((prev) =>
        prev.map((p) => (p.id === patientId ? { ...p, coins: p.coins + amount } : p))
      );
      pushRewardFeedback(0, amount);
    },
    [pushRewardFeedback]
  );

  const markArticleAsRead = useCallback(
    (patientId: string, articleId: string, options?: { readerConfirmed?: boolean }) => {
      if (!options?.readerConfirmed) return false;
      const { xp: rxp, coins: rcoins } = PATIENT_REWARDS.ARTICLE_READ;
      let granted = false;
      setPatientRewardMetaByPatientId((prev) => {
        const cur = prev[patientId] ?? defaultPatientRewardMeta();
        if (cur.readArticleIds.includes(articleId)) return prev;
        if (!cur.articleLinkOpenedIds.includes(articleId)) return prev;
        granted = true;
        return {
          ...prev,
          [patientId]: {
            ...cur,
            readArticleIds: [...cur.readArticleIds, articleId],
          },
        };
      });
      if (!granted) return false;
      setAllPatients((prev) =>
        prev.map((p) =>
          p.id === patientId ? applyXpCoinsLevelUp(p, rxp, rcoins) : p
        )
      );
      pushRewardFeedback(rxp, rcoins, undefined, 'מאמר נקרא');
      return true;
    },
    [pushRewardFeedback]
  );

  const hasReadArticle = useCallback(
    (patientId: string, articleId: string) =>
      (patientRewardMetaByPatientId[patientId]?.readArticleIds ?? []).includes(articleId),
    [patientRewardMetaByPatientId]
  );

  const recordArticleLinkOpened = useCallback((patientId: string, articleId: string) => {
    setPatientRewardMetaByPatientId((prev) => {
      const cur = prev[patientId] ?? defaultPatientRewardMeta();
      if (cur.articleLinkOpenedIds.includes(articleId)) return prev;
      return {
        ...prev,
        [patientId]: {
          ...cur,
          articleLinkOpenedIds: [...cur.articleLinkOpenedIds, articleId],
        },
      };
    });
  }, []);

  const hasArticleLinkOpened = useCallback(
    (patientId: string, articleId: string) =>
      (patientRewardMetaByPatientId[patientId]?.articleLinkOpenedIds ?? []).includes(articleId),
    [patientRewardMetaByPatientId]
  );

  const hasDailyLoginBonusPending = useCallback(
    (patientId: string) => {
      const day = getClinicalDate();
      return (patientRewardMetaByPatientId[patientId]?.lastLoginBonusClinicalDate ?? null) !== day;
    },
    [patientRewardMetaByPatientId]
  );

  const getPatientGear = useCallback(
    (patientId: string) => patientGearByPatientId[patientId] ?? defaultPatientGear(),
    [patientGearByPatientId]
  );

  const purchaseGearItem = useCallback(
    (patientId: string, rawId: string): GearPurchaseResult => {
      if (!isGearItemId(rawId)) return 'invalid';
      const entry = GEAR_BY_ID[rawId];
      const patient = allPatients.find((p) => p.id === patientId);
      if (!patient) return 'invalid';
      if (patient.xp < entry.xpRequired) return 'insufficient_xp';
      if (patient.coins < entry.priceCoins) return 'insufficient';

      if (entry.id === 'streak_shield') {
        setAllPatients((prev) =>
          prev.map((p) =>
            p.id === patientId ? { ...p, coins: p.coins - entry.priceCoins } : p
          )
        );
        setPatientGearByPatientId((prev) => {
          const cur = prev[patientId] ?? defaultPatientGear();
          return {
            ...prev,
            [patientId]: {
              ...cur,
              streakShieldCharges: cur.streakShieldCharges + 1,
            },
          };
        });
        return 'ok';
      }

      const owned = patientGearByPatientId[patientId]?.ownedGearIds ?? [];
      if (owned.includes(rawId)) return 'already_owned';

      setAllPatients((prev) =>
        prev.map((p) =>
          p.id === patientId ? { ...p, coins: p.coins - entry.priceCoins } : p
        )
      );
      setPatientGearByPatientId((prev) => {
        const cur = prev[patientId] ?? defaultPatientGear();
        if (cur.ownedGearIds.includes(rawId)) return prev;
        return {
          ...prev,
          [patientId]: {
            ...cur,
            ownedGearIds: [...cur.ownedGearIds, rawId],
          },
        };
      });
      return 'ok';
    },
    [allPatients, patientGearByPatientId]
  );

  const equipGearItem = useCallback(
    (patientId: string, rawId: string): boolean => {
      if (!isGearItemId(rawId)) return false;
      const entry = GEAR_BY_ID[rawId];
      if (entry.equipSlot === 'none') return false;
      const g = patientGearByPatientId[patientId] ?? defaultPatientGear();
      if (!g.ownedGearIds.includes(rawId)) return false;
      if (entry.equipSlot === 'functional_passive') {
        setPatientGearByPatientId((prev) => {
          const cur = prev[patientId] ?? defaultPatientGear();
          return {
            ...prev,
            [patientId]: { ...cur, equippedPassiveId: rawId },
          };
        });
        return true;
      }
      const slotKey = gearSlotToStateKey(entry.equipSlot);
      if (!slotKey) return false;
      setPatientGearByPatientId((prev) => {
        const cur = prev[patientId] ?? defaultPatientGear();
        return {
          ...prev,
          [patientId]: { ...cur, [slotKey]: rawId },
        };
      });
      return true;
    },
    [patientGearByPatientId]
  );

  const unequipGearSlot = useCallback((patientId: string, slot: GearEquipSlot) => {
    if (slot === 'functional_passive') {
      setPatientGearByPatientId((prev) => {
        const cur = prev[patientId] ?? defaultPatientGear();
        return {
          ...prev,
          [patientId]: { ...cur, equippedPassiveId: null },
        };
      });
      return;
    }
    if (slot === 'none') return;
    const key = gearSlotToStateKey(slot);
    if (!key) return;
    setPatientGearByPatientId((prev) => {
      const cur = prev[patientId] ?? defaultPatientGear();
      return {
        ...prev,
        [patientId]: { ...cur, [key]: null },
      };
    });
  }, []);

  const claimDailyLoginBonusIfNeeded = useCallback(
    (patientId: string) => {
      const clinicalDay = getClinicalDate();
      const { xp: bxp } = PATIENT_REWARDS.FIRST_LOGIN_OF_DAY;
      if (bxp <= 0) return false;
      let granted = false;
      setPatientRewardMetaByPatientId((prev) => {
        const cur = prev[patientId] ?? defaultPatientRewardMeta();
        if (cur.lastLoginBonusClinicalDate === clinicalDay) {
          return prev;
        }
        granted = true;
        return {
          ...prev,
          [patientId]: {
            ...cur,
            lastLoginBonusClinicalDate: clinicalDay,
          },
        };
      });
      if (!granted) return false;
      setAllPatients((prev) =>
        prev.map((p) => (p.id === patientId ? applyXpCoinsLevelUp(p, bxp, 0) : p))
      );
      pushRewardFeedback(bxp, 0, undefined, 'כניסה יומית');
      return true;
    },
    [pushRewardFeedback]
  );

  const submitExerciseReport = useCallback(
    (
      patientId: string,
      exerciseId: string,
      painLevel: number,
      effortRating: number,
      xpReward: number,
      options?: {
        skipPainHistory?: boolean;
        completionSource?: 'rehab' | 'self-care';
        sessionBodyArea?: BodyArea;
      }
    ) => {
      const clinicalDay = getClinicalDate();
      const prior = dailySessions.find((s) => s.patientId === patientId && s.date === clinicalDay);
      const wasRepeatCompletion = prior?.completedIds.includes(exerciseId) ?? false;

      const patientBefore = allPatients.find((x) => x.id === patientId);
      if (!patientBefore) return;

      const pain = clampPain(painLevel);
      const effort = clampEffort(effortRating);
      const plan = exercisePlans.find((ep) => ep.patientId === patientId);
      const totalInPlan = plan?.exercises.length ?? 0;
      const rehabEx = plan?.exercises.find((e) => e.id === exerciseId);
      const sessionZone = options?.sessionBodyArea ?? rehabEx?.targetArea ?? undefined;
      const firstOfDay = !prior || prior.completedIds.length === 0;
      const clinicalYesterday = getClinicalYesterday();
      const clinicalTwoDaysAgo = addClinicalDays(clinicalDay, -2);
      const gearSnap = patientGearByPatientId[patientId] ?? defaultPatientGear();

      let nextStreak = patientBefore.currentStreak;
      let consumeStreakShield = false;
      if (firstOfDay) {
        const last = patientBefore.lastSessionDate;
        if (last === clinicalYesterday) {
          nextStreak = patientBefore.currentStreak + 1;
        } else if (last === clinicalDay) {
          nextStreak = patientBefore.currentStreak;
        } else if (last === clinicalTwoDaysAgo && gearSnap.streakShieldCharges > 0) {
          nextStreak = patientBefore.currentStreak + 1;
          consumeStreakShield = true;
        } else if (last !== clinicalDay) {
          nextStreak = 1;
        }
      }

      const baseXp = exerciseBaseXp(xpReward);
      const streakMult = getStreakXpMultiplier(nextStreak);
      const xpBeforeBoost = Math.round(baseXp * streakMult);
      const hasXpBoost =
        gearSnap.equippedPassiveId === 'xp_booster' &&
        gearSnap.ownedGearIds.includes('xp_booster');
      const xpGain = hasXpBoost
        ? Math.round(xpBeforeBoost * XP_BOOSTER_MULT)
        : xpBeforeBoost;
      const streakBonusXp = Math.max(0, xpBeforeBoost - baseXp);
      const coinsGain = PATIENT_REWARDS.EXERCISE_COMPLETE.coins;

      pushRewardFeedback(
        xpGain,
        coinsGain,
        streakBonusXp > 0 ? streakBonusXp : undefined,
        streakBonusXp > 0 ? `בונוס רצף ×${streakMult}` : undefined
      );

      setDailySessions((prev) => {
        const existing = prev.find((s) => s.patientId === patientId && s.date === clinicalDay);
        if (!existing) {
          return [
            ...prev,
            {
              patientId,
              date: clinicalDay,
              completedIds: [exerciseId],
              sessionXp: xpGain,
            },
          ];
        }
        return prev.map((s) =>
          s.patientId === patientId && s.date === clinicalDay
            ? {
                ...s,
                completedIds: s.completedIds.includes(exerciseId)
                  ? s.completedIds
                  : [...s.completedIds, exerciseId],
                sessionXp: s.sessionXp + xpGain,
              }
            : s
        );
      });

      setAllPatients((prev) =>
        prev.map((p) => {
          if (p.id !== patientId) return p;

          // Clinical safety: red flag on elevated pain or reported exertion
          const triggersClinicalAlert = pain >= 6 || effort >= 4;
          const alertReasons: string[] = [];
          if (pain >= 6) alertReasons.push(`כאב ${pain}/10`);
          if (effort >= 4) alertReasons.push(`קושי ${effort}/5`);

          const painRecord = {
            date: clinicalDay,
            painLevel: pain,
            bodyArea: p.primaryBodyArea,
            ...(alertReasons.length > 0
              ? { notes: `התראת בטיחות — ${alertReasons.join(' · ')}` }
              : {}),
          };

          const newPainHistory = options?.skipPainHistory
            ? p.analytics.painHistory
            : [...p.analytics.painHistory, painRecord];
          const averageOverallPain =
            newPainHistory.length === 0
              ? p.analytics.averageOverallPain
              : Math.round(
                  (newPainHistory.reduce((sum, r) => sum + r.painLevel, 0) / newPainHistory.length) *
                    10
                ) / 10;

          const sh = [...p.analytics.sessionHistory];
          const todayIdx = sh.findIndex((s) => s.date === clinicalDay);
          let newSessionHistory: ExerciseSession[];

          const newDaySessionRow = todayIdx === -1;
          if (newDaySessionRow) {
            newSessionHistory = [
              ...sh,
              {
                date: clinicalDay,
                exercisesCompleted: 1,
                totalExercises: Math.max(1, totalInPlan),
                difficultyRating: effort,
                xpEarned: xpGain,
              },
            ];
          } else {
            const cur = sh[todayIdx];
            if (!wasRepeatCompletion) {
              const n = cur.exercisesCompleted + 1;
              const avgDiff = Math.round(
                (cur.difficultyRating * cur.exercisesCompleted + effort) / n
              );
              newSessionHistory = sh.map((s, i) =>
                i === todayIdx
                  ? {
                      ...s,
                      exercisesCompleted: n,
                      totalExercises: Math.max(s.totalExercises, totalInPlan || 1),
                      difficultyRating: avgDiff,
                      xpEarned: s.xpEarned + xpGain,
                    }
                  : s
              );
            } else {
              newSessionHistory = sh.map((s, i) =>
                i === todayIdx
                  ? {
                      ...s,
                      exercisesCompleted: cur.exercisesCompleted,
                      totalExercises: Math.max(s.totalExercises, totalInPlan || 1),
                      difficultyRating: Math.round((cur.difficultyRating + effort) / 2),
                      xpEarned: s.xpEarned + xpGain,
                    }
                  : s
              );
            }
          }

          const sessionDiffAvg =
            newSessionHistory.reduce((sum, s) => sum + s.difficultyRating, 0) /
            newSessionHistory.length;

          let { longestStreak, lastSessionDate } = p;
          let currentStreak = p.currentStreak;
          if (firstOfDay) {
            currentStreak = nextStreak;
            longestStreak = Math.max(longestStreak, currentStreak);
          }
          lastSessionDate = clinicalDay;

          const totalSessions = newDaySessionRow
            ? p.analytics.totalSessions + 1
            : p.analytics.totalSessions;

          const leveled = applyXpCoinsLevelUp(p, xpGain, coinsGain);

          return {
            ...leveled,
            hasRedFlag: p.hasRedFlag || triggersClinicalAlert,
            redFlagActive: p.redFlagActive || (pain >= 7 && sessionZone === p.primaryBodyArea),
            lastSessionDate,
            currentStreak,
            longestStreak,
            analytics: {
              ...p.analytics,
              painHistory: newPainHistory,
              averageOverallPain: Math.round(averageOverallPain * 10) / 10,
              sessionHistory: newSessionHistory,
              averageDifficulty: Math.round(sessionDiffAvg * 10) / 10,
              totalSessions,
            },
          };
        })
      );

      if (consumeStreakShield) {
        setPatientGearByPatientId((gPrev) => {
          const cur = gPrev[patientId] ?? defaultPatientGear();
          return {
            ...gPrev,
            [patientId]: {
              ...cur,
              streakShieldCharges: Math.max(0, cur.streakShieldCharges - 1),
            },
          };
        });
      }

      if (
        sessionZone &&
        sessionZone === patientBefore.primaryBodyArea &&
        pain >= 7
      ) {
        setExerciseSafetyLockedPatientIds((prev) => ({ ...prev, [patientId]: true }));
        const email = getTherapistAlertEmail(patientBefore.therapistId);
        const subject = '[The Guardian] עצירת אימון — כאב גבוה במוקד פגיעה';
        const body =
          `מטופל: ${patientBefore.name}\n` +
          `מוקד פגיעה ראשי: ${bodyAreaLabels[patientBefore.primaryBodyArea]}\n` +
          `כאב דווח: ${pain}/10\n\n` +
          'האימון נעצר עקב רמת כאב גבוהה. הודעה נשלחה לנדב.';
        openClinicalMailto(email, subject, body);
        setSafetyAlerts((prev) => [
          ...prev,
          {
            id: `sa-primary-${Date.now()}`,
            patientId,
            reasonCode: 'PAIN_SURGE',
            reasonHebrew: 'האימון נעצר עקב רמת כאב גבוהה. הודעה נשלחה לנדב.',
            severity: 'high_priority',
            createdAt: new Date().toISOString(),
          },
        ]);
        sendAiClinicalAlert(
          patientId,
          'האימון נעצר עקב רמת כאב גבוהה. הודעה נשלחה לנדב.',
          'high_priority'
        );
      }

      if (
        options?.completionSource === 'self-care' &&
        sessionZone &&
        isChainReactionZoneForPrimary(patientBefore.primaryBodyArea, sessionZone) &&
        pain >= 7
      ) {
        setExerciseSafetyLockedPatientIds((prev) => ({ ...prev, [patientId]: true }));
        const email = getTherapistAlertEmail(patientBefore.therapistId);
        const subject = '[The Guardian] עצירת בטיחות — תגובת שרשרת';
        const body =
          `מטופל: ${patientBefore.name}\n` +
          `אזור קליני ראשי: ${bodyAreaLabels[patientBefore.primaryBodyArea]}\n` +
          `תרגיל כוח באזור שרשרת: ${bodyAreaLabels[sessionZone]}\n` +
          `כאב דווח: ${pain}/10\n\n` +
          'הסשן נעצר אוטומטית — יש להתייחס לפי פרוטוקול.';
        openClinicalMailto(email, subject, body);
        setSafetyAlerts((prev) => [
          ...prev,
          {
            id: `sa-chain-${Date.now()}`,
            patientId,
            reasonCode: 'CHAIN_REACTION',
            reasonHebrew: `כאב גבוה אחרי תרגול ב־${bodyAreaLabels[sessionZone]} (אזור שרשרת למוקד ${bodyAreaLabels[patientBefore.primaryBodyArea]})`,
            severity: 'high_priority',
            createdAt: new Date().toISOString(),
          },
        ]);
        sendAiClinicalAlert(
          patientId,
          `עצירת בטיחות (שרשרת): כאב ${pain}/10 אחרי פעילות ב־${bodyAreaLabels[sessionZone]} ביחס למוקד ${bodyAreaLabels[patientBefore.primaryBodyArea]}. נשלח דוא״ל למטפל.`,
          'high_priority'
        );
      }

      if (pain >= 7) {
        const email = getTherapistAlertEmail(patientBefore.therapistId);
        const subject = '[The Guardian] התראת כאב גבוהה';
        const body =
          `מטופל: ${patientBefore.name}\n` +
          `אזור תרגול: ${sessionZone ? bodyAreaLabels[sessionZone] : bodyAreaLabels[patientBefore.primaryBodyArea]}\n` +
          `מוקד פגיעה ראשי: ${bodyAreaLabels[patientBefore.primaryBodyArea]}\n` +
          `כאב דווח: ${pain}/10\n` +
          `קושי דווח: ${effort}/5\n` +
          `תאריך קליני: ${clinicalDay}\n\n` +
          'נדרשת בדיקה קלינית ועדכון עומסים לפי שיקול מטפל.';
        openClinicalMailto(email, subject, body);
        setSafetyAlerts((prev) => [
          ...prev,
          {
            id: `sa-pain-${Date.now()}`,
            patientId,
            reasonCode: 'PAIN_SURGE',
            reasonHebrew: 'עליית כאב — דיווח ≥7',
            severity: 'high_priority',
            createdAt: new Date().toISOString(),
          },
        ]);
        sendAiClinicalAlert(
          patientId,
          `דיווח לאחר תרגיל: כאב ${pain}/10.\nהמלצה למטפל: לשקול הורדת העומס בכ־30% (חזרות / סטים / משקל) לאחר הערכה קלינית.\nטקסט שהומלץ למטופל:\n${PAIN_SURGE_PATIENT_COPY}`,
          'high_priority'
        );
      }
      if (effort === 5) {
        setSafetyAlerts((prev) => [
          ...prev,
          {
            id: `sa-eff-${Date.now()}`,
            patientId,
            reasonCode: 'DIFFICULTY_MAX',
            reasonHebrew: 'קושי מקסימלי בתרגיל (5/5)',
            severity: 'high_priority',
            createdAt: new Date().toISOString(),
          },
        ]);
        sendAiClinicalAlert(
          patientId,
          `דיווח לאחר תרגיל: קושי מאמץ ${effort}/5.\nמומלץ להפחית חזרות או סטים עד עדכון ממטפל.\nטקסט שהומלץ למטופל:\n${DIFFICULTY_MAX_PATIENT_COPY}`,
          'high_priority'
        );
        const ex = plan?.exercises.find((e) => e.id === exerciseId);
        if (ex && ex.patientReps > 0) {
          const suggestedReps = Math.max(1, Math.floor(ex.patientReps * 0.7));
          if (suggestedReps < ex.patientReps) {
            setAiSuggestions((prev) => [
              ...prev,
              {
                id: `ai-eff-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
                patientId,
                exerciseId,
                exerciseName: ex.name,
                type: 'reduce_reps',
                field: 'reps',
                currentValue: ex.patientReps,
                suggestedValue: suggestedReps,
                reason:
                  'דיווח מאמץ 5/5 — הצעה אוטומטית להפחתת חזרות; אשרו או התאימו ידנית.',
                createdAt: new Date().toISOString(),
                status: 'awaiting_therapist',
                source: 'system',
              },
            ]);
          }
        }
      }
    },
    [
      exercisePlans,
      dailySessions,
      sendAiClinicalAlert,
      clinicalTick,
      allPatients,
      pushRewardFeedback,
      patientGearByPatientId,
      setExerciseSafetyLockedPatientIds,
    ]
  );

  // ── AI Suggestions ─────────────────────────────────────────────
  const getPendingAiSuggestions = useCallback(
    (patientId: string) =>
      aiSuggestions.filter((s) => s.patientId === patientId && s.status === 'pending'),
    [aiSuggestions]
  );

  const getAwaitingTherapistSuggestions = useCallback(
    (patientId: string) =>
      aiSuggestions.filter((s) => s.patientId === patientId && s.status === 'awaiting_therapist'),
    [aiSuggestions]
  );

  const visiblePatientIds = useMemo(() => new Set(patients.map((p) => p.id)), [patients]);

  const getTotalAwaitingTherapistCount = useCallback(
    () =>
      aiSuggestions.filter(
        (s) => s.status === 'awaiting_therapist' && visiblePatientIds.has(s.patientId)
      ).length,
    [aiSuggestions, visiblePatientIds]
  );

  const patientAgreeToAiSuggestion = useCallback((suggestionId: string) => {
    setAiSuggestions((prev) =>
      prev.map((s) =>
        s.id === suggestionId && s.status === 'pending'
          ? { ...s, status: 'awaiting_therapist' as const }
          : s
      )
    );
  }, []);

  const patientDeclineAiSuggestion = useCallback((suggestionId: string) => {
    setAiSuggestions((prev) =>
      prev.map((s) =>
        s.id === suggestionId && s.status === 'pending' ? { ...s, status: 'declined' as const } : s
      )
    );
  }, []);

  const therapistApproveAiSuggestion = useCallback(
    (suggestionId: string) => {
      let found: AiSuggestion | undefined;
      setAiSuggestions((prev) => {
        found = prev.find((s) => s.id === suggestionId);
        if (!found || found.status !== 'awaiting_therapist') return prev;
        return prev.map((s) =>
          s.id === suggestionId ? { ...s, status: 'approved' as const } : s
        );
      });
      if (!found || found.status !== 'awaiting_therapist') return;
      const updates: Partial<Pick<PatientExercise, 'patientReps' | 'patientSets' | 'patientWeightKg'>> =
        found.field === 'reps'
          ? { patientReps: found.suggestedValue }
          : found.field === 'sets'
            ? { patientSets: found.suggestedValue }
            : { patientWeightKg: found.suggestedValue };
      updateExerciseInPlan(found.patientId, found.exerciseId, updates);
    },
    [updateExerciseInPlan]
  );

  const therapistDeclineAiSuggestion = useCallback((suggestionId: string) => {
    setAiSuggestions((prev) =>
      prev.map((s) =>
        s.id === suggestionId && s.status === 'awaiting_therapist'
          ? { ...s, status: 'declined' as const }
          : s
      )
    );
  }, []);

  const submitGuardianRepsIncreaseRequest = useCallback(
    (
      patientId: string,
      exerciseId: string,
      exerciseName: string,
      currentReps: number,
      suggestedReps: number
    ) => {
      const newSug: AiSuggestion = {
        id: `ai-g-${Date.now()}`,
        patientId,
        exerciseId,
        exerciseName,
        type: 'increase_reps',
        field: 'reps',
        currentValue: currentReps,
        suggestedValue: suggestedReps,
        reason:
          'בקשה שהתקבלה מהמטופל דרך עוזר Guardian: דיווח קושי נמוך בימים האחרונים והצעה להעלות חזרות.',
        createdAt: new Date().toISOString(),
        status: 'awaiting_therapist',
        source: 'guardian_patient' as AiSuggestionSource,
      };
      setAiSuggestions((prev) => [...prev, newSug]);
    },
    []
  );

  const applyInitialClinicalProfile = useCallback(
    (
      patientId: string,
      primaryBodyArea: BodyArea,
      libraryExerciseIds: string[],
      extras?: { displayName?: string; intakeStory?: string }
    ) => {
      const lib = EXERCISE_LIBRARY.filter((e) => libraryExerciseIds.includes(e.id));
      const addedAt = new Date().toISOString();
      const newExercises: PatientExercise[] = lib.map((exercise, i) => ({
        ...exercise,
        id: `${patientId}-${exercise.id}-${addedAt}-${i}`,
        patientSets: exercise.sets,
        patientReps: exercise.reps ?? 0,
        addedAt,
      }));

      setAllPatients((prev) =>
        prev.map((p) => {
          if (p.id !== patientId) return p;
          const name = extras?.displayName?.trim() ? extras.displayName.trim() : p.name;
          const therapistNotes = extras?.intakeStory?.trim()
            ? extras.intakeStory.trim()
            : p.therapistNotes;
          return {
            ...p,
            name,
            primaryBodyArea,
            status: 'active',
            diagnosis: `מוקד טיפול: ${bodyAreaLabels[primaryBodyArea]}`,
            therapistNotes,
          };
        })
      );
      setExercisePlans((prev) => {
        const rest = prev.filter((ep) => ep.patientId !== patientId);
        return [...rest, { patientId, exercises: newExercises }];
      });
    },
    []
  );

  const createPatientWithAccess = useCallback((displayName: string) => {
    const ownerTid = therapistScopeId ?? mockTherapist.id;
    const name = displayName.trim() || 'מטופל חדש';
    const patientId = `patient-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const loginId = `PT-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.toUpperCase();
    const password = randomPatientPassword();
    const joinDate = new Date().toISOString().slice(0, 10);
    const newPatient: Patient = {
      id: patientId,
      therapistId: ownerTid,
      name,
      age: 30,
      diagnosis: 'חדש — עדכנו אבחון ואזור גוף',
      primaryBodyArea: 'back_lower',
      status: 'pending',
      level: 1,
      xp: 0,
      xpForNextLevel: xpRequiredToReachNextLevel(1),
      currentStreak: 0,
      longestStreak: 0,
      joinDate,
      lastSessionDate: joinDate,
      pendingMessages: 0,
      hasRedFlag: false,
      redFlagActive: false,
      therapistNotes: '',
      coins: 0,
      injuryHighlightSegments: [],
      secondaryClinicalBodyAreas: [],
      analytics: {
        averageOverallPain: 0,
        painByArea: {},
        averageDifficulty: 0,
        totalSessions: 0,
        painHistory: [],
        sessionHistory: [],
      },
    };
    setAllPatients((prev) => [...prev, newPatient]);
    setExercisePlans((prev) => [...prev, { patientId, exercises: [] }]);
    addPatientAccount(loginId, patientId, password, ownerTid, { mustChangePassword: true });
    setSelectedPatientId(patientId);
    setActiveSection('overview');
    return { loginId, password, patientId };
  }, [therapistScopeId]);

  const updateTherapistNotes = useCallback((patientId: string, notes: string) => {
    setAllPatients((prev) =>
      prev.map((p) => (p.id === patientId ? { ...p, therapistNotes: notes } : p))
    );
  }, []);

  const applyIntakeExercisePlan = useCallback(
    (patientId: string, exercises: Exercise[], primaryBodyArea: BodyArea) => {
      const addedAt = new Date().toISOString();
      const newExercises: PatientExercise[] = exercises.map((exercise, i) => ({
        ...exercise,
        id: `${patientId}-intake-${exercise.id}-${addedAt}-${i}`,
        patientSets: exercise.sets,
        patientReps: exercise.reps ?? 0,
        addedAt,
      }));
      setExercisePlans((prev) => {
        const rest = prev.filter((ep) => ep.patientId !== patientId);
        return [...rest, { patientId, exercises: newExercises }];
      });
      setAllPatients((prev) =>
        prev.map((p) =>
          p.id === patientId
            ? {
                ...p,
                primaryBodyArea,
                status: p.status === 'pending' ? 'active' : p.status,
              }
            : p
        )
      );
    },
    []
  );

  const runClinicalAssessmentEngine = useCallback(
    (patientId: string, notes: string) => {
      const patient = allPatients.find((p) => p.id === patientId);
      if (!patient) return;
      const plan = exercisePlans.find((ep) => ep.patientId === patientId);
      const insight = computeClinicalProgressInsight(patient, clinicalToday);

      setAllPatients((prev) =>
        prev.map((p) => (p.id === patientId ? { ...p, therapistNotes: notes } : p))
      );

      setAiSuggestions((prev) => {
        const withoutStale = prev.filter(
          (s) =>
            !(
              s.patientId === patientId &&
              s.source === 'therapist_note' &&
              s.status === 'pending'
            )
        );

        if (insight.category !== 'load_increase' && insight.category !== 'load_decrease' && insight.category !== 'escalate_care') {
          return withoutStale;
        }

        const ex = plan?.exercises.find((e) => (e.patientReps ?? 0) > 0);
        if (!ex) return withoutStale;

        const currentValue = ex.patientReps;
        const isReduce = insight.category === 'load_decrease' || insight.category === 'escalate_care';
        const suggestedValue = isReduce
          ? Math.max(1, currentValue - 3)
          : currentValue + 2;
        if (suggestedValue === currentValue) return withoutStale;

        const noteRef =
          notes.trim().length > 0
            ? ` סינתזה לאחר עדכון ההערכה הקלינית («${notes.trim().slice(0, 80)}${notes.trim().length > 80 ? '…' : ''}»).`
            : '';

        const newSug: AiSuggestion = {
          id: `ai-tn-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          patientId,
          exerciseId: ex.id,
          exerciseName: ex.name,
          type: isReduce ? 'reduce_reps' : 'increase_reps',
          field: 'reps',
          currentValue,
          suggestedValue,
          reason: `${insight.nextStepHe}${noteRef}`,
          createdAt: new Date().toISOString(),
          status: 'pending',
          source: 'therapist_note',
        };
        return [...withoutStale, newSug];
      });
    },
    [allPatients, exercisePlans, clinicalToday]
  );

  const updatePatient = useCallback(
    (patientId: string, patch: Partial<Omit<Patient, 'id' | 'therapistId'>>) => {
      if (import.meta.env.PROD) return;
      setAllPatients((prev) =>
        prev.map((p) => {
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
        })
      );
    },
    []
  );

  const resetPatientToCleanAvatar = useCallback((patientId: string) => {
    if (import.meta.env.PROD) return;
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

  const devMockSevenDayExerciseHistory = useCallback(
    (patientId: string) => {
      if (import.meta.env.PROD) return;
      const plan = exercisePlans.find((ep) => ep.patientId === patientId);
      const exId =
        plan?.exercises[0]?.id ??
        `${patientId}-dev-mock-${Math.random().toString(36).slice(2, 8)}`;
      const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => addClinicalDays(clinicalToday, -i));
      const totalPlanned = Math.max(1, plan?.exercises.length ?? 1);

      setDailySessions((prev) => {
        const without = prev.filter(
          (s) => !(s.patientId === patientId && dates.includes(s.date))
        );
        const additions: DailySession[] = dates.map((date) => ({
          patientId,
          date,
          completedIds: [exId],
          sessionXp: 80,
        }));
        return [...without, ...additions];
      });

      setAllPatients((prev) =>
        prev.map((p) => {
          if (p.id !== patientId) return p;
          const without = p.analytics.sessionHistory.filter((s) => !dates.includes(s.date));
          const rows: ExerciseSession[] = dates.map((date) => ({
            date,
            exercisesCompleted: totalPlanned,
            totalExercises: totalPlanned,
            difficultyRating: 3,
            xpEarned: 80,
          }));
          const sessionHistory = [...without, ...rows].sort((a, b) =>
            a.date.localeCompare(b.date)
          );
          return {
            ...p,
            lastSessionDate: clinicalToday,
            analytics: {
              ...p.analytics,
              sessionHistory,
              totalSessions: sessionHistory.length,
            },
          };
        })
      );
    },
    [clinicalToday, exercisePlans]
  );

  const devBreakStreakRemoveYesterday = useCallback(
    (patientId: string) => {
      if (import.meta.env.PROD) return;
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
    if (import.meta.env.PROD) return;
    setAllPatients((prev) =>
      prev.map((p) => {
        if (p.id !== patientId) return p;
        const nextLife = Math.max(0, lifetimeXpFromPatient(p) + Math.round(delta));
        return patientWithLifetimeXp(p, nextLife);
      })
    );
  }, []);

  const devSetPatientLifetimeXp = useCallback((patientId: string, lifetimeXp: number) => {
    if (import.meta.env.PROD) return;
    setAllPatients((prev) =>
      prev.map((p) => {
        if (p.id !== patientId) return p;
        return patientWithLifetimeXp(p, Math.max(0, Math.floor(lifetimeXp)));
      })
    );
  }, []);

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

  const getSelfCareZones = useCallback(
    (patientId: string) => {
      const patient = allPatients.find((p) => p.id === patientId);
      const raw = selfCareZonesByPatientId[patientId] ?? [];
      if (!patient) return raw.filter(Boolean);
      const sec = patient.secondaryClinicalBodyAreas ?? [];
      return raw.filter(
        (a) => a && !bodyAreaBlocksSelfCare(a, patient.primaryBodyArea, sec)
      );
    },
    [allPatients, selfCareZonesByPatientId]
  );

  const toggleSelfCareZone = useCallback(
    (patientId: string, area: BodyArea) => {
      const patient = allPatients.find((p) => p.id === patientId);
      if (
        !patient ||
        bodyAreaBlocksSelfCare(area, patient.primaryBodyArea, patient.secondaryClinicalBodyAreas ?? [])
      ) {
        return;
      }
      setSelfCareZonesByPatientId((prev) => {
        const cur = prev[patientId] ?? [];
        const has = cur.includes(area);
        const next = has ? cur.filter((a) => a !== area) : [...cur, area];
        return { ...prev, [patientId]: next };
      });
    },
    [allPatients]
  );

  const logSelfCareSession = useCallback(
    (
      patientId: string,
      exerciseId: string,
      exerciseName: string,
      effortRating: 1 | 2 | 3 | 4 | 5
    ) => {
      const id = `sc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const report: SelfCareSessionReport = {
        id,
        patientId,
        clinicalDate: clinicalToday,
        exerciseId,
        exerciseName,
        effortRating,
        loggedAt: new Date().toISOString(),
      };
      setSelfCareReportsByPatientId((prev) => ({
        ...prev,
        [patientId]: [...(prev[patientId] ?? []), report],
      }));
    },
    [clinicalToday]
  );

  const getSelfCareReportsForPatient = useCallback(
    (patientId: string) =>
      [...(selfCareReportsByPatientId[patientId] ?? [])].sort((a, b) =>
        b.loggedAt.localeCompare(a.loggedAt)
      ),
    [selfCareReportsByPatientId]
  );

  const getSelfCareReportsForClinicalDay = useCallback(
    (patientId: string, clinicalDate: string) =>
      (selfCareReportsByPatientId[patientId] ?? []).filter((r) => r.clinicalDate === clinicalDate),
    [selfCareReportsByPatientId]
  );

  const appendPatientExerciseFinishReport = useCallback(
    (
      patientId: string,
      entry: Omit<PatientExerciseFinishReport, 'id' | 'patientId' | 'timestamp'>
    ) => {
      const full: PatientExerciseFinishReport = {
        ...entry,
        id: `fin-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        patientId,
        timestamp: new Date().toISOString(),
      };
      sendDataToTherapist(full);
      setPatientExerciseFinishReportsByPatientId((prev) => ({
        ...prev,
        [patientId]: [...(prev[patientId] ?? []), full],
      }));
    },
    []
  );

  const getPatientExerciseFinishReports = useCallback(
    (patientId: string) =>
      [...(patientExerciseFinishReportsByPatientId[patientId] ?? [])].sort((a, b) =>
        b.timestamp.localeCompare(a.timestamp)
      ),
    [patientExerciseFinishReportsByPatientId]
  );

  const getSelfCareStrengthTier = useCallback(
    (patientId: string, area: BodyArea): 0 | 1 | 2 => {
      const t = selfCareStrengthTierByPatientId[patientId]?.[area];
      return t === 1 || t === 2 ? t : 0;
    },
    [selfCareStrengthTierByPatientId]
  );

  const setSelfCareStrengthTier = useCallback(
    (patientId: string, area: BodyArea, tier: 0 | 1 | 2) => {
      setSelfCareStrengthTierByPatientId((prev) => ({
        ...prev,
        [patientId]: { ...(prev[patientId] ?? {}), [area]: tier },
      }));
    },
    []
  );

  const resetPatientExercisePlan = useCallback((patientId: string) => {
    setExercisePlans((prev) =>
      prev.some((ep) => ep.patientId === patientId)
        ? prev.map((ep) => (ep.patientId === patientId ? { ...ep, exercises: [] } : ep))
        : [...prev, { patientId, exercises: [] }]
    );
  }, []);

  const resetPatientMessageHistory = useCallback((patientId: string) => {
    setMessages((prev) => prev.filter((m) => m.patientId !== patientId));
  }, []);

  const resetPatientPainReports = useCallback((patientId: string) => {
    setAllPatients((prev) =>
      prev.map((p) => {
        if (p.id !== patientId) return p;
        return {
          ...p,
          analytics: {
            ...p.analytics,
            painHistory: [],
            averageOverallPain: 0,
            painByArea: {},
          },
        };
      })
    );
  }, []);

  const togglePatientInjuryHighlight = useCallback((patientId: string, area: BodyArea) => {
    setAllPatients((prev) =>
      prev.map((p) => {
        if (p.id !== patientId) return p;
        const cur = p.injuryHighlightSegments ?? [];
        const has = cur.includes(area);
        const next = has ? cur.filter((a) => a !== area) : [...cur, area];
        return { ...p, injuryHighlightSegments: next };
      })
    );
  }, []);

  const clearPatientInjuryHighlights = useCallback((patientId: string) => {
    setAllPatients((prev) =>
      prev.map((p) => (p.id === patientId ? { ...p, injuryHighlightSegments: [] } : p))
    );
  }, []);

  const cycleTherapistBodyMapClinical = useCallback((patientId: string, area: BodyArea) => {
    setAllPatients((prev) => {
      const idx = prev.findIndex((p) => p.id === patientId);
      if (idx < 0) return prev;
      const nextPatient = applyTherapistClinicalCycle(prev[idx], area);
      setSelfCareZonesByPatientId((zp) => {
        const cur = zp[patientId] ?? [];
        const s = nextPatient.secondaryClinicalBodyAreas ?? [];
        const filtered = cur.filter(
          (a) => !bodyAreaBlocksSelfCare(a, nextPatient.primaryBodyArea, s)
        );
        if (filtered.length === cur.length) return zp;
        return { ...zp, [patientId]: filtered };
      });
      return prev.map((p, i) => (i === idx ? nextPatient : p));
    });
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
        createPatientWithAccess,
        resolveRedFlag,
        reportPatientUrgentRedFlag,
        setPatientContactWhatsapp,
        exercisePlans, getExercisePlan,
        addExerciseToPlan, removeExerciseFromPlan, updateExerciseInPlan,
        clinicalToday,
        dailyHistoryByPatient,
        dailySessions, getTodaySession, toggleExercise, submitExerciseReport,
        aiSuggestions,
        getPendingAiSuggestions,
        getAwaitingTherapistSuggestions,
        getTotalAwaitingTherapistCount,
        patientAgreeToAiSuggestion,
        patientDeclineAiSuggestion,
        therapistApproveAiSuggestion,
        therapistDeclineAiSuggestion,
        submitGuardianRepsIncreaseRequest,
        grantPatientCoins,
        markArticleAsRead,
        hasReadArticle,
        recordArticleLinkOpened,
        hasArticleLinkOpened,
        hasDailyLoginBonusPending,
        getPatientGear,
        purchaseGearItem,
        purchaseItem: purchaseGearItem,
        equipGearItem,
        unequipGearSlot,
        claimDailyLoginBonusIfNeeded,
        rewardFeedback,
        clearRewardFeedback,
        applyInitialClinicalProfile,
        updateTherapistNotes,
        runClinicalAssessmentEngine,
        applyIntakeExercisePlan,
        deletePatient,
        updatePatient,
        resetPatientToCleanAvatar,
        devMockSevenDayExerciseHistory,
        devBreakStreakRemoveYesterday,
        devAdjustPatientLifetimeXp,
        devSetPatientLifetimeXp,
        resetPatientExercisePlan,
        resetPatientMessageHistory,
        resetPatientPainReports,
        togglePatientInjuryHighlight,
        clearPatientInjuryHighlights,
        cycleTherapistBodyMapClinical,
        getSelfCareZones,
        toggleSelfCareZone,
        logSelfCareSession,
        getSelfCareReportsForPatient,
        getSelfCareReportsForClinicalDay,
        patientExerciseFinishReportsByPatientId,
        appendPatientExerciseFinishReport,
        getPatientExerciseFinishReports,
        getSelfCareStrengthTier,
        setSelfCareStrengthTier,
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
