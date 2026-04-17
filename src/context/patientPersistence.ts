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
  KnowledgeFact,
} from '../types';
import { invalidatePersistedBootstrapCache } from '../bootstrap/invalidateBootstrap';

/**
 * מפתח localStorage לכל מצב המטופלים והקשר הקליני.
 * אסטרטגיית hybrid: קריאה מהירה מכאן; Supabase (ראו PatientContext.savePersistedStateToCloud) לדחיפה לשרת בשלב הבא.
 *
 * מדיניות PHI: לפני שמירה מוסרים שמות, הערות קליניות, תוכן הודעות וכו׳ — רק מזהים, מדדי התקדמות ומצבי UI לא־רגישים.
 *
 * TODO (שכבת הצפנה): אם יידרש אחסון מלא לא מקוון של PHI, להוסיף עטיפת WebCrypto (מפתח נגזר מסשן / DeviceBinding)
 * לפני `JSON.stringify`, ולפענח בטעינה — לא לשמור JSON קליני גולמי ב-localStorage.
 *
 * בפיתוח עם `VITE_USE_LEGACY_AUTH=true` בלבד — אפשר לשמור מצב מלא לנוחות מקומית; בבניית production תמיד ממוזער.
 */
export const PATIENT_STATE_STORAGE_KEY = 'guardian-patient-state-v1';

function shouldMinimizePhiInLocalStorage(): boolean {
  if (import.meta.env.PROD) return true;
  return import.meta.env.VITE_USE_LEGACY_AUTH !== 'true';
}

function displayPlaceholderFromPatientId(id: string): string {
  const tail = id.replace(/[^a-zA-Z0-9]/g, '').slice(-6) || id.slice(-8);
  return `מטופל (${tail})`;
}

function redactPatientForPersistence(p: Patient): Patient {
  return {
    ...p,
    name: '',
    therapistNotes: '',
    diagnosis: '',
    contactWhatsappE164: undefined,
    analytics: {
      ...p.analytics,
      painHistory: p.analytics.painHistory.map((r) => {
        const { notes: _n, ...rest } = r;
        return rest;
      }),
    },
  };
}

function redactMessageForPersistence(m: Message): Message {
  return { ...m, content: '' };
}

function redactAiSuggestionForPersistence(s: AiSuggestion): AiSuggestion {
  return { ...s, reason: '' };
}

/** לאחר טעינה — מסיר PHI שנשמר בגרסאות קודמות; שם תצוגה פסאודונימי בלבד (לא מזהה אמיתי). */
function hydratePatientAfterLoad(p: Patient): Patient {
  const redacted = redactPatientForPersistence(p);
  return {
    ...redacted,
    name: displayPlaceholderFromPatientId(p.id),
  };
}

function sanitizePersistedPatientState(
  state: PersistedPatientStateV1
): PersistedPatientStateV1 {
  return {
    ...state,
    patients: state.patients.map((p) => hydratePatientAfterLoad(p)),
    messages: state.messages.map(redactMessageForPersistence),
    aiSuggestions: state.aiSuggestions.map(redactAiSuggestionForPersistence),
  };
}

function redactPersistedPatientStateForStorage(state: PersistedPatientStateV1): PersistedPatientStateV1 {
  return {
    ...state,
    patients: state.patients.map(redactPatientForPersistence),
    messages: state.messages.map(redactMessageForPersistence),
    aiSuggestions: state.aiSuggestions.map(redactAiSuggestionForPersistence),
  };
}

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
      /** YYYY-MM-DD מקומי — אחרי איסוף פרס «הידעת» להיום, הנורה מוסתרת עד למחר */
      dykRewardClaimedLocalYmd?: string | null;
      /** YYYY-MM-DD מקומי — נפתח חלון הידעת; המנורה סטטית עד למחר */
      dykTipOpenedLocalYmd?: string | null;
    }
  >;
  /** ציוד ויזואלי / מגן רצף — לפי מזהה מטופל */
  patientGearByPatientId?: Record<string, PatientGearPersistedV1>;
  /** בסיס ידע "הידעת?" — אישור מטפל וסנכרון לענן */
  knowledgeFacts?: KnowledgeFact[];
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
    return shouldMinimizePhiInLocalStorage() ? sanitizePersistedPatientState(data) : data;
  } catch {
    return null;
  }
}

export function savePersistedPatientState(state: PersistedPatientStateV1): void {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const toStore = shouldMinimizePhiInLocalStorage()
      ? redactPersistedPatientStateForStorage(state)
      : state;
    window.localStorage.setItem(PATIENT_STATE_STORAGE_KEY, JSON.stringify(toStore));
    invalidatePersistedBootstrapCache();
  } catch {
    /* quota / private mode */
  }
}
