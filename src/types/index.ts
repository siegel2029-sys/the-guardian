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
  | 'shoulder_right'
  | 'shoulder_left'
  | 'back_upper'
  | 'back_lower'
  | 'knee_right'
  | 'knee_left'
  | 'hip_right'
  | 'hip_left'
  | 'ankle_right'
  | 'ankle_left'
  | 'wrist_right'
  | 'wrist_left'
  | 'elbow_right'
  | 'elbow_left';

export const bodyAreaLabels: Record<BodyArea, string> = {
  neck: 'צוואר',
  shoulder_right: 'כתף ימין',
  shoulder_left: 'כתף שמאל',
  back_upper: 'גב עליון',
  back_lower: 'גב תחתון',
  knee_right: 'ברך ימין',
  knee_left: 'ברך שמאל',
  hip_right: 'ירך ימין',
  hip_left: 'ירך שמאל',
  ankle_right: 'קרסול ימין',
  ankle_left: 'קרסול שמאל',
  wrist_right: 'פרק כף יד ימין',
  wrist_left: 'פרק כף יד שמאל',
  elbow_right: 'מרפק ימין',
  elbow_left: 'מרפק שמאל',
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
  difficultyRating: number; // 1–5
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

export type PatientStatus = 'active' | 'pending' | 'paused';
export type ExerciseLevel = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

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
  effortRating: 1 | 2 | 3 | 4 | 5;
  loggedAt: string;
}

export type ExerciseFinishReportSource = 'therapist' | 'self-care';

/** דיווח סיום תרגול מתוך מודאל האימון — נשמר ב-localStorage; רשומות ישנות עשויות לחסר שדות */
export interface PatientExerciseFinishReport {
  id: string;
  patientId: string;
  exerciseId: string;
  timestamp: string;
  difficultyScore: 1 | 2 | 3 | 4 | 5;
  exerciseName?: string;
  zone?: string;
  painLevel?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  source?: ExerciseFinishReportSource;
  /** @deprecated השתמשו ב־source */
  isClinical?: boolean;
  /** @deprecated השתמשו ב־zone */
  zoneName?: string;
  /** רמת קושי שנבחרה (כוח / אזור ירוק): 0=קל, 1=בינוני, 2=קשה */
  selfCareDifficultyTier?: 0 | 1 | 2;
  selfCareDifficultyLabel?: string;
}

export interface Patient {
  id: string;
  /** מטפל אחראי — סינון דשבורד ורישום מטופלים חדשים */
  therapistId: string;
  name: string;
  age: number;
  diagnosis: string;
  primaryBodyArea: BodyArea;
  status: PatientStatus;
  level: ExerciseLevel;
  xp: number;
  xpForNextLevel: number;
  currentStreak: number;
  longestStreak: number;
  joinDate: string;
  lastSessionDate: string;
  analytics: PatientAnalytics;
  pendingMessages: number;
  hasRedFlag: boolean;
  therapistNotes: string;
  /** מטבעות למידה / בונוסים בתצוגת מטופל */
  coins: number;
}

export interface AuthUser {
  therapist: Therapist;
  isAuthenticated: boolean;
}

export type ClinicalSafetyTier = 'emergency' | 'high_priority' | 'standard';

export interface Message {
  id: string;
  patientId: string;
  content: string;
  timestamp: string;
  isRead: boolean;
  fromPatient: boolean;
  /** התראה אוטומטית ממנוע Guardian — מופיעה בתיבת המטפל כנקראת */
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
export type NavSection = 'overview' | 'clinical' | 'analytics' | 'messages' | 'settings';

// ── Exercise System ──────────────────────────────────────────────

export type ExerciseDifficulty = 1 | 2 | 3 | 4 | 5;
export type ExerciseType = 'clinical' | 'standard';

export interface Exercise {
  id: string;
  name: string;           // Hebrew display name
  muscleGroup: string;    // Hebrew label e.g. 'גב תחתון', 'ברך'
  targetArea: BodyArea;
  sets: number;
  reps?: number;
  holdSeconds?: number;
  difficulty: ExerciseDifficulty;
  type: ExerciseType;
  instructions: string;
  xpReward: number;
  videoPlaceholder?: string;
  /** קישור הדגמה — ברירת מחדל ב־`exerciseVideoDefaults.ts` אם לא הוגדר */
  videoUrl: string;
  /** הנחיות הקלה (רגרסיה) — מוצג במודאל האימון */
  clinicalRegressionHint?: string;
  /** הנחיות התקדמות — מוצג במודאל האימון */
  clinicalProgressionHint?: string;
  isCustom?: boolean;     // true = manually added by therapist (not from library)
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
}

export interface DailySession {
  patientId: string;
  date: string;
  completedIds: string[];
  sessionXp: number;
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

export type AiSuggestionType = 'increase_reps' | 'increase_sets' | 'reduce_reps' | 'add_exercise';
/** pending = מוצג למטופל; awaiting_therapist = המטופל אישר — ממתין לאישור מטפל לפני עדכון DB */
export type AiSuggestionStatus = 'pending' | 'awaiting_therapist' | 'approved' | 'declined';

export type AiSuggestionSource = 'system' | 'guardian_patient' | 'therapist_note';

export interface AiSuggestion {
  id: string;
  patientId: string;
  exerciseId: string;
  exerciseName: string;
  type: AiSuggestionType;
  field: 'reps' | 'sets' | 'weight';
  currentValue: number;
  suggestedValue: number;
  reason: string;        // Hebrew explanation shown to therapist
  createdAt: string;
  status: AiSuggestionStatus;
  source?: AiSuggestionSource;
}

// ── Helpers ──────────────────────────────────────────────────────

export function getMuscleGroupLabel(area: BodyArea): string {
  const map: Record<BodyArea, string> = {
    neck: 'צוואר', shoulder_right: 'כתף', shoulder_left: 'כתף',
    back_upper: 'גב עליון', back_lower: 'גב תחתון',
    knee_right: 'ברך', knee_left: 'ברך',
    hip_right: 'ירך', hip_left: 'ירך',
    ankle_right: 'קרסול', ankle_left: 'קרסול',
    wrist_right: 'פרק יד', wrist_left: 'פרק יד',
    elbow_right: 'מרפק', elbow_left: 'מרפק',
  };
  return map[area];
}
