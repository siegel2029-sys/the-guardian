export interface Therapist {
  id: string;
  name: string;
  email: string;
  title: string;
  avatarInitials: string;
  clinicName: string;
}

export type PainLevel = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export type BodyArea =
  | 'neck'
  | 'chest'
  | 'abdomen'
  | 'shoulder_right'
  | 'shoulder_left'
  | 'upper_arm_right'
  | 'upper_arm_left'
  | 'elbow_right'
  | 'elbow_left'
  | 'forearm_right'
  | 'forearm_left'
  | 'wrist_right'
  | 'wrist_left'
  | 'hand_right'
  | 'hand_left'
  | 'back_upper'
  | 'back_lower'
  | 'hip_right'
  | 'hip_left'
  | 'thigh_right'
  | 'thigh_left'
  | 'knee_right'
  | 'knee_left'
  | 'shin_right'
  | 'shin_left'
  | 'ankle_right'
  | 'ankle_left'
  | 'foot_right'
  | 'foot_left';

export const bodyAreaLabels: Record<BodyArea, string> = {
  neck: 'צוואר',
  chest: 'גו עליון / חזה',
  abdomen: 'גו תחתון / בטן',
  shoulder_right: 'כתף ימין',
  shoulder_left: 'כתף שמאל',
  upper_arm_right: 'זרוע עליונה ימין',
  upper_arm_left: 'זרוע עליונה שמאל',
  elbow_right: 'מרפק ימין',
  elbow_left: 'מרפק שמאל',
  forearm_right: 'אמה ימין',
  forearm_left: 'אמה שמאל',
  wrist_right: 'פרק כף יד ימין',
  wrist_left: 'פרק כף יד שמאל',
  hand_right: 'כף יד ימין',
  hand_left: 'כף יד שמאל',
  back_upper: 'גו עליון / חזה',
  back_lower: 'גו תחתון / בטן',
  hip_right: 'עכוז / אגן ימין',
  hip_left: 'עכוז / אגן שמאל',
  thigh_right: 'ירך ימין',
  thigh_left: 'ירך שמאל',
  knee_right: 'ברך ימין',
  knee_left: 'ברך שמאל',
  shin_right: 'שוק ימין',
  shin_left: 'שוק שמאל',
  ankle_right: 'קרסול ימין',
  ankle_left: 'קרסול שמאל',
  foot_right: 'כף רגל ימין',
  foot_left: 'כף רגל שמאל',
};

export interface PainRecord {
  date: string; // ISO date string
  painLevel: PainLevel;
  bodyArea: BodyArea;
  notes?: string;
}

export interface ExerciseSession {
  date: string;
  exercisesCompleted: number;
  totalExercises: number;
  /** Patient-reported effort / RPE (1–10; legacy records may be 1–5). */
  difficultyRating: number;
  /** Present on new writes; absent ⇒ treat difficultyRating as legacy 1–5 when ≤5. */
  effortScale?: 5 | 10;
  xpEarned: number;
}

export interface PatientAnalytics {
  averageOverallPain: number;
  painByArea: Partial<Record<BodyArea, number>>;
  averageDifficulty: number;
  totalSessions: number;
  painHistory: PainRecord[];
  sessionHistory: ExerciseSession[];
}

export type PatientStatus = 'active' | 'pending' | 'paused' | 'frozen';
/** רמת התקדמות מטופל (1–100) — XP ואווטאר משתנים לפי הסקאלה המלאה */
export type ExerciseLevel = number;

/** תרגיל כוח/פרהאב לבחירת מטופל — מחוץ לתוכנית הקלינית */
export interface SelfCareExercise {
  id: string;
  name: string;
  bodyArea: BodyArea;
  category: 'strength' | 'mobility' | 'cardio';
  instructions: string;
  videoUrl: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
}

/** דיווח מטופל על ביצוע תרגיל self-care ביום קליני */
export interface SelfCareSessionReport {
  id: string;
  patientId: string;
  clinicalDate: string;
  exerciseId: string;
  exerciseName: string;
  /** Effort / RPE 1–10 (legacy may be 1–5). */
  effortRating: number;
  /** Present on new writes; absent ⇒ treat effortRating as legacy 1–5. */
  effortScale?: 5 | 10;
  loggedAt: string;
}

export type ExerciseFinishReportSource = 'therapist' | 'self-care';

/** דיווח סיום תרגול מתוך מודאל האימון — נשמר ב-localStorage; רשומות ישנות עשויות לחסר שדות */
export interface PatientExerciseFinishReport {
  id: string;
  patientId: string;
  exerciseId: string;
  timestamp: string;
  /** Effort / RPE 1–10 (legacy may be 1–5). */
  difficultyScore: number;
  /**
   * Scale the difficultyScore was recorded on.
   * Absent / 5 ⇒ legacy 1–5 (display via ×2); 10 ⇒ native 1–10.
   */
  effortScale?: 5 | 10;
  exerciseName?: string;
  zone?: string;
  painLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  source?: ExerciseFinishReportSource;
  /** @deprecated השתמשו ב־source */
  isClinical?: boolean;
  /** @deprecated השתמשו ב־zone */
  zoneName?: string;
  /** רמת קושי שנבחרה (כוח / אזור ירוק): 0=קל, 1=בינוני, 2=קשה */
  selfCareDifficultyTier?: 0 | 1 | 2;
  selfCareDifficultyLabel?: string;
}

/** עובדת "הידעת?" — נוספה ידנית ע״י מטפל; מאושרת לפני הצגה למטופל */
export interface KnowledgeFact {
  id: string;
  /**
   * מזהה זרע לתוכן שנוצר/נבחר אצווה — נשמר ב־`app_knowledge_base.deleted_seed_ids` אחרי מחיקה
   * כדי למנוע הופעה חוזרת של אותו פריט.
   */
  seedId?: string;
  /** טקסט קצר לבועה הצפה (עד 50 תווים) */
  teaser: string;
  /** כותרת במודאל המורחב */
  title: string;
  explanation: string;
  /** קישור למאמר/מקור */
  sourceUrl: string;
  isApproved: boolean;
  source: 'manual';
  createdAt?: string;
}

export interface Patient {
  id: string;
  /** מטפל אחראי — סינון דשבורד ורישום מטופלים חדשים */
  therapistId: string;
  /**
   * מזהה כניסה לפורטל (רמזים לפרטיות, לדוגמה JD) — קבוע אחרי יצירה; ייחודי במערכת (Supabase Auth).
   * מטופלים ישנים ללא שדה: נגזר ממפתח הדמו PT-… ב־auth מקומי.
   */
  portalUsername?: string;
  /**
   * כינוי קצר לתצוגה (ראשי תיבות / Alias) — עדיף על שם מלא או על מזהה גנרי מהמסד.
   */
  displayAlias?: string;
  name: string;
  age: number;
  /**
   * מין לתצוגה קלינית (אופציונלי) — נשמר ב־payload; כשחסר מוצג גיל בלבד.
   */
  clinicalSex?: 'male' | 'female';
  /**
   * תיאור דמוגרפי חופשי (מגדר, גיל, עבודה…) — מחרוזת אחת לתצוגה ולמסד.
   */
  demographicsFreeText?: string;
  /** מקצוע / עיסוק — משוכפל לעמודת SQL `patients.occupation` בעת סנכרון */
  occupation?: string;
  /** תאריך לידה אופציונלי (YYYY-MM-DD) — משוכפל ל־`patients.birth_date` */
  birthDate?: string;
  /**
   * פרופיל אינטייק מובנה (ROM, כוח, בדיקות, היסטוריה רפואית, מטרות) — מופק מאינטייק AI.
   */
  clinicalIntakeProfile?: PatientClinicalIntakeProfile;
  /**
   * @deprecated נימוקי AI ישנים — עשויים להכיל כותרות אינטייק; נפרסים ל־`clinicalIntakeProfile` במיגרציה.
   */
  clinicalReasoningHe?: string[];
  /**
   * תובנות AI מובנות מאינטייק (אבחנה מבדלת, אזהרות, המלצות) — לתצוגת דשבורד קליני.
   */
  clinicalIntakeAiInsights?: ClinicalIntakeAiInsights;
  /** מדד כאב VAS (0–10) בזמן האינטייק — נשמר ב־payload */
  intakeVasScore?: number;
  /**
   * מטא-דאטה רפואי מרקע — מirror של `clinicalIntakeProfile.medical_history` לתאימות.
   */
  medicalProfileMetadata?: PatientMedicalProfileMetadata;
  diagnosis: string;
  /**
   * סיכום AI (אבחנה/תוכנית) — טקסט מלא מ-Gemini או עריכה ידנית; מוצג בדף המטופל ובפורטל.
   * כשחסר — משתמשים ב־`diagnosis` כתצוגה קצרה.
   */
  geminiClinicalNarrative?: string;
  primaryBodyArea: BodyArea;
  status: PatientStatus;
  /**
   * חשבון פורטל מוקפא על ידי המטפל — נחסמת גישה לתוכנית האימונים; הנתונים נשמרים.
   * נשמר ב־payload של patients ב-Supabase.
   */
  accountFrozen?: boolean;
  /**
   * When `false`, patient portal direct chat is locked (self-guided / unassisted plan).
   * Missing / `true` = chat allowed. Synced to `patients.allow_chat`.
   */
  allowChat?: boolean;
  level: ExerciseLevel;
  xp: number;
  xpForNextLevel: number;
  currentStreak: number;
  longestStreak: number;
  joinDate: string;
  /** תאריך התחלת פרוטוקול / שיקום (YYYY-MM-DD) — לחישוב שבוע נוכחי */
  startDate?: string;
  /** תאריך ניתוח (YYYY-MM-DD) — עדיפות לחישוב שבוע פרוטוקול */
  surgeryDate?: string;
  lastSessionDate: string;
  analytics: PatientAnalytics;
  pendingMessages: number;
  hasRedFlag: boolean;
  /**
   * נעילת תרגילים בפורטל לאחר דגל אדום דחוף (דיווח מטופל + התראה בדוא״ל).
   * מתאפס כשהמטפל מטפל בדגל או באיפוס משחק (דיבוג).
   */
  redFlagActive?: boolean;
  therapistNotes: string;
  /**
   * סיכום/סיפור אינטייק גולמי — שם השדה המקורי מאשף האינטייק (`extras.intakeStory`).
   * נשמר ב־`patients.payload`; לעיתים מועתק גם ל־`therapistNotes` או רק ב־`initialIntakeArchive`.
   */
  intakeStory?: string;
  /** מטבעות למידה / בונוסים בתצוגת מטופל */
  coins: number;
  /**
   * מקטעי אנטומיה להדגשת «הבעיה» — זוהר אדום במודל 3D (נשמר ב־localStorage).
   */
  injuryHighlightSegments: BodyArea[];
  /**
   * עקיפות נעילה קלינית (טל — נעול / פתוח) על שרשרת המוקד — לשליטת מטפל במודל 3D.
   */
  manualClinicalSegmentLockOverrides?: Partial<Record<BodyArea, ManualClinicalSegmentLockOverride>>;
  /**
   * מוקד משני מהמטפל — כתום במפה; חוסם פרהאב כמו מוקד ראשי לפי אותו מקטע.
   */
  secondaryClinicalBodyAreas: BodyArea[];
  /** צילום האינטייק הראשון — לא מתעדכן אחרי השמירה הראשונה */
  initialIntakeArchive?: PatientIntakeArchive;
  /**
   * ציר גרסאות אינטייק (קבלה + ניתוחים השוואתיים) — נשמר ב־payload.
   * הטאב האחרון = הגרסה הפעילה; קבלה ראשונית immutable.
   */
  intakeVersionTimeline?: PatientIntakeVersionEntry[];
  /**
   * סטטוס אינטייק קליני — `pending` מיצירת מטופל עד שמירת האינטייק; `complete` לאחר שמירה.
   * נשמר ב־payload ומסונכרן ל־Supabase.
   */
  intakeStatus?: 'pending' | 'complete';
  /** שדה קשר ישן (מספר בינלאומי ללא +) — נשמר לתאימות; התראות קליניות נשלחות בדוא״ל בלבד */
  contactWhatsappE164?: string;
  /**
   * רשומות תיעוד קליני מאושרות (ציר זמן) — נשמר ב־payload מטופל ומסונכרן ל־Supabase.
   */
  clinicalTimeline?: ClinicalTimelineEntry[];
  /**
   * עותק מטמון של תוכנית התרגילים האחרונה — נכתב על-ידי המטפל בכל שמירה.
   * משמש כ-fallback לפורטל המטופל כאשר ה-JWT של המטופל אינו מכוסה על-ידי מדיניות ה-RLS
   * של טבלת `exercise_plans` (שנכתבת לגישת מטפל בלבד כברירת מחדל).
   * מאוחסן בתוך `patients.payload` שהמטופל תמיד רשאי לקרוא.
   */
  _exercisePlanCache?: PatientExercise[];
  /**
   * מפת ימים קליניים → השלמות תרגיל (`completedIds`) + XP יומי, ממוזגים מ־session_history וממצב מקומי.
   * נשמר ב־payload כדי שמזהי השלמה לא יאבדו ברענון כש־`session_history` אינו נטען מיד.
   */
  _sessionCompletionByDate?: Record<string, { completedIds: string[]; sessionXp: number }>;
  /**
   * תור קליני (הצעות AI + התראות בטיחות) — מסונכרן ל־Supabase בתוך payload לגישה ממכשירי מטפל שונים.
   */
  clinicalInsightsQueue?: PatientClinicalInsightsQueue;
  /**
   * עובדות «הידעת?» — משוכפלות ל־`patients.payload` בעת סנכרון מטפל (יחד עם `app_knowledge_base`)
   * כדי שמיזוג עם נתוני שרת ישנים לא ידרוס טיפים מקומיים לפני שמירת הענן.
   */
  knowledgeFacts?: KnowledgeFact[];
  /**
   * מנוי Web Push מהדפדפן (VAPID) — נשמר ב־`patients.payload` לאחר `pushManager.subscribe`.
   * משמש שרת/Edge Functions לשליחת התראות מחוץ ל-Expo.
   */
  webPushSubscription?: {
    endpoint: string;
    expirationTime?: number | null;
    keys?: { p256dh: string; auth: string };
  };
  /** Push delivery token (Expo or Web Push HTTPS endpoint) — stored in `patients.payload`. */
  pushToken?: string | null;
  /** Portal authentication / last open — stored in `patients.payload`. */
  lastLoginAt?: string | null;
  /** Last exercise completion or daily progress — stored in `patients.payload`. */
  lastWorkoutAt?: string | null;
  /** IANA timezone for reminder cron — stored in `patients.payload`. */
  reminderTimezone?: string | null;
  /**
   * פריטי חנות 3D שנרכשו — נשמר ב־payload (MVP: כדור פיזיו, משקולת, כלב).
   */
  ownedStoreItemIds?: string[];
  /**
   * פריטי חנות 3D פעילים — מוצגים על הרצפה ליד האווטאר (מזהי פריט מ־storeCatalog).
   */
  equippedItems?: string[];
}

/** תובנות AI לסשן טיפול — נשמרות ברשומת התיעוד (payload מטופל → Supabase) */
export type TreatmentAiInsights = {
  patientProgress: string;
  recommendations: string;
  exerciseModifications: string;
  generatedAt: string;
};

/** רשומת ציר זמן קליני / תיעוד טיפול */
export type ClinicalTimelineEntry = {
  id: string;
  createdAt: string;
  text: string;
  /** תובנות AI שהופקו לסשן זה — לצפייה חוזרת ללא הפקה מחדש */
  aiInsights?: TreatmentAiInsights;
};

/** היסטוריה רפואית מרקע — חלק מ־`clinicalIntakeProfile.medical_history` */
export type PatientClinicalIntakeMedicalHistory = {
  /** מחלות רקע (סוכרת, לחץ דם, לב, רקמת חיבור וכו') */
  backgroundDiseases?: string;
  /** תרופות קבועות / כרוניות */
  chronicMedications?: string;
};

/**
 * פרופיל אינטייק מובנה — נשמר ב־`patients.payload.clinicalIntakeProfile`
 * (מופק מ-Gemini או parsing מקומי של תבנית האינטייק).
 */
export type PatientClinicalIntakeProfile = {
  /** טווחי תנועה (ROM) — מערך רשומות */
  ranges?: string[];
  /** כוח שרירים (MMT 0–5) */
  muscle_strength?: string;
  /** בדיקות מיוחדות (Special Tests) */
  special_tests?: string[];
  /** מחלות רקע ותרופות קבועות */
  medical_history?: PatientClinicalIntakeMedicalHistory;
  /** מטרות תפקודיות/שיקום */
  goals?: string[];
};

/** @deprecated השתמשו ב־`clinicalIntakeProfile.medical_history` — נשמר לתאימות */
export type PatientMedicalProfileMetadata = PatientClinicalIntakeMedicalHistory;

/** שבוע בפרוטוקול טיפול — אורך דינמי (AI יכול להחזיר 4–12+ שבועות) */
export type TreatmentProtocolWeek = {
  weekNumber: number;
  title: string;
  milestones: string[];
};

export type ProtocolTrackingMilestone = {
  id: string;
  label: string;
  completed: boolean;
  completedAt?: string;
};

export type ProtocolTrackingWeek = {
  weekNumber: number;
  milestones: ProtocolTrackingMilestone[];
};

/** מצב מעקב שבועי — אורך תואם לפרוטוקול */
export type ProtocolTrackingState = ProtocolTrackingWeek[];

/** שדות גרסת אינטייק — snapshot לציר הגרסאות */
export type IntakeVersionFieldsSnapshot = {
  caseStory: string;
  vasScore: number | null;
  diagnosis: string;
  differentialDiagnosis: string[];
  precautionsHe: string[];
  recommendedTestsHe: string[];
  clinicalConclusionsHe: string[];
  redFlags: string[];
  clinicalIntakeProfile: PatientClinicalIntakeProfile;
  /** פרוטוקול טיפול — מערך שבועות או טקסט חופשי */
  treatmentProtocol?: TreatmentProtocolWeek[] | string;
  /** תחזית פרוגנוזה לטווח ~2 חודשים */
  prognosisHypothesis?: string;
  /** מעקב השלמת אבני דרך שבועיות */
  protocolTrackingState?: ProtocolTrackingState;
};

export type PatientIntakeVersionKind = 'initial' | 'analysis';

/** רשומה בציר גרסאות האינטייק — קבלה ראשונית (immutable) או ניתוח השוואתי */
export type PatientIntakeVersionEntry = {
  id: string;
  createdAt: string;
  kind: PatientIntakeVersionKind;
  label?: string;
  /** קבלה ראשונית — לא ניתנת לעריכה או מחיקה */
  immutable?: boolean;
  /** ארכיון רך — מוסתר מהטאבים אך נשמר בהיסטוריה */
  archived?: boolean;
  fields: IntakeVersionFieldsSnapshot;
  medicalSchema?: {
    clinical_story: string;
    pain_score: number | null;
    strength_metrics: string | Record<string, string>;
    rom_metrics: string | Record<string, string>;
    ai_conclusions: string[];
    recommendations: string[];
    two_month_protocol?: TreatmentProtocolWeek[] | string;
    two_month_prognosis?: string;
  };
  comparativeMeta?: {
    discrepancies: string[];
    reevaluation: { needed: boolean; rationaleHe: string };
  };
};

/** תובנות AI מובנות מאינטייק קליני — לתצוגה ולשמירה ב־payload */
export type ClinicalIntakeAiInsights = {
  differentialDiagnosis?: string[];
  precautionsHe?: string[];
  recommendedTestsHe?: string[];
  redFlags?: string[];
  redFlagAnalysis?: string;
  clinicalConclusionsHe?: string[];
};

/** שדות נוספים לשמירת פרופיל קליני ראשוני (אינטייק AI) */
export type InitialClinicalProfileExtras = {
  displayName?: string;
  intakeStory?: string;
  /** פרופיל אינטייק מובנה — מופק מ-Gemini או parsing מקומי */
  clinicalIntakeProfile?: PatientClinicalIntakeProfile;
  /** @deprecated — mirror של medical_history; נשמר לתאימות */
  medicalProfileMetadata?: PatientMedicalProfileMetadata;
  /** נימוקי AI / מסקנות קליניות */
  clinicalReasoningHe?: string[];
  /** תובנות AI מובנות — אבחנה מבדלת, אזהרות, המלצות */
  clinicalIntakeAiInsights?: ClinicalIntakeAiInsights;
  /** מדד כאב VAS (0–10) בזמן האינטייק */
  intakeVasScore?: number;
  /** מפרקים להדגשה אדומה (מוקד פגיעה) */
  injuryHighlightSegments?: BodyArea[];
  /** מפרקים משניים — כתום במפה */
  secondaryClinicalBodyAreas?: BodyArea[];
  /** אבחון/רושם קליני קצר */
  clinicalDiagnosis?: string;
  /** סיכום מלא (אבחנה + נימוקים) — נשמר בפרופיל המטופל */
  geminiClinicalNarrative?: string;
  /** דגל אדום שזוהה בסיפור — התראה למטפל */
  intakeRedFlag?: boolean;
  /** פרוטוקול/פרוגנוזה — נשמרים בגרסת אינטייק בלבד (wizard transport) */
  treatmentProtocol?: TreatmentProtocolWeek[] | string;
  prognosisHypothesis?: string;
  protocolTrackingState?: ProtocolTrackingState;
};

/** עקיפת נעילה קלינית ויזואלית במפת גוף — מול חישוב שרשרת אוטומטי */
export type ManualClinicalSegmentLockOverride = 'force_locked' | 'force_unlocked';

/**
 * צילום אינטייק ראשון (נשמר פעם אחת ב־payload) — להשוואה לאורך זמן ולמסך «כספת האינטייק».
 */
export type PatientIntakeArchive = {
  capturedAt: string;
  primaryBodyArea: BodyArea;
  libraryExerciseIds: string[];
  diagnosis: string;
  therapistNotes: string;
  geminiClinicalNarrative?: string;
  displayName?: string;
  extras: InitialClinicalProfileExtras;
};

export interface AuthUser {
  therapist: Therapist;
  isAuthenticated: boolean;
  /** When using Supabase Auth: optional role from JWT metadata (e.g. for RLS-aligned UI). */
  role?: string | null;
}

export type ClinicalSafetyTier = 'emergency' | 'high_priority' | 'standard';

export interface Message {
  id: string;
  patientId: string;
  content: string;
  timestamp: string;
  isRead: boolean;
  fromPatient: boolean;
  /** התראה אוטומטית ממנוע PHYSIOSHIELD — מופיעה בתיבת המטפל כנקראת */
  aiClinicalAlert?: boolean;
  /** דרגת חומרה לתצוגת מטפל */
  clinicalSafetyTier?: ClinicalSafetyTier;
}

/** התראת בטיחות קלינית בדשבורד מטפל */
export interface SafetyAlert {
  id: string;
  patientId: string;
  reasonCode: string;
  reasonHebrew: string;
  severity: 'emergency' | 'high_priority';
  createdAt: string;
}

/** ניווט דשבורד מטפל — ללא תצוגת מטופל (פורטל נפרד) */
export type NavSection =
  | 'overview'
  | 'clinical'
  | 'analytics'
  | 'messages'
  | 'settings'
  | 'knowledge'
  | 'exerciseCatalog';

// ── Exercise System ──────────────────────────────────────────────

export type ExerciseDifficulty = 1 | 2 | 3 | 4 | 5;
export type ExerciseType = 'clinical' | 'standard';

export interface Exercise {
  id: string;
  name: string;           // Hebrew display name
  muscleGroup: string;    // Hebrew label e.g. 'גב תחתון', 'ברך' (primary / display)
  /** Multiple muscle groups — custom exercises; persisted in exercise_plans JSONB */
  muscleGroups?: string[];
  targetArea: BodyArea;   // primary area for filters / legacy consumers
  /** Multiple body areas — custom exercises; persisted in exercise_plans JSONB */
  targetAreas?: BodyArea[];
  sets: number;
  reps?: number;
  holdSeconds?: number;
  difficulty: ExerciseDifficulty;
  type: ExerciseType;
  instructions: string;
  /** הערות/הנחיות ספציפיות שהמטפל כתב למטופל לתרגיל זה — נשמרות ב־exercise_plans */
  customInstructions?: string;
  xpReward: number;
  videoPlaceholder?: string;
  /** קישור הדגמה — ברירת מחדל ב־`exerciseVideoDefaults.ts` אם לא הוגדר */
  videoUrl: string;
  /** הנחיות הקלה (רגרסיה) — מוצג במודאל האימון */
  clinicalRegressionHint?: string;
  /** הנחיות התקדמות — מוצג במודאל האימון */
  clinicalProgressionHint?: string;
  isCustom?: boolean;     // true = manually added by therapist (not from library)
  /** true = תרגיל נוסף (לבחירה) — לא חובה לסשן; בונוס מטבעות/אנרגיה בלי XP לרמה */
  isOptional?: boolean;
}

/** An exercise as it exists in a patient's personal plan (therapist-adjusted values). */
export interface PatientExercise extends Exercise {
  patientSets: number;  // therapist override for this patient
  patientReps: number;  // therapist override (0 when time-based)
  /** משקל (ק״ג) — אופציונלי, לתרגילים עם עומס */
  patientWeightKg?: number;
  addedAt: string;      // ISO timestamp
}

export interface ExercisePlan {
  patientId: string;
  exercises: PatientExercise[];
  /** Supabase exercise_plans.id when synced from versioned storage */
  planRowId?: string;
  versionNumber?: number;
  /** When false, this in-memory slice is not the active plan (e.g. history overlay). */
  isActive?: boolean;
  /**
   * Therapist weekly session target (1–7). Maps to `exercise_plans.target_workouts_per_week`.
   * Default 7 when unset (legacy daily expectation).
   */
  targetWorkoutsPerWeek?: number;
}

/** Inactive exercise_plans rows for a patient (treatment evolution). */
export interface ExercisePlanHistoryEntry {
  id: string;
  patientId: string;
  exercises: PatientExercise[];
  versionNumber: number;
  parentPlanId: string | null;
  changeSummary: string | null;
  updatedAt: string;
  targetWorkoutsPerWeek?: number;
}

export interface DailySession {
  patientId: string;
  date: string;
  completedIds: string[];
  sessionXp: number;
  /** שדה legacy לשמירה לאחור; כלל הזהב מבוסס השלמה מלאה בלבד */
  goldDisqualified?: boolean;
  /** דיווחי מודאל סיום — נשמרים ב־session_history.payload לסנכרון מטפל */
  finishReports?: PatientExerciseFinishReport[];
  /**
   * תצלום VAS לפני/אחרי (אופציונלי) מתוך payload ב־session_history — ממופה ל־painHistory בהידרציה.
   */
  sessionPainBefore?: number;
  sessionPainAfter?: number;
}

/** סטטוס יום בלוח הקליני (מעקב אחר השלמת פוקוס קליני) */
export type ClinicalDayStatus = 'gold' | 'silver' | 'stasis' | 'empty';

/** רשומת היסטוריה יומית לאחר כל דיווח/עדכון סשן */
export interface DailyHistoryEntry {
  clinicalDate: string;
  exercisesPlanned: number;
  exercisesCompleted: number;
  completedExerciseIds: string[];
  xpEarned: number;
  status: ClinicalDayStatus;
}

// ── AI Suggestion System ─────────────────────────────────────────

/** Per-patient clinical queue shard stored in `patients.payload.clinicalInsightsQueue`. */
export type PatientClinicalInsightsQueue = {
  aiSuggestions: AiSuggestion[];
  safetyAlerts: SafetyAlert[];
  syncedAt?: string;
  /** Permanent `${patientId}-${type}` blocks after therapist dismissal. */
  dismissedRecommendationSignatures?: string[];
};

export type AiSuggestionType = 'increase_reps' | 'increase_sets' | 'reduce_reps' | 'add_exercise';
/** pending = מוצג למטופל; awaiting_therapist = המטופל אישר — ממתין לאישור מטפל לפני עדכון DB */
export type AiSuggestionStatus =
  | 'pending'
  | 'awaiting_therapist'
  | 'approved'
  | 'declined'
  | 'dismissed';

export type AiSuggestionField = 'reps' | 'sets' | 'weight' | 'holdSeconds';

export type AiSuggestionSource =
  | 'system'
  | 'guardian_patient'
  | 'therapist_note'
  | 'gemini_portal'
  | 'clinical_recommendation_engine';

export interface AiSuggestion {
  id: string;
  patientId: string;
  exerciseId: string;
  exerciseName: string;
  type: AiSuggestionType;
  field: AiSuggestionField;
  currentValue: number;
  suggestedValue: number;
  /** הסבר קליני למטפל (עברית) */
  reason: string;
  createdAt: string;
  status: AiSuggestionStatus;
  /** ISO timestamp when therapist approved or dismissed (for review-window filtering). */
  reviewedAt?: string;
  source?: AiSuggestionSource;
}

// ── Helpers ──────────────────────────────────────────────────────

export function getMuscleGroupLabel(area: BodyArea): string {
  const map: Record<BodyArea, string> = {
    neck: 'צוואר',
    chest: 'גו עליון / חזה',
    abdomen: 'גו תחתון / בטן',
    shoulder_right: 'כתף',
    shoulder_left: 'כתף',
    upper_arm_right: 'זרוע עליונה',
    upper_arm_left: 'זרוע עליונה',
    elbow_right: 'מרפק',
    elbow_left: 'מרפק',
    forearm_right: 'אמה',
    forearm_left: 'אמה',
    wrist_right: 'פרק יד',
    wrist_left: 'פרק יד',
    hand_right: 'כף יד',
    hand_left: 'כף יד',
    back_upper: 'גו עליון / חזה',
    back_lower: 'גו תחתון / בטן',
    hip_right: 'עכוז',
    hip_left: 'עכוז',
    thigh_right: 'ירך',
    thigh_left: 'ירך',
    knee_right: 'ברך',
    knee_left: 'ברך',
    shin_right: 'שוק',
    shin_left: 'שוק',
    ankle_right: 'קרסול',
    ankle_left: 'קרסול',
    foot_right: 'כף רגל',
    foot_left: 'כף רגל',
  };
  return map[area];
}
