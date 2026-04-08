import type {
  Patient,
  Message,
  ExercisePlan,
  DailySession,
  AiSuggestion,
  SafetyAlert,
  BodyArea,
  SelfCareSessionReport,
  PatientExerciseFinishReport,
} from '../types';
import { invalidatePersistedBootstrapCache } from '../bootstrap/invalidateBootstrap';

export const PATIENT_STATE_STORAGE_KEY = 'guardian-patient-state-v1';

export type PersistedPatientStateV1 = {
  version: 1;
  patients: Patient[];
  messages: Message[];
  exercisePlans: ExercisePlan[];
  dailySessions: DailySession[];
  aiSuggestions: AiSuggestion[];
  selectedPatientId: string;
  safetyAlerts: SafetyAlert[];
  exerciseSafetyLockedPatientIds: Record<string, boolean>;
  /** אזורי גוף לטיפול עצמי (פרהאב) — לפי מזהה מטופל */
  selfCareZonesByPatientId?: Record<string, BodyArea[]>;
  /** דיווחי תרגילי כוח/פרהאב — לפי מזהה מטופל */
  selfCareReportsByPatientId?: Record<string, SelfCareSessionReport[]>;
  /** דיווחי סיום תרגול (מודאל) — לאנליטיקה למטפל */
  patientExerciseFinishReportsByPatientId?: Record<string, PatientExerciseFinishReport[]>;
  /**
   * רמת קושי לתרגילי כוח (אזור ירוק): 0 = קל (רמה 1), 1 = בינוני (2), 2 = קשה (3)
   */
  selfCareStrengthTierByPatientId?: Record<string, Partial<Record<BodyArea, 0 | 1 | 2>>>;
  /**
   * פרסים יומיים / מאמרים — מזהי מאמרים שנקראו, ותאריך קליני שבו ניתן בונוס כניסה יומית
   */
  patientRewardMetaByPatientId?: Record<
    string,
    {
      readArticleIds: string[];
      lastLoginBonusClinicalDate: string | null;
      articleLinkOpenedIds?: string[];
    }
  >;
  /** ציוד ויזואלי / מגן רצף — לפי מזהה מטופל */
  patientGearByPatientId?: Record<string, PatientGearPersistedV1>;
};

/** נתוני ציוד שנשמרים ב־localStorage */
export type PatientGearPersistedV1 = {
  ownedGearIds: string[];
  equippedSkin: string | null;
  equippedAura: string | null;
  equippedHands: string | null;
  equippedTorso: string | null;
  equippedChestEmblem: string | null;
  equippedFeetFx: string | null;
  equippedCape: string | null;
  /** פסיבי פונקציונלי (למשל xp_booster) */
  equippedPassiveId: string | null;
  streakShieldCharges: number;
};

export function loadPersistedPatientState(): PersistedPatientStateV1 | null {
  if (typeof window === 'undefined' || !window.localStorage) return null;
  try {
    const raw = window.localStorage.getItem(PATIENT_STATE_STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PersistedPatientStateV1;
    if (data?.version !== 1 || !Array.isArray(data.patients)) return null;
    return data;
  } catch {
    return null;
  }
}

export function savePersistedPatientState(state: PersistedPatientStateV1): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(PATIENT_STATE_STORAGE_KEY, JSON.stringify(state));
    invalidatePersistedBootstrapCache();
  } catch {
    /* quota / private mode */
  }
}
