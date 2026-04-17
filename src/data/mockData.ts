import type { Therapist, Patient, Message, ExercisePlan, Exercise, AiSuggestion } from '../types';
import { getMuscleGroupLabel } from '../types';
import { DEFAULT_EXERCISE_DEMO_VIDEO_URL } from './exerciseVideoDefaults';

export const mockTherapist: Therapist = {
  id: 'therapist-001',
  name: 'ד"ר מיכל לוי',
  email: 'michal.levi@guardian-clinic.co.il',
  title: 'פיזיותרפיסטית בכירה',
  avatarInitials: 'מל',
  clinicName: 'מרכז The Guardian',
};

/** מטפל שני לדמו — מטופלים משויכים ל־therapistId נפרד */
export const mockTherapistB: Therapist = {
  id: 'therapist-002',
  name: 'ד"ר יוסי כהן',
  email: 'yossi.cohen@guardian-clinic.co.il',
  title: 'פיזיותרפיסט',
  avatarInitials: 'יכ',
  clinicName: 'מרכז The Guardian',
};

export const mockPatients: Patient[] = [
  {
    id: 'patient-001',
    therapistId: 'therapist-001',
    name: 'אריאל כהן',
    age: 34,
    diagnosis: 'כאב גב תחתון כרוני',
    primaryBodyArea: 'back_lower',
    status: 'active',
    level: 4,
    xp: 1240,
    xpForNextLevel: 1500,
    currentStreak: 7,
    longestStreak: 12,
    joinDate: '2024-09-15',
    lastSessionDate: '2026-04-06',
    pendingMessages: 2,
    hasRedFlag: false,
    therapistNotes: 'מתקדם היטב. לשים לב לתרגילי חיזוק הליבה.',
    coins: 12,
    injuryHighlightSegments: [],
    secondaryClinicalBodyAreas: [],
    analytics: {
      averageOverallPain: 4.2,
      averageDifficulty: 3.1,
      totalSessions: 38,
      painByArea: { back_lower: 5.1, hip_right: 3.4, back_upper: 2.2 },
      painHistory: [
        { date: '2026-04-01', painLevel: 5, bodyArea: 'back_lower' },
        { date: '2026-04-02', painLevel: 4, bodyArea: 'back_lower' },
        { date: '2026-04-03', painLevel: 6, bodyArea: 'back_lower', notes: 'כאב מוגבר לאחר הליכה ממושכת' },
        { date: '2026-04-04', painLevel: 4, bodyArea: 'hip_right' },
        { date: '2026-04-05', painLevel: 3, bodyArea: 'back_lower' },
        { date: '2026-04-06', painLevel: 4, bodyArea: 'back_lower' },
      ],
      sessionHistory: [
        { date: '2026-04-01', exercisesCompleted: 6, totalExercises: 6, difficultyRating: 3, xpEarned: 60 },
        { date: '2026-04-02', exercisesCompleted: 5, totalExercises: 6, difficultyRating: 3, xpEarned: 50 },
        { date: '2026-04-03', exercisesCompleted: 6, totalExercises: 6, difficultyRating: 4, xpEarned: 65 },
        { date: '2026-04-04', exercisesCompleted: 4, totalExercises: 6, difficultyRating: 3, xpEarned: 40 },
        { date: '2026-04-05', exercisesCompleted: 6, totalExercises: 6, difficultyRating: 2, xpEarned: 60 },
        { date: '2026-04-06', exercisesCompleted: 6, totalExercises: 6, difficultyRating: 3, xpEarned: 60 },
      ],
    },
  },
  {
    id: 'patient-002',
    therapistId: 'therapist-002',
    name: 'שירה מזרחי',
    age: 28,
    diagnosis: 'שיקום לאחר קרע ברצועת ACL',
    primaryBodyArea: 'knee_right',
    status: 'active',
    level: 6,
    xp: 2100,
    xpForNextLevel: 2500,
    currentStreak: 14,
    longestStreak: 20,
    joinDate: '2024-11-01',
    lastSessionDate: '2026-04-07',
    pendingMessages: 0,
    hasRedFlag: false,
    therapistNotes: 'ביצועים מצוינים. שלב 2 של שיקום - אפשר להגביר עומסים.',
    coins: 5,
    injuryHighlightSegments: [],
    secondaryClinicalBodyAreas: [],
    analytics: {
      averageOverallPain: 2.8,
      averageDifficulty: 3.8,
      totalSessions: 62,
      painByArea: { knee_right: 3.5, hip_right: 1.9, ankle_right: 2.1 },
      painHistory: [
        { date: '2026-03-24', painLevel: 5, bodyArea: 'knee_right' },
        { date: '2026-03-26', painLevel: 5, bodyArea: 'knee_right' },
        { date: '2026-03-29', painLevel: 5, bodyArea: 'knee_right' },
        { date: '2026-04-01', painLevel: 4, bodyArea: 'knee_right' },
        { date: '2026-04-02', painLevel: 4, bodyArea: 'knee_right' },
        { date: '2026-04-03', painLevel: 4, bodyArea: 'knee_right' },
        { date: '2026-04-04', painLevel: 4, bodyArea: 'knee_right' },
        { date: '2026-04-05', painLevel: 4, bodyArea: 'knee_right' },
        { date: '2026-04-06', painLevel: 4, bodyArea: 'knee_right' },
        { date: '2026-04-07', painLevel: 4, bodyArea: 'knee_right' },
      ],
      sessionHistory: [
        { date: '2026-04-01', exercisesCompleted: 8, totalExercises: 8, difficultyRating: 4, xpEarned: 80 },
        { date: '2026-04-02', exercisesCompleted: 8, totalExercises: 8, difficultyRating: 4, xpEarned: 80 },
        { date: '2026-04-03', exercisesCompleted: 7, totalExercises: 8, difficultyRating: 4, xpEarned: 70 },
        { date: '2026-04-04', exercisesCompleted: 8, totalExercises: 8, difficultyRating: 3, xpEarned: 80 },
        { date: '2026-04-05', exercisesCompleted: 8, totalExercises: 8, difficultyRating: 1, xpEarned: 80 },
        { date: '2026-04-06', exercisesCompleted: 8, totalExercises: 8, difficultyRating: 1, xpEarned: 80 },
        { date: '2026-04-07', exercisesCompleted: 8, totalExercises: 8, difficultyRating: 1, xpEarned: 90 },
      ],
    },
  },
  {
    id: 'patient-003',
    therapistId: 'therapist-001',
    name: 'יוסף אברהם',
    age: 55,
    diagnosis: 'כאב כתף - תסמונת הרוטטור קאף',
    primaryBodyArea: 'shoulder_right',
    status: 'active',
    level: 2,
    xp: 380,
    xpForNextLevel: 600,
    currentStreak: 3,
    longestStreak: 5,
    joinDate: '2026-02-20',
    lastSessionDate: '2026-04-05',
    pendingMessages: 1,
    hasRedFlag: true,
    therapistNotes: 'דיווח על כאב חריג בלילה. לבדוק ב-Flag האדום.',
    coins: 0,
    injuryHighlightSegments: [],
    secondaryClinicalBodyAreas: [],
    analytics: {
      averageOverallPain: 6.7,
      averageDifficulty: 2.3,
      totalSessions: 14,
      painByArea: { shoulder_right: 7.8, neck: 5.2, elbow_right: 3.1 },
      painHistory: [
        { date: '2026-04-01', painLevel: 7, bodyArea: 'shoulder_right' },
        { date: '2026-04-02', painLevel: 8, bodyArea: 'shoulder_right', notes: 'כאב חריג בלילה - דגל אדום' },
        { date: '2026-04-03', painLevel: 6, bodyArea: 'shoulder_right' },
        { date: '2026-04-04', painLevel: 7, bodyArea: 'neck' },
        { date: '2026-04-05', painLevel: 6, bodyArea: 'shoulder_right' },
      ],
      sessionHistory: [
        { date: '2026-04-01', exercisesCompleted: 4, totalExercises: 5, difficultyRating: 2, xpEarned: 40 },
        { date: '2026-04-02', exercisesCompleted: 3, totalExercises: 5, difficultyRating: 2, xpEarned: 30 },
        { date: '2026-04-03', exercisesCompleted: 5, totalExercises: 5, difficultyRating: 2, xpEarned: 50 },
        { date: '2026-04-04', exercisesCompleted: 4, totalExercises: 5, difficultyRating: 3, xpEarned: 40 },
        { date: '2026-04-05', exercisesCompleted: 4, totalExercises: 5, difficultyRating: 2, xpEarned: 40 },
      ],
    },
  },
  {
    id: 'pilot11',
    therapistId: 'therapist-001',
    name: 'Pilot 11',
    age: 40,
    diagnosis: 'חשבון בדיקות גמיפיקציה (pilot11)',
    primaryBodyArea: 'back_lower',
    status: 'active',
    level: 3,
    xp: 200,
    xpForNextLevel: 600,
    currentStreak: 2,
    longestStreak: 4,
    joinDate: '2026-03-01',
    lastSessionDate: '2026-04-06',
    pendingMessages: 0,
    hasRedFlag: false,
    therapistNotes: 'חשבון pilot לבדיקת פאנל דיבאג.',
    coins: 25,
    injuryHighlightSegments: [],
    secondaryClinicalBodyAreas: [],
    analytics: {
      averageOverallPain: 3.5,
      averageDifficulty: 3,
      totalSessions: 8,
      painByArea: { back_lower: 4 },
      painHistory: [
        { date: '2026-04-04', painLevel: 4, bodyArea: 'back_lower' },
        { date: '2026-04-05', painLevel: 3, bodyArea: 'back_lower' },
        { date: '2026-04-06', painLevel: 3, bodyArea: 'back_lower' },
      ],
      sessionHistory: [
        { date: '2026-04-04', exercisesCompleted: 4, totalExercises: 5, difficultyRating: 3, xpEarned: 40 },
        { date: '2026-04-05', exercisesCompleted: 5, totalExercises: 5, difficultyRating: 3, xpEarned: 50 },
        { date: '2026-04-06', exercisesCompleted: 5, totalExercises: 5, difficultyRating: 3, xpEarned: 50 },
      ],
    },
  },
];

export const mockMessages: Message[] = [
  { id: 'msg-001', patientId: 'patient-001', content: 'שלום, הכאב בגב השתפר קצת אחרי התרגילים של אתמול. תודה!', timestamp: '2026-04-06T18:30:00Z', isRead: false, fromPatient: true },
  { id: 'msg-002', patientId: 'patient-001', content: 'האם אני יכול לעשות את התרגילים גם בבוקר?',                  timestamp: '2026-04-07T08:15:00Z', isRead: false, fromPatient: true },
  { id: 'msg-003', patientId: 'patient-003', content: 'הרגשתי כאב חזק מאוד בלילה, לא ישנתי טוב.',                  timestamp: '2026-04-07T07:00:00Z', isRead: false, fromPatient: true },
];

// ── Global Exercise Library ───────────────────────────────────────
// כל תרגיל כולל `videoUrl`; ברירת המחדל ב־exerciseVideoDefaults.ts — ניתן לדרוס פר־תרגיל.

export const EXERCISE_LIBRARY: Exercise[] = [
  // Lower back
  {
    id: 'lib-bridge',
    name: 'גשר אגן',
    muscleGroup: 'גב תחתון',
    targetArea: 'back_lower',
    sets: 3,
    reps: 12,
    difficulty: 2,
    type: 'clinical',
    instructions: 'שכב על הגב. הרם האגן עד יישור קו. החזק 2 שנ\' ורד.',
    xpReward: 30,
    videoPlaceholder: 'גשר אגן – הדגמה',
    videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL,
    clinicalRegressionHint:
      'אם כאב >4/10: הקטינו גובה האגן, פחות חזרות, או בצעו רק הטיה קטנה של אגן בלי הרמה מלאה.',
    clinicalProgressionHint:
      'אם קל: החזיקו 3 שניות בראש הגשר, או בצעו רגל אחת (בהסכמת המטפל).',
  },
  { id: 'lib-plank',       name: 'פלאנק',               muscleGroup: 'ליבה',     targetArea: 'back_lower',     sets: 3, holdSeconds: 20,  difficulty: 3, type: 'clinical',  instructions: 'עמוד על אמות ידיים. גוף ישר. אל תניח האגן לצנוח.',               xpReward: 40, videoPlaceholder: 'פלאנק – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-superman',    name: 'שחייה יבשה',          muscleGroup: 'גב תחתון', targetArea: 'back_lower',     sets: 3, reps: 10,        difficulty: 3, type: 'clinical',  instructions: 'שכב על הבטן. הרם יד ורגל נגדית.',                                xpReward: 35, videoPlaceholder: 'שחייה יבשה – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-pelvic-tilt', name: 'הטיית אגן',           muscleGroup: 'גב תחתון', targetArea: 'back_lower',     sets: 3, reps: 15,        difficulty: 1, type: 'standard', instructions: 'שכב עם ברכיים כפופות. לחץ גב תחתון לרצפה.',                      xpReward: 20, videoPlaceholder: 'הטיית אגן – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-knee-chest',  name: 'מתיחת ברך לחזה',      muscleGroup: 'גב תחתון', targetArea: 'back_lower',     sets: 2, holdSeconds: 30, difficulty: 1, type: 'clinical',  instructions: 'שכב על הגב. משוך ברך לחזה. החלף רגליים.',                        xpReward: 20, videoPlaceholder: 'מתיחת ברך לחזה – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-deadbug',     name: 'חרק מת',              muscleGroup: 'ליבה',     targetArea: 'back_lower',     sets: 3, reps: 8,         difficulty: 3, type: 'clinical',  instructions: 'שכב על הגב. רגליים ב-90°. הורד יד ורגל נגדית.',                  xpReward: 35, videoPlaceholder: 'חרק מת – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  // Knee
  { id: 'lib-mini-squat',  name: 'כריעה חלקית',         muscleGroup: 'ברך',      targetArea: 'knee_right',     sets: 3, reps: 15,        difficulty: 3, type: 'clinical',  instructions: 'כרע עד 45° בלבד. ברך מעל אצבעות.',                              xpReward: 35, videoPlaceholder: 'כריעה חלקית – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-squat',       name: 'כריעות מלאות',        muscleGroup: 'ברך',      targetArea: 'knee_right',     sets: 3, reps: 10,        difficulty: 4, type: 'standard', instructions: 'כרע עד 90°. גב ישר. ברכיים לא חורגות מהאצבעות.',               xpReward: 45, videoPlaceholder: 'כריעות – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-wall-sit',    name: 'כיסא קיר',            muscleGroup: 'ברך',      targetArea: 'knee_right',     sets: 3, holdSeconds: 30, difficulty: 3, type: 'clinical',  instructions: 'הישען לקיר בזווית 90°. החזק את המצב.',                           xpReward: 35, videoPlaceholder: 'כיסא קיר – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-slr',         name: 'הרמת רגל ישרה',       muscleGroup: 'ברך',      targetArea: 'knee_right',     sets: 3, reps: 12,        difficulty: 2, type: 'clinical',  instructions: 'שכב. הרם רגל ישרה ל-45°.',                                       xpReward: 30, videoPlaceholder: 'הרמת רגל ישרה – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-step-up',     name: 'עלייה על מדרגה',      muscleGroup: 'ברך',      targetArea: 'knee_right',     sets: 3, reps: 12,        difficulty: 4, type: 'clinical',  instructions: 'עלה מדרגה בצורה מבוקרת.',                                        xpReward: 45, videoPlaceholder: 'עלייה על מדרגה – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-prone-bend',  name: 'כיפוף ברך שכיבה',     muscleGroup: 'ברך',      targetArea: 'knee_right',     sets: 3, reps: 10,        difficulty: 2, type: 'clinical',  instructions: 'שכב על בטן. כופף ברך לכיוון הישבן.',                             xpReward: 30, videoPlaceholder: 'כיפוף ברך – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-single-leg',  name: 'עמידה על רגל אחת',    muscleGroup: 'ברך',      targetArea: 'knee_right',     sets: 3, holdSeconds: 30, difficulty: 3, type: 'clinical',  instructions: 'עמוד על רגל פגועה. שמור יציבות.',                                xpReward: 40, videoPlaceholder: 'שיווי משקל – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  // Hip
  { id: 'lib-lat-band',    name: 'הליכה צדדית עם גומיה', muscleGroup: 'ירך',     targetArea: 'hip_right',      sets: 2, reps: 15,        difficulty: 3, type: 'standard', instructions: 'קשור גומייה. לך 15 צעדים לצד וחזור.',                           xpReward: 35, videoPlaceholder: 'הליכה צדדית – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-groin',       name: 'מתיחת מפשעה',         muscleGroup: 'ירך',      targetArea: 'hip_right',      sets: 2, holdSeconds: 30, difficulty: 1, type: 'standard', instructions: 'שב עם כפות רגליים ביחד. לחץ ברכיים לרצפה.',                     xpReward: 20, videoPlaceholder: 'מתיחת מפשעה – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  // Shoulder
  { id: 'lib-pendulum',    name: 'פנדולום כתף',          muscleGroup: 'כתף',      targetArea: 'shoulder_right', sets: 3, holdSeconds: 30, difficulty: 1, type: 'clinical',  instructions: 'הישען קדימה. זרוע תלויה חופשי. נוע בעיגולים.',                  xpReward: 20, videoPlaceholder: 'פנדולום – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ext-rot',     name: 'סיבוב חיצוני גומייה', muscleGroup: 'כתף',      targetArea: 'shoulder_right', sets: 3, reps: 10,        difficulty: 2, type: 'clinical',  instructions: 'מרפק ב-90°. סובב האמה החוצה.',                                   xpReward: 30, videoPlaceholder: 'סיבוב חיצוני – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-wall-push',   name: 'שכיבת סמיכה קיר',     muscleGroup: 'כתף',      targetArea: 'shoulder_right', sets: 3, reps: 10,        difficulty: 2, type: 'standard', instructions: 'עמוד 60 ס"מ מהקיר. כופף מרפקים.',                               xpReward: 25, videoPlaceholder: 'שכיבה על קיר – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-front-raise', name: 'הרמת זרוע קדמית',     muscleGroup: 'כתף',      targetArea: 'shoulder_right', sets: 2, reps: 10,        difficulty: 2, type: 'standard', instructions: 'הרם זרוע פגועה קדימה לגובה כתף. ירד לאט.',                     xpReward: 25, videoPlaceholder: 'הרמה קדמית – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-shoulder-str',name: 'מתיחת כתף מעל',       muscleGroup: 'כתף',      targetArea: 'shoulder_right', sets: 2, holdSeconds: 30, difficulty: 1, type: 'clinical',  instructions: 'הרם זרוע מעל הראש בעזרת הזרוע הבריאה.',                         xpReward: 20, videoPlaceholder: 'מתיחת כתף מעל – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  // Ankle
  { id: 'lib-calf-str',    name: 'מתיחת שוק',           muscleGroup: 'קרסול',    targetArea: 'ankle_right',    sets: 2, holdSeconds: 30, difficulty: 1, type: 'standard', instructions: 'עמוד מול קיר. רגל מאחור ישרה. עקב לרצפה.',                      xpReward: 20, videoPlaceholder: 'מתיחת שוק – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ankle-circ',  name: 'מעגלי קרסול',         muscleGroup: 'קרסול',    targetArea: 'ankle_right',    sets: 2, reps: 15,        difficulty: 1, type: 'standard', instructions: 'הסב קרסול ב-10 מעגלים בכל כיוון.',                              xpReward: 15, videoPlaceholder: 'מעגלי קרסול – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
];

// ── Exercise Plan helper ──────────────────────────────────────────

const D = '2026-04-01T00:00:00Z';
function pe(ex: Exercise, patientReps: number, patientSets: number) {
  return { ...ex, patientReps, patientSets, addedAt: D };
}

// ── Patient Exercise Plans ────────────────────────────────────────

export const mockExercisePlans: ExercisePlan[] = [
  {
    patientId: 'patient-001',
    exercises: [
      pe({ id: 'ex-001-1', name: 'גשר אגן',        muscleGroup: getMuscleGroupLabel('back_lower'), targetArea: 'back_lower', sets: 3, reps: 12,        difficulty: 2, type: 'clinical',  instructions: 'שכב על הגב. הרם האגן עד יישור קו. החזק 2 שנ\'.',             xpReward: 30, videoPlaceholder: 'גשר אגן – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 12, 3),
      pe({ id: 'ex-001-2', name: 'מתיחת ברך לחזה', muscleGroup: getMuscleGroupLabel('back_lower'), targetArea: 'back_lower', sets: 2, holdSeconds: 30, difficulty: 1, type: 'clinical',  instructions: 'שכב על הגב. משוך ברך לחזה. החלף רגליים.',                   xpReward: 20, videoPlaceholder: 'מתיחת ברך – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 0,  2),
      pe({ id: 'ex-001-3', name: 'פלאנק',          muscleGroup: 'ליבה',                            targetArea: 'back_lower', sets: 3, holdSeconds: 20, difficulty: 3, type: 'clinical',  instructions: 'עמוד על אמות ידיים. גוף ישר.',                               xpReward: 40, videoPlaceholder: 'פלאנק – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 0,  3),
      pe({ id: 'ex-001-4', name: 'הטיית אגן',      muscleGroup: getMuscleGroupLabel('back_lower'), targetArea: 'back_lower', sets: 3, reps: 15,        difficulty: 1, type: 'standard', instructions: 'שכב. לחץ גב תחתון לרצפה. שחרר לאט.',                        xpReward: 20, videoPlaceholder: 'הטיית אגן – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 15, 3),
      pe({ id: 'ex-001-5', name: 'שחייה יבשה',     muscleGroup: getMuscleGroupLabel('back_lower'), targetArea: 'back_lower', sets: 3, reps: 10,        difficulty: 3, type: 'clinical',  instructions: 'שכב על הבטן. הרם יד ורגל נגדית.',                            xpReward: 35, videoPlaceholder: 'שחייה יבשה – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 10, 3),
      pe({ id: 'ex-001-6', name: 'מתיחת מפשעה',   muscleGroup: getMuscleGroupLabel('hip_right'),  targetArea: 'hip_right',  sets: 2, holdSeconds: 30, difficulty: 1, type: 'standard', instructions: 'שב עם כפות רגליים ביחד. לחץ ברכיים לרצפה.',                 xpReward: 20, videoPlaceholder: 'מתיחת מפשעה – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 0,  2),
    ],
  },
  {
    patientId: 'patient-002',
    exercises: [
      pe({ id: 'ex-002-1', name: 'כריעה חלקית',      muscleGroup: getMuscleGroupLabel('knee_right'),  targetArea: 'knee_right',  sets: 3, reps: 15,        difficulty: 3, type: 'clinical',  instructions: 'כרע עד 45°. ברך מעל אצבעות.',                               xpReward: 35, videoPlaceholder: 'כריעה חלקית – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 15, 3),
      pe({ id: 'ex-002-2', name: 'הרמת רגל ישרה',    muscleGroup: getMuscleGroupLabel('knee_right'),  targetArea: 'knee_right',  sets: 3, reps: 12,        difficulty: 2, type: 'clinical',  instructions: 'שכב. הרם רגל ישרה ל-45°.',                                   xpReward: 30, videoPlaceholder: 'הרמת רגל ישרה – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 12, 3),
      pe({ id: 'ex-002-3', name: 'כיפוף ברך שכיבה',  muscleGroup: getMuscleGroupLabel('knee_right'),  targetArea: 'knee_right',  sets: 3, reps: 10,        difficulty: 2, type: 'clinical',  instructions: 'שכב על בטן. כופף ברך לכיוון הישבן.',                         xpReward: 30, videoPlaceholder: 'כיפוף ברך – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 10, 3),
      pe({ id: 'ex-002-4', name: 'עמידה על רגל אחת', muscleGroup: getMuscleGroupLabel('knee_right'),  targetArea: 'knee_right',  sets: 3, holdSeconds: 30, difficulty: 3, type: 'clinical',  instructions: 'עמוד על רגל פגועה. שמור יציבות.',                            xpReward: 40, videoPlaceholder: 'שיווי משקל – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 0,  3),
      pe({ id: 'ex-002-5', name: 'לחיצת ארבע ראשי',  muscleGroup: getMuscleGroupLabel('knee_right'),  targetArea: 'knee_right',  sets: 3, holdSeconds: 10, reps: 15, difficulty: 1, type: 'clinical',  instructions: 'הדק שרירי ירך. דחוף ברך לרצפה.',                         xpReward: 20, videoPlaceholder: 'לחיצת ארבע ראשי – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 15, 3),
      pe({ id: 'ex-002-6', name: 'עלייה על מדרגה',   muscleGroup: getMuscleGroupLabel('knee_right'),  targetArea: 'knee_right',  sets: 3, reps: 12,        difficulty: 4, type: 'clinical',  instructions: 'עלה מדרגה בצורה מבוקרת.',                                   xpReward: 45, videoPlaceholder: 'עלייה על מדרגה – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 12, 3),
      pe({ id: 'ex-002-7', name: 'הליכה צדדית',      muscleGroup: getMuscleGroupLabel('hip_right'),   targetArea: 'hip_right',   sets: 2, reps: 15,        difficulty: 3, type: 'standard', instructions: 'קשור גומייה. לך 15 צעדים לצד.',                             xpReward: 35, videoPlaceholder: 'הליכה צדדית – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 15, 2),
      pe({ id: 'ex-002-8', name: 'מתיחת שוק',        muscleGroup: getMuscleGroupLabel('ankle_right'), targetArea: 'ankle_right', sets: 2, holdSeconds: 30, difficulty: 1, type: 'standard', instructions: 'עמוד מול קיר. רגל מאחור ישרה. עקב לרצפה.',                  xpReward: 20, videoPlaceholder: 'מתיחת שוק – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 0,  2),
    ],
  },
  {
    patientId: 'patient-003',
    exercises: [
      pe({ id: 'ex-003-1', name: 'פנדולום כתף',         muscleGroup: getMuscleGroupLabel('shoulder_right'), targetArea: 'shoulder_right', sets: 3, holdSeconds: 30, difficulty: 1, type: 'clinical',  instructions: 'הישען קדימה. זרוע תלויה חופשי. נוע בעיגולים.',     xpReward: 20, videoPlaceholder: 'פנדולום – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 0,  3),
      pe({ id: 'ex-003-2', name: 'מתיחת כתף מעל',       muscleGroup: getMuscleGroupLabel('shoulder_right'), targetArea: 'shoulder_right', sets: 2, holdSeconds: 30, difficulty: 1, type: 'clinical',  instructions: 'הרם זרוע מעל הראש בעזרת הזרוע הבריאה.',           xpReward: 20, videoPlaceholder: 'מתיחת כתף מעל – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 0,  2),
      pe({ id: 'ex-003-3', name: 'סיבוב חיצוני גומייה', muscleGroup: getMuscleGroupLabel('shoulder_right'), targetArea: 'shoulder_right', sets: 3, reps: 10,        difficulty: 2, type: 'clinical',  instructions: 'מרפק ב-90°. סובב האמה החוצה.',                     xpReward: 30, videoPlaceholder: 'סיבוב חיצוני – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 10, 3),
      pe({ id: 'ex-003-4', name: 'שכיבת סמיכה קיר',    muscleGroup: getMuscleGroupLabel('shoulder_right'), targetArea: 'shoulder_right', sets: 3, reps: 10,        difficulty: 2, type: 'standard', instructions: 'עמוד 60 ס"מ מהקיר. כופף מרפקים.',                   xpReward: 25, videoPlaceholder: 'שכיבה על קיר – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 10, 3),
      pe({ id: 'ex-003-5', name: 'הרמת זרוע קדמית',    muscleGroup: getMuscleGroupLabel('shoulder_right'), targetArea: 'shoulder_right', sets: 2, reps: 10,        difficulty: 2, type: 'standard', instructions: 'הרם זרוע פגועה לגובה כתף. ירד לאט.',               xpReward: 25, videoPlaceholder: 'הרמה קדמית – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 10, 2),
    ],
  },
  {
    patientId: 'pilot11',
    exercises: [
      pe({ id: 'ex-p11-1', name: 'גשר אגן', muscleGroup: getMuscleGroupLabel('back_lower'), targetArea: 'back_lower', sets: 3, reps: 12, difficulty: 2, type: 'clinical', instructions: 'שכב על הגב. הרם האגן.', xpReward: 30, videoPlaceholder: 'גשר אגן – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 12, 3),
      pe({ id: 'ex-p11-2', name: 'פלאנק', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, holdSeconds: 20, difficulty: 3, type: 'clinical', instructions: 'עמוד על אמות ידיים.', xpReward: 40, videoPlaceholder: 'פלאנק – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 0, 3),
      pe({ id: 'ex-p11-3', name: 'הטיית אגן', muscleGroup: getMuscleGroupLabel('back_lower'), targetArea: 'back_lower', sets: 3, reps: 15, difficulty: 1, type: 'standard', instructions: 'לחץ גב תחתון לרצפה.', xpReward: 20, videoPlaceholder: 'הטיית אגן – הדגמה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL }, 15, 3),
    ],
  },
];

// ── Seed AI Suggestions ───────────────────────────────────────────
// Patient 2 (avg pain 2.3 last 3 days < 3)  → increase_reps
// Patient 3 (avg pain 6.3 last 3 days > 6)  → reduce_reps

export const mockAiSuggestions: AiSuggestion[] = [
  {
    id: 'ai-000',
    patientId: 'patient-001',
    exerciseId: 'ex-001-1',
    exerciseName: 'גשר אגן',
    type: 'increase_reps',
    field: 'reps',
    currentValue: 12,
    suggestedValue: 14,
    reason: 'מגמת כאב יציבה בימים האחרונים. ניתן להעלות מעט חזרות בזהירות.',
    createdAt: '2026-04-07T07:00:00Z',
    status: 'pending',
    source: 'system',
  },
  {
    id: 'ai-001',
    patientId: 'patient-002',
    exerciseId: 'ex-002-1',
    exerciseName: 'כריעה חלקית',
    type: 'increase_reps',
    field: 'reps',
    currentValue: 15,
    suggestedValue: 17,
    reason: 'כאב ממוצע ב-3 ימים אחרונים: 2.3 (מתחת לסף 3). ניתן להגביר עומס בבטחה.',
    createdAt: '2026-04-07T06:00:00Z',
    status: 'pending',
    source: 'system',
  },
  {
    id: 'ai-002',
    patientId: 'patient-003',
    exerciseId: 'ex-003-3',
    exerciseName: 'סיבוב חיצוני גומייה',
    type: 'reduce_reps',
    field: 'reps',
    currentValue: 10,
    suggestedValue: 7,
    reason: 'כאב ממוצע ב-3 ימים אחרונים: 6.3 (מעל סף 6). מומלץ להפחית עומס.',
    createdAt: '2026-04-07T06:00:00Z',
    status: 'pending',
    source: 'system',
  },
];
