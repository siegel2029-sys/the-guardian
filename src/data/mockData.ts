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

// ── Global Exercise Library ───────────────────────────────────────
// כל תרגיל כולל `videoUrl`; ברירת המחדל ב־exerciseVideoDefaults.ts — ניתן לדרוס פר־תרגיל.

export const EXERCISE_LIBRARY: Exercise[] = [
  
 // ---------------------------------------------------------
  // === גב תחתון וליבה (30 תרגילים מקיפים) ===
  // ---------------------------------------------------------

  // -- תנועתיות וטווחים (Mobility & ROM) --
  { id: 'lib-lb-01', name: 'קמר-קער (חתול-פרה)', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 2, reps: 15, difficulty: 1, type: 'clinical', instructions: 'עמידת שש. קמרו את הגב למעלה תוך הוצאת אוויר, ולאחר מכן קערו למטה תוך הכנסת אוויר.', xpReward: 20, videoPlaceholder: 'קמר קער', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-02', name: 'רוטציות מותניות', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 2, reps: 20, difficulty: 1, type: 'clinical', instructions: 'שכבו על הגב, ברכיים כפופות וצמודות. הורידו את שתי הברכיים יחד מצד לצד בעדינות.', xpReward: 20, videoPlaceholder: 'רוטציות מותניות', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-03', name: 'מתיחת עכוז לעקבים (Childs Pose)', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 2, holdSeconds: 45, difficulty: 1, type: 'standard', instructions: 'מעמידת שש, הורידו ישבן לאחור לעבר העקבים. מתחו ידיים קדימה ונשמו עמוק.', xpReward: 20, videoPlaceholder: 'מתיחת עכוז לעקבים', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-04', name: 'ברך יחידה לחזה', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 2, holdSeconds: 30, difficulty: 1, type: 'clinical', instructions: 'שכבו על הגב, רגל אחת ישרה. משכו את הברך השנייה אל החזה והחזיקו.', xpReward: 20, videoPlaceholder: 'ברך לחזה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-05', name: 'שתי ברכיים לחזה', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 2, holdSeconds: 30, difficulty: 1, type: 'clinical', instructions: 'שכבו על הגב. משכו את שתי הברכיים יחד אל החזה כדי לרווח את חוליות המותן.', xpReward: 20, videoPlaceholder: 'שתי ברכיים לחזה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-06', name: 'אקסטנציה בשכיבה (Cobra)', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 2, reps: 10, difficulty: 2, type: 'clinical', instructions: 'שכבו על הבטן. בעזרת הידיים דחפו והרימו רק את פלג הגוף העליון. האגן נשאר צמוד למזרן.', xpReward: 25, videoPlaceholder: 'אקסטנציה בשכיבה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-07', name: 'הטיית אגן צדית (Pelvic Hike)', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 2, reps: 15, difficulty: 1, type: 'clinical', instructions: 'שכבו על הגב עם רגליים ישרות. נסו "לקצר" רגל אחת על ידי משיכת האגן בצד זה לכיוון הצלעות.', xpReward: 20, videoPlaceholder: 'הטיית אגן צדית', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-08', name: 'מתיחת פריפורמיס בשכיבה', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 2, holdSeconds: 45, difficulty: 2, type: 'standard', instructions: 'שכבו על הגב. הניחו קרסול אחד על הברך השנייה (צורת 4) ומשכו את הירך אליכם.', xpReward: 25, videoPlaceholder: 'מתיחת פריפורמיס', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-09', name: 'כיפוף גב בישיבה', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 2, holdSeconds: 30, difficulty: 1, type: 'clinical', instructions: 'שבו על כיסא, פסקו רגליים. התכופפו קדימה והניחו לידיים ולראש להישמט בין הרגליים.', xpReward: 20, videoPlaceholder: 'כיפוף בישיבה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },

  // -- תנועתיות עצבית (Nerve Glides) --
  { id: 'lib-lb-10', name: 'החלקת עצב סכיאטי - Slump', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 2, reps: 12, difficulty: 2, type: 'clinical', instructions: 'שבו שפופים. יישרו ברך ובו זמנית הרימו ראש. כופפו ברך והורידו ראש חזרה. (תנועה רציפה).', xpReward: 30, videoPlaceholder: 'Slump Glide', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-11', name: 'החלקת עצב סכיאטי - בשכיבה', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 2, reps: 12, difficulty: 2, type: 'clinical', instructions: 'שכבו על הגב, אחזו ירך אחת ב-90 מעלות. יישרו את הברך ומשכו אצבעות רגל אליכם (פלקס), ושחררו.', xpReward: 30, videoPlaceholder: 'Supine Sciatic Glide', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },

  // -- שליטה מוטורית והפעלה ראשונית (Motor Control & Core Activation) --
  { id: 'lib-lb-12', name: 'הטיית אגן לאחור (Posterior Tilt)', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 3, reps: 15, difficulty: 1, type: 'standard', instructions: 'שכבו על הגב. אספו בטן התחתונה ולחצו את כל הגב התחתון למזרן. שחררו לאט.', xpReward: 20, videoPlaceholder: 'הטיית אגן לאחור', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-13', name: 'גיוס שריר ה-TrA', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, holdSeconds: 10, reps: 10, difficulty: 2, type: 'clinical', instructions: 'שכבו על הגב. "שאבו" את הפופיק בעדינות פנימה ולמעלה מבלי לעצור נשימה או להזיז את האגן.', xpReward: 25, videoPlaceholder: 'גיוס TrA', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-14', name: 'גשר אגן בסיסי', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 3, reps: 12, difficulty: 2, type: 'clinical', instructions: 'שכבו על הגב, ברכיים כפופות. כווצו ישבן והרימו אגן עד קו ישר מהברך לכתף.', xpReward: 30, videoPlaceholder: 'גשר אגן בסיסי', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-15', name: 'גשר אגן עם צעידה', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, reps: 10, difficulty: 3, type: 'clinical', instructions: 'בצעו גשר אגן. כשהאגן באוויר, נתקו רגל אחת מעט מהרצפה, הניחו והחליפו, מבלי שהאגן יצנח.', xpReward: 40, videoPlaceholder: 'גשר עם צעידה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-16', name: 'חרק מת - שלב 1 (רגליים)', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, reps: 12, difficulty: 2, type: 'clinical', instructions: 'שכבו על הגב, רגליים ב-90 באוויר. געו עם עקב אחד ברצפה והחזירו, הגב התחתון צמוד למזרן.', xpReward: 30, videoPlaceholder: 'חרק מת שלב 1', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-17', name: 'חרק מת - שלב 2 (מלא)', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, reps: 10, difficulty: 3, type: 'clinical', instructions: 'ידיים ורגליים באוויר. הורידו במקביל יד ורגל נגדית. אל תאפשרו לגב התחתון להתקשת.', xpReward: 40, videoPlaceholder: 'חרק מת שלב 2', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-18', name: 'ציפור-כלב - שלב 1', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, reps: 12, difficulty: 2, type: 'clinical', instructions: 'עמידת שש. החליקו והרימו רק רגל אחת בכל פעם לאחור, תוך שמירה על גב ישר לגמרי.', xpReward: 30, videoPlaceholder: 'ציפור כלב רגליים', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-19', name: 'ציפור-כלב - מלא (Bird-Dog)', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, reps: 10, difficulty: 3, type: 'clinical', instructions: 'עמידת שש. יישרו יד ורגל נגדית יחד. החזיקו 2 שניות והחליפו מבלי לסובב את האגן.', xpReward: 40, videoPlaceholder: 'ציפור כלב מלא', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-20', name: 'ייצוב אגן - צדפות (Clamshells)', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'שכבו על הצד, ברכיים כפופות יחד. פתחו את הברך העליונה כלפי מעלה מבלי לסובב את האגן לאחור.', xpReward: 30, videoPlaceholder: 'צדפות', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },

  // -- כוח מתקדם (Strength & Advanced Core) --
  { id: 'lib-lb-21', name: 'פלאנק על ברכיים', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, holdSeconds: 30, difficulty: 2, type: 'standard', instructions: 'הישענו על אמות הידיים והברכיים. כווצו בטן וישבן בקו אלכסוני ישר.', xpReward: 30, videoPlaceholder: 'פלאנק ברכיים', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-22', name: 'פלאנק מלא', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, holdSeconds: 30, difficulty: 4, type: 'standard', instructions: 'פלאנק על אמות וקצות האצבעות ברגליים. גוף ישר כמו קרש. למנוע קריסת אגן.', xpReward: 45, videoPlaceholder: 'פלאנק מלא', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-23', name: 'פלאנק צדי על ברכיים', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, holdSeconds: 20, difficulty: 3, type: 'clinical', instructions: 'שכבו על הצד על האמה, ברכיים כפופות. הרימו אגן עד קו ישר מהברך לראש.', xpReward: 35, videoPlaceholder: 'פלאנק צדי ברכיים', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-24', name: 'פלאנק צדי מלא', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, holdSeconds: 20, difficulty: 5, type: 'standard', instructions: 'הישענו על אמה וצד כף הרגל. הרימו אגן. שמרו על צוואר בהמשך לגוף.', xpReward: 50, videoPlaceholder: 'פלאנק צדי מלא', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-25', name: 'גשר אגן רגל אחת', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 3, reps: 10, difficulty: 4, type: 'clinical', instructions: 'שכבו על הגב, רגל אחת ישרה באוויר. בעזרת הרגל השנייה, דחפו והרימו את האגן.', xpReward: 45, videoPlaceholder: 'גשר רגל אחת', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-26', name: 'לחיצת פאלופ (Pallof Press)', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, reps: 12, difficulty: 4, type: 'clinical', instructions: 'עמדו לצד גומייה קשורה. משכו אותה לחזה, ויישרו ידיים קדימה. התנגדו למשיכה הצידה.', xpReward: 40, videoPlaceholder: 'לחיצת פאלופ', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-27', name: 'שחייה יבשה (Superman)', muscleGroup: 'גב תחתון', targetArea: 'back_lower', sets: 3, reps: 12, difficulty: 3, type: 'clinical', instructions: 'שכבו על הבטן. הרימו בו זמנית יד ורגל נגדית (או את כל הגפיים יחד) והורידו.', xpReward: 35, videoPlaceholder: 'סופרמן', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-28', name: 'הליכת איכר (משקולת אחת)', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, holdSeconds: 40, difficulty: 4, type: 'standard', instructions: 'החזיקו משקולת/בקבוק מים ביד אחת בלבד ולכו זקוף. אל תתנו למשקל למשוך אתכם הצידה.', xpReward: 45, videoPlaceholder: 'הליכת איכר צד 1', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-29', name: 'קראנצ\' מותאם (McGill Curl-up)', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, reps: 10, difficulty: 2, type: 'clinical', instructions: 'שכבו על הגב, רגל אחת כפופה, ידיים מתחת לגב התחתון. הרימו ראש וכתפיים כיחידה אחת רק מעט מהרצפה.', xpReward: 30, videoPlaceholder: 'קראנץ מותאם', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-lb-30', name: 'רוטציה נגד התנגדות (Woodchop)', muscleGroup: 'ליבה', targetArea: 'back_lower', sets: 3, reps: 12, difficulty: 4, type: 'standard', instructions: 'בעזרת גומייה המקובעת גבוה, משכו אותה באלכסון כלפי מטה אל הברך הנגדית תוך סיבוב מבוקר של הגו.', xpReward: 45, videoPlaceholder: 'Woodchop', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
 // ---------------------------------------------------------
  // === ברכיים (30 תרגילים: ROM, Strength, NM Control, Proprioception) ===
  // ---------------------------------------------------------

  // -- טווחים, גמישות והפעלה ראשונית (ROM & Early Activation) --
  { id: 'lib-kn-01', name: 'החלקת עקב (Heel Slides)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 15, difficulty: 1, type: 'clinical', instructions: 'שכבו על הגב. החליקו את העקב לכיוון הישבן עד לתחושת מתיחה קלה, ויישרו חזרה מבוקר.', xpReward: 20, videoPlaceholder: 'החלקת עקב', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-02', name: 'החלקת עקב בעזרת מגבת', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, holdSeconds: 10, reps: 5, difficulty: 2, type: 'clinical', instructions: 'שכבו על הגב. הניחו מגבת סביב כף הרגל ובעזרת הידיים משכו את העקב לישבן להגדלת טווח הכיפוף.', xpReward: 25, videoPlaceholder: 'החלקת עקב עם מגבת', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-03', name: 'יישור פסיבי בשכיבה (Prone Hang)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 2, holdSeconds: 60, difficulty: 1, type: 'clinical', instructions: 'שכבו על הבטן בקצה המיטה כך שהברכיים מחוץ למיטה באוויר. תנו לכוח המשיכה ליישר את הברך אט אט.', xpReward: 20, videoPlaceholder: 'Prone Hang', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-04', name: 'מתיחת ארבע ראשי עמידה', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 2, holdSeconds: 30, difficulty: 2, type: 'standard', instructions: 'עמדו בתמיכת קיר. תפסו את הקרסול מאחור ומשכו את העקב לישבן עד למתיחה בקדמת הירך.', xpReward: 20, videoPlaceholder: 'מתיחת ארבע ראשי', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-05', name: 'כיווץ סטטי ארבע-ראשי (Quad Sets)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, holdSeconds: 5, reps: 15, difficulty: 1, type: 'clinical', instructions: 'שבו בשיכול רגליים או שכיבה. לחצו את גב הברך חזק אל המזרן על ידי כיווץ הירך הקדמית. שחררו לאט.', xpReward: 25, videoPlaceholder: 'לחיצת ברך', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-06', name: 'כיווץ המסטרינגס סטטי', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, holdSeconds: 5, reps: 15, difficulty: 1, type: 'clinical', instructions: 'שבו כשהברך כפופה מעט. לחצו את העקב חזק לתוך הרצפה מבלי להזיז את הרגל, כדי לכווץ את הירך האחורית.', xpReward: 25, videoPlaceholder: 'כיווץ המסטרינגס סטטי', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  
  // -- חיזוק שרשרת קינמטית פתוחה (Open Kinetic Chain) --
  { id: 'lib-kn-07', name: 'יישור ברך מקוצר (SAQ)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'שימו מגבת מגולגלת תחת הברך. הרימו רק את העקב באוויר עד ליישור מלא של הברך, החזיקו שנייה והורידו.', xpReward: 30, videoPlaceholder: 'SAQ', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-08', name: 'יישור ברך מלא בישיבה (LAQ)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 12, difficulty: 2, type: 'standard', instructions: 'שבו על כיסא. הרימו את כף הרגל ויישרו את הברך במלואה מול כוח המשיכה. ירידה איטית.', xpReward: 30, videoPlaceholder: 'LAQ', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-09', name: 'הרמת רגל ישרה לפנים (SLR)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 12, difficulty: 2, type: 'clinical', instructions: 'שכבו על הגב. רגל אחת כפופה. נעלו את הברך השנייה והרימו את הרגל ישרה עד גובה הברך הכפופה.', xpReward: 35, videoPlaceholder: 'SLR', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-10', name: 'הרמת רגל ישרה הצידה (SLR Abd)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 12, difficulty: 2, type: 'clinical', instructions: 'שכבו על הצד הבריא. הרימו את הרגל העליונה (הפגועה) ישרה כלפי מעלה לאחור קלות. ירידה מבוקרת.', xpReward: 35, videoPlaceholder: 'SLR אבדוקציה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-11', name: 'הרמת רגל ישרה לאחור (SLR Ext)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'שכבו על הבטן. הרימו את הרגל ישרה באוויר בעזרת שרירי הישבן והירך האחורית מבלי להקשית את הגב.', xpReward: 35, videoPlaceholder: 'SLR אקסטנציה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-12', name: 'כיפוף ברך בשכיבה', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 15, difficulty: 2, type: 'standard', instructions: 'שכבו על הבטן. כופפו את הברך והביאו את העקב לכיוון הישבן נגד כוח המשיכה. הורידו לאט.', xpReward: 30, videoPlaceholder: 'כיפוף ברך בטן', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-13', name: 'כיפוף ברך בעמידה', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 15, difficulty: 2, type: 'standard', instructions: 'עמדו זקוף בתמיכת כיסא. כופפו ברך אחת לאחור (עקב לישבן) תוך שמירה על ירכיים מקבילות.', xpReward: 30, videoPlaceholder: 'כיפוף ברך עמידה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },

  // -- חיזוק שרשרת קינמטית סגורה ונשיאת משקל (Closed Kinetic Chain) --
  { id: 'lib-kn-14', name: 'יישור ברך בעמידה (TKE)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'קשרו גומייה מאחורי הברך ולעמוד. כופפו מעט את הברך ויישרו אותה חזק כנגד התנגדות הגומייה (נעילת ברך).', xpReward: 35, videoPlaceholder: 'TKE', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-15', name: 'קימה מכיסא (Sit to Stand)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 12, difficulty: 2, type: 'standard', instructions: 'שבו על כיסא. קומו לעמידה בעזרת שתי הרגליים (שליטה שווה) ושבו חזרה לאט מבלי "ליפול" לכיסא.', xpReward: 35, videoPlaceholder: 'קימה מכיסא', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-16', name: 'מיני סקווט (כריעה 45°)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 15, difficulty: 3, type: 'clinical', instructions: 'עמידת מוצא. כופפו ברכיים רק עד 45°. וודאו שהברכיים מופנות לאצבעות השנייה-שלישית ולא קורסות פנימה.', xpReward: 40, videoPlaceholder: 'מיני סקווט', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-17', name: 'סקווט מלא', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 12, difficulty: 4, type: 'standard', instructions: 'סקווט רגיל עד 90 מעלות. משקל על העקבים, חזה מורם וברכיים בקו האצבעות.', xpReward: 45, videoPlaceholder: 'סקווט מלא', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-18', name: 'ישיבת קיר סטטית (Wall Sit)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, holdSeconds: 30, difficulty: 3, type: 'clinical', instructions: 'הישענו על הקיר ורדו לזווית של 60-90 מעלות. שמרו על הגב צמוד והחזיקו את התנוחה סטטית (איזומטרי).', xpReward: 40, videoPlaceholder: 'ישיבת קיר', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-19', name: 'עלייה על מדרגה קדמית (Step Up)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 12, difficulty: 4, type: 'clinical', instructions: 'עמדו מול מדרגה. עלו עם הרגל הפגועה תוך דחיפה חזקה. ירדו לאט עם שליטה על הברך.', xpReward: 45, videoPlaceholder: 'עלייה קדמית למדרגה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-20', name: 'עלייה מדרגה צדית (Lateral Step Up)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 12, difficulty: 4, type: 'clinical', instructions: 'עמדו לצד מדרגה. עלו הצידה עם הרגל הקרובה למדרגה. מקדו את העבודה בישבן הצדי ובארבע הראשי.', xpReward: 45, videoPlaceholder: 'עלייה צדית', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-21', name: 'ירידה ממדרגה (Eccentric Step Down)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 10, difficulty: 5, type: 'clinical', instructions: 'עמדו על מדרגה. הורידו אט אט את העקב של הרגל הבריאה לרצפה על ידי כיפוף איטי ומבוקר של הרגל הפגועה.', xpReward: 50, videoPlaceholder: 'ירידה אקסנטרית ממדרגה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-22', name: 'מכרע קדמי (Lunge)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 10, difficulty: 4, type: 'standard', instructions: 'קחו צעד גדול קדימה. כופפו את שתי הברכיים ל-90 מעלות (האחורית כמעט נוגעת ברצפה) ודחפו חזרה.', xpReward: 45, videoPlaceholder: 'לאנג קדמי', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-23', name: 'מכרע אחורי (Reverse Lunge)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 10, difficulty: 4, type: 'clinical', instructions: 'צעדו לאחור עם רגל אחת ורדו למכרע. מצוין להפחתת לחץ על הפיקה בהשוואה למכרע קדמי.', xpReward: 45, videoPlaceholder: 'לאנג אחורי', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  
  // -- שליטה עצבית שרירית ופרופריוספציה (NM Control & Proprioception) --
  { id: 'lib-kn-24', name: 'עמידה על רגל אחת', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, holdSeconds: 30, difficulty: 3, type: 'clinical', instructions: 'עמדו על הרגל הפגועה בלבד (הברך לא נעולה לגמרי, מעט משוחררת). שמרו על יציבות האגן.', xpReward: 35, videoPlaceholder: 'עמידה רגל אחת', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-25', name: 'עמידה על רגל אחת - עיניים עצומות', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, holdSeconds: 20, difficulty: 4, type: 'clinical', instructions: 'עמדו על הרגל הפגועה ועיצמו עיניים. עמדו בפינת חדר או סמוך לכיסא לבטיחות למקרה של איבוד שיווי משקל.', xpReward: 45, videoPlaceholder: 'רגל אחת עיניים עצומות', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-26', name: 'דדליפט רגל אחת (Arabesque)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 10, difficulty: 4, type: 'clinical', instructions: 'עמדו על הרגל הפגועה. התכופפו קדימה מהאגן תוך הרמת הרגל האחורית ישרה. שמרו על גב ישר לגמרי.', xpReward: 45, videoPlaceholder: 'דדליפט רגל אחת', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-27', name: 'הושטת רגל כוכב (Star / Y-Balance)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 5, difficulty: 5, type: 'clinical', instructions: 'עמדו על הרגל הפגועה. הושיטו את הרגל השנייה רחוק קדימה, הצידה, ולאחור באלכסון. אל תניחו משקל על הרגל המושטת.', xpReward: 50, videoPlaceholder: 'Y-Balance', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-28', name: 'נחיתה מקפיצה (Drop Landing)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 8, difficulty: 5, type: 'clinical', instructions: 'רדו ממדרגה קטנה (לא קפיצה!) ונחתו רך על שתי רגליים. המטרה: כיפוף ברכיים וספיגת זעזוע ללא קריסת ברך פנימה.', xpReward: 50, videoPlaceholder: 'נחיתה ממדרגה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-29', name: 'קפיצות קלות במקום (Pogo Hops)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, holdSeconds: 20, difficulty: 4, type: 'standard', instructions: 'קפיצות קלות ומהירות על שתי רגליים במקום. העבודה בעיקר מהקרסוליים עם ברכיים "רכות".', xpReward: 45, videoPlaceholder: 'Pogo Hops', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-kn-30', name: 'קפיצות צד (Skater Jumps)', muscleGroup: 'ברך', targetArea: 'knee_right', sets: 3, reps: 16, difficulty: 5, type: 'standard', instructions: 'קפצו מצד לצד (מרגל לרגל), ונחתו בצורה מבוקרת ויציבה על הרגל הקולטת. שמרו על שיווי משקל לשנייה לפני הקפיצה הבאה.', xpReward: 50, videoPlaceholder: 'קפיצות צד החלקה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  // ---------------------------------------------------------
  // === ירך וישבן (30 תרגילים: Mobility, Strength, Motor Control) ===
  // ---------------------------------------------------------

  // -- טווחים, גמישות והפעלה ראשונית (Mobility, ROM & Activation) --
  { id: 'lib-hp-01', name: 'מתיחת מכופפי ירך (Kneeling Hip Flexor)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 2, holdSeconds: 45, difficulty: 2, type: 'clinical', instructions: 'עמדו בעמידת פסיעה (ברך אחת על הרצפה). קחו את האגן מעט קדימה תוך כיווץ הישבן עד לתחושת מתיחה בקדמת הירך התחתונה.', xpReward: 25, videoPlaceholder: 'מתיחת מכופפי ירך', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-02', name: 'מתיחת פרפר (מפשעה)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 2, holdSeconds: 45, difficulty: 1, type: 'standard', instructions: 'שבו עם גב זקוף, הצמידו כפות רגליים זו לזו. בעזרת המרפקים, דחפו בעדינות את הברכיים לכיוון הרצפה.', xpReward: 20, videoPlaceholder: 'מתיחת פרפר', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-03', name: 'מתיחת פריפורמיס (צורת 4)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 2, holdSeconds: 45, difficulty: 2, type: 'standard', instructions: 'שכבו על הגב. הניחו קרסול של הרגל הפגועה על הברך השנייה. משכו את הירך הבריאה לכיוון החזה.', xpReward: 25, videoPlaceholder: 'מתיחת פריפורמיס', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-04', name: 'ישיבת 90/90 (רוטציות ירך)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 2, reps: 10, difficulty: 3, type: 'clinical', instructions: 'שבו על הרצפה כששתי הברכיים כפופות ל-90 מעלות ומונחות על הרצפה (אחת קדימה, אחת הצידה). הישענו קדימה ואז החליפו צדדים.', xpReward: 30, videoPlaceholder: 'ישיבת 90/90', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-05', name: 'הרחקת ירך אקטיבית בשכיבה', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 15, difficulty: 1, type: 'clinical', instructions: 'שכבו על הגב, רגליים ישרות. החליקו רגל אחת הצידה (הרחקה) והחזירו לאמצע, ללא סיבוב של האגן.', xpReward: 20, videoPlaceholder: 'הרחקת ירך שכיבה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-06', name: 'כיווץ ישבן סטטי (Glute Sets)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, holdSeconds: 5, reps: 15, difficulty: 1, type: 'clinical', instructions: 'שכבו על הגב או הבטן. כווצו את שרירי הישבן חזק ככל האפשר, החזיקו 5 שניות ושחררו.', xpReward: 20, videoPlaceholder: 'כיווץ ישבן', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-07', name: 'לחיצת כדור בין הברכיים (Adductor Squeeze)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, holdSeconds: 5, reps: 15, difficulty: 1, type: 'clinical', instructions: 'שכבו על הגב, ברכיים כפופות. הניחו כדור קטן או כרית בין הברכיים ולחצו פנימה (קירוב ירכיים).', xpReward: 25, videoPlaceholder: 'לחיצת מקרבים', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  
  // -- חיזוק מבודד - שרשרת פתוחה (Isolated Strengthening - OKC) --
  { id: 'lib-hp-08', name: 'צדפות (Clamshells)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'שכבו על הצד, ברכיים כפופות. פתחו את הברך העליונה (כמו צדפה) מבלי לקחת את האגן לאחור. הירידה איטית.', xpReward: 30, videoPlaceholder: 'צדפות', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-09', name: 'צדפות הפוכות (Reverse Clamshells)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'שכבו על הצד, ברכיים כפופות. השאירו ברכיים צמודות והרימו רק את כף הרגל העליונה לתקרה (רוטציה פנימית).', xpReward: 30, videoPlaceholder: 'צדפות הפוכות', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-10', name: 'הרמת רגל ישרה הצידה (SLR Abduction)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'שכבו על הצד, הרגל העליונה ישרה. הרימו אותה מעלה ומעט לאחור (לכיוון העקב). הימנעו מלפנות עם האצבעות לתקרה.', xpReward: 35, videoPlaceholder: 'SLR הצידה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-11', name: 'הרמת רגל פנימה (SLR Adduction)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'שכבו על הצד. הניחו את הרגל העליונה כפופה מלפנים, והרימו את הרגל התחתונה ישרה כלפי מעלה.', xpReward: 30, videoPlaceholder: 'SLR מקרבים', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-12', name: 'פשיטת ירך בשכיבה על הבטן', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'שכבו על הבטן. כווצו ישבן והרימו רגל ישרה באוויר. אל תתנו לגב התחתון להתקשת יתר על המידה.', xpReward: 30, videoPlaceholder: 'פשיטת ירך שכיבה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-13', name: 'הרחקת ירך בעמידת שש (Fire Hydrants)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'עמידת שש. הרימו ברך אחת הצידה החוצה תוך שמירה על זווית 90 מעלות. אגן מקביל לרצפה.', xpReward: 35, videoPlaceholder: 'Fire Hydrant', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-14', name: 'בעיטת חמור (Donkey Kicks)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'עמידת שש. דחפו עקב אחד כלפי התקרה (פשיטת ירך) מבלי להקשית את הגב התחתון. כווצו ישבן בשיא התנועה.', xpReward: 35, videoPlaceholder: 'בעיטת חמור', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-15', name: 'הרחקת ירך בעמידה עם גומייה', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 12, difficulty: 3, type: 'clinical', instructions: 'קשרו גומייה סביב הקרסוליים. עמדו זקוף והרחיקו רגל אחת הצידה מבלי להישען עם הגוף לכיוון הנגדי.', xpReward: 40, videoPlaceholder: 'הרחקה בעמידה גומייה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-16', name: 'פשיטת ירך בעמידה עם גומייה', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 12, difficulty: 3, type: 'clinical', instructions: 'גומייה סביב הקרסוליים. משכו רגל אחת ישרה לאחור בעזרת הישבן בלבד. שמרו על בטן אסופה למניעת הקשתת גב.', xpReward: 40, videoPlaceholder: 'פשיטה בעמידה גומייה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-17', name: 'כפיפת ירך בעמידה עם גומייה', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 12, difficulty: 3, type: 'standard', instructions: 'גומייה סביב הקרסוליים (אפשר לקבע לקיר). הרימו את הברך הפגועה מעלה לפנים עד זווית 90 מעלות.', xpReward: 40, videoPlaceholder: 'כפיפת ירך בעמידה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },

  // -- חיזוק שרשרת סגורה ותפקוד (Functional & CKC) --
  { id: 'lib-hp-18', name: 'גשר אגן עם רצועת התנגדות', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 15, difficulty: 3, type: 'clinical', instructions: 'שכבו על הגב, גומייה מעל הברכיים. בצעו גשר אגן רגיל, ובשיא הגובה דחפו את הברכיים החוצה כנגד הגומייה.', xpReward: 40, videoPlaceholder: 'גשר אגן גומייה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-19', name: 'דחיפת אגן (Hip Thrust)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 12, difficulty: 4, type: 'standard', instructions: 'הישענו עם השכמות על ספסל/ספה, רגליים על הרצפה. הורידו אגן ודחפו חזק למעלה בעזרת הישבן עד קו ישר.', xpReward: 45, videoPlaceholder: 'היפ טראסט', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-20', name: 'הליכת סרטן צדדית (Lateral Band Walks)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 15, difficulty: 3, type: 'clinical', instructions: 'גומייה מעל הברכיים או קרסוליים. רדו לחצי סקווט (Athletic stance). צעדו הצידה בצעדים קטנים ללא "קפיצות".', xpReward: 40, videoPlaceholder: 'הליכת סרטן', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-21', name: 'הליכת מפלצת (Monster Walks)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 15, difficulty: 3, type: 'clinical', instructions: 'גומייה סביב הקרסוליים. צעדו קדימה ואחורה בצעדים רחבים באלכסון (כמו מפלצת) תוך שמירה על ברכיים החוצה.', xpReward: 40, videoPlaceholder: 'הליכת מפלצת', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-22', name: 'ציר ירך (Hip Hinge / RDL)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 12, difficulty: 3, type: 'clinical', instructions: 'עמדו עם מקל על הגב (ראש, שכמות, אגן צמודים). דחפו ישבן רחוק לאחור עם כיפוף קל בברכיים. קומו חזרה מדחיפת אגן.', xpReward: 40, videoPlaceholder: 'היפ הינג', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-23', name: 'דדליפט רגל אחת (Single Leg RDL)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 10, difficulty: 4, type: 'clinical', instructions: 'עמדו על רגל אחת. בצעו ציר ירך: הטו את הגו קדימה והרימו את הרגל האחורית ישרה באוויר. אגן נשאר מקביל לרצפה.', xpReward: 45, videoPlaceholder: 'RDL רגל אחת', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-24', name: 'מכרע צדי (Lateral Lunge)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 12, difficulty: 4, type: 'standard', instructions: 'קחו צעד רחב הצידה. כופפו את הברך הפוסעת ודחפו ישבן לאחור (הרגל השנייה נשארת ישרה). דחפו חזרה למרכז.', xpReward: 45, videoPlaceholder: 'לאנג צדי', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-25', name: 'מכרע לאחור (Reverse Lunge)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 12, difficulty: 4, type: 'clinical', instructions: 'צעדו צעד גדול לאחור ורדו למכרע (זווית 90 מעלות בברכיים). הדחיפה חזרה למעלה מתבצעת מהרגל הקדמית ומהישבן.', xpReward: 45, videoPlaceholder: 'לאנג אחורי', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-26', name: 'צניחת אגן (Pelvic Drops)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 15, difficulty: 4, type: 'clinical', instructions: 'עמדו על מדרגה כשרגל אחת תלויה באוויר. הורידו את האגן התלוי למטה (בלי לכופף את הברך העומדת), והרימו חזרה בעזרת הישבן של הרגל העומדת.', xpReward: 45, videoPlaceholder: 'צניחת אגן על מדרגה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-27', name: 'עלייה גבוהה למדרגה (High Step Up)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 10, difficulty: 4, type: 'standard', instructions: 'השתמשו במדרגה גבוהה מהרגיל. עלו בעזרת הרגל הפגועה תוך הטיית גו קלה קדימה להפעלת מקסימלית של הישבן.', xpReward: 50, videoPlaceholder: 'עלייה גבוהה למדרגה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },

  // -- פרופריוספציה ושליטה מתקדמת (Advanced NM Control) --
  { id: 'lib-hp-28', name: 'פסיעות רוחב מורחבות (Crossover Steps)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 12, difficulty: 4, type: 'standard', instructions: 'הליכה צדדית שבה רגל אחת מצליבה מלפנים (קרוס-אובר) או מאחור לרגל העומדת. עבודה מצוינת על פיתול ושליטה באגן.', xpReward: 45, videoPlaceholder: 'Crossover Steps', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-29', name: 'הושטת רגל (Y-Balance)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 6, difficulty: 5, type: 'clinical', instructions: 'עמדו על רגל אחת. בעזרת הרגל השנייה, נסו לגעת ברצפה רחוק ככל האפשר: קדימה, באלכסון אחורה-ימינה, ובאלכסון אחורה-שמאלה.', xpReward: 50, videoPlaceholder: 'Y-Balance ירך', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-hp-30', name: 'קפיצות למרחק על רגל אחת (Single Leg Broad Jump)', muscleGroup: 'ירך', targetArea: 'hip_right', sets: 3, reps: 8, difficulty: 5, type: 'standard', instructions: 'קפצו למרחק על הרגל הפגועה, ונסו לנחות נחיתה "רכה" ויציבה. הישאר במצב נחיתה לשנייה מלאה לפני הקפיצה הבאה.', xpReward: 50, videoPlaceholder: 'קפיצה רגל אחת למרחק', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
 // ---------------------------------------------------------
  // === כתף ושכמות (30 תרגילים: ROM, Rotator Cuff, Scapular Control) ===
  // ---------------------------------------------------------

  // -- טווחים ותנועתיות פסיבית/אקטיבית-נעזרת (ROM & AAROM) --
  { id: 'lib-sh-01', name: 'פנדולום (מטוטלת)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, holdSeconds: 30, difficulty: 1, type: 'clinical', instructions: 'הישענו קדימה בתמיכת היד הבריאה. תנו לזרוע הפגועה להיות תלויה ורפויה לחלוטין. ציירו מעגלים קטנים מהאגן.', xpReward: 20, videoPlaceholder: 'פנדולום', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-02', name: 'החלקת קיר עם מגבת (Wall Slide)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 10, difficulty: 1, type: 'clinical', instructions: 'עמדו מול קיר עם מגבת קטנה תחת כף היד. החליקו את היד מעלה לאורך הקיר עד למתיחה, והחליקו חזרה למטה.', xpReward: 25, videoPlaceholder: 'החלקת קיר', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-03', name: 'כפיפת כתף בשכיבה עם מקל', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 2, reps: 15, difficulty: 1, type: 'clinical', instructions: 'שכבו על הגב. אחזו מקל מטאטא בשתי ידיים. בעזרת היד הבריאה, דחפו את המקל לאחור מעל הראש.', xpReward: 20, videoPlaceholder: 'מקל כפיפה שכיבה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-04', name: 'סיבוב חיצוני עם מקל (External Rotation)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 2, reps: 15, difficulty: 1, type: 'clinical', instructions: 'שכבו על הגב, מרפק צמוד לגוף ב-90°. בעזרת המקל והיד הבריאה, דחפו את כף היד הפגועה החוצה.', xpReward: 20, videoPlaceholder: 'מקל סיבוב חיצוני', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-05', name: 'מתיחת קפסולה אחורית (Cross Body)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 2, holdSeconds: 30, difficulty: 1, type: 'standard', instructions: 'הביאו את הזרוע הפגועה אופקית מעבר לחזה. בעזרת היד השנייה, משכו אותה בעדינות אליכם.', xpReward: 20, videoPlaceholder: 'מתיחת כתף אחורית', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-06', name: 'מתיחת שרוול (Sleeper Stretch)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 2, holdSeconds: 30, difficulty: 2, type: 'clinical', instructions: 'שכבו על הצד הפגוע, מרפק ב-90° מול החזה. בעזרת היד הבריאה, דחפו את כף היד בעדינות כלפי המזרן (סיבוב פנימי).', xpReward: 25, videoPlaceholder: 'סליפר סטרץ', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-07', name: 'מתיחת חזה בפינה (Pec Stretch)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 2, holdSeconds: 30, difficulty: 1, type: 'standard', instructions: 'עמדו בפינת חדר, הניחו אמות על הקירות (מרפקים ב-90°). הישענו בעדינות קדימה עם החזה.', xpReward: 20, videoPlaceholder: 'מתיחת חזה בפינה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-08', name: 'ספר פתוח (Open Book)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 2, reps: 10, difficulty: 2, type: 'clinical', instructions: 'שכבו על הצד, ידיים מושטות קדימה. פתחו את היד העליונה לאחור (כמו פתיחת דף בספר) ועקבו אחריה עם המבט.', xpReward: 25, videoPlaceholder: 'ספר פתוח', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },

  // -- חיזוק איזומטרי התחלתי (Isometrics) --
  { id: 'lib-sh-09', name: 'איזומטרי: סיבוב חיצוני (ER) קיר', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, holdSeconds: 5, reps: 10, difficulty: 1, type: 'clinical', instructions: 'עמדו לצד קיר. מרפק ב-90°. לחצו את גב כף היד אל הקיר החוצה חזק, מבלי להזיז את הגוף.', xpReward: 20, videoPlaceholder: 'איזומטרי סיבוב חיצוני', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-10', name: 'איזומטרי: סיבוב פנימי (IR) קיר', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, holdSeconds: 5, reps: 10, difficulty: 1, type: 'clinical', instructions: 'עמדו מול פינה או משקוף. מרפק ב-90°. לחצו את כף היד פנימה אל הקיר ככל האפשר.', xpReward: 20, videoPlaceholder: 'איזומטרי סיבוב פנימי', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-11', name: 'איזומטרי: כפיפה (Flexion) קיר', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, holdSeconds: 5, reps: 10, difficulty: 1, type: 'clinical', instructions: 'עמדו פנים אל הקיר. אגרוף קפוץ מול הקיר (מרפק ב-90°). דחפו את האגרוף קדימה אל הקיר.', xpReward: 20, videoPlaceholder: 'איזומטרי כפיפה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-12', name: 'איזומטרי: הרחקה (Abduction) קיר', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, holdSeconds: 5, reps: 10, difficulty: 1, type: 'clinical', instructions: 'עמדו לצד הקיר. דחפו את המרפק אל הקיר הצידה (כאילו מנסים להרים את היד באוויר).', xpReward: 20, videoPlaceholder: 'איזומטרי הרחקה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },

  // -- מייצבים וRotator Cuff (Scapular & RTC Strengthening) --
  { id: 'lib-sh-13', name: 'קירוב שכמות (Scapular Retraction)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 15, difficulty: 1, type: 'clinical', instructions: 'בישיבה או עמידה. משכו את הכתפיים לאחור וקרבו שכמות זו לזו ("צבוט עיפרון בין השכמות").', xpReward: 25, videoPlaceholder: 'קירוב שכמות', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-14', name: 'סיבוב חיצוני עם גומייה (ER)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'גומייה מקובעת לקיר בגובה המותן. מרפק ב-90° צמוד לגוף (אפשר מגבת בבית השחי). סובבו את האמה החוצה נגד ההתנגדות.', xpReward: 30, videoPlaceholder: 'סיבוב חיצוני גומייה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-15', name: 'סיבוב פנימי עם גומייה (IR)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'קבעו גומייה לקיר בגובה המותן. מרפק צמוד ב-90°. משכו את האמה פנימה לכיוון הבטן.', xpReward: 30, videoPlaceholder: 'סיבוב פנימי גומייה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-16', name: 'סיבוב חיצוני בשכיבה (Side-lying ER)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 12, difficulty: 2, type: 'clinical', instructions: 'שכבו על הצד הבריא (יד פגועה למעלה). מרפק צמוד ב-90°. הרימו משקולת קלה/בקבוק כלפי מעלה מבלי לנתק מרפק.', xpReward: 30, videoPlaceholder: 'ER שכיבה על הצד', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-17', name: 'משיכת גומייה לאחור (Rows)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 15, difficulty: 2, type: 'standard', instructions: 'אחזו בגומייה המקובעת מולכם. משכו את המרפקים לאחור תוך קירוב חזק של השכמות בסוף התנועה.', xpReward: 30, videoPlaceholder: 'חתירה עם גומייה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-18', name: 'הרמה בצורת Y בשכיבה', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 10, difficulty: 3, type: 'clinical', instructions: 'שכבו על הבטן. הרימו את הידיים באלכסון קדימה (צורת Y), אגודלים מופנים לתקרה. כווצו שכמות תחתונה.', xpReward: 35, videoPlaceholder: 'Prone Y', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-19', name: 'הרמה בצורת T בשכיבה', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 10, difficulty: 3, type: 'clinical', instructions: 'שכבו על הבטן. הושיטו ידיים הצידה בקו הכתפיים (צורת T), אגודלים לתקרה. הרימו ידיים דרך קירוב שכמות.', xpReward: 35, videoPlaceholder: 'Prone T', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-20', name: 'פשיטת כתף בשכיבה', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'שכבו על הבטן, ידיים צמודות לצידי הגוף. הרימו את הידיים הישרות כלפי מעלה (לתקרה) והורידו לאט.', xpReward: 30, videoPlaceholder: 'Prone Extension', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-21', name: 'שכיבות סמיכה קיר + (Push up Plus)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 12, difficulty: 2, type: 'clinical', instructions: 'בצעו שכיבת סמיכה מול קיר. בסיום הדחיפה, דחפו עוד קצת כך שהשכמות יתרחקו זו מזו (הפעלת סראטוס).', xpReward: 35, videoPlaceholder: 'פוש אפ פלוס קיר', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },

  // -- חיזוק כללי ותפקוד מתקדם (Advanced Strength & Function) --
  { id: 'lib-sh-22', name: 'הרמה במישור השכמה (Scaption)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 12, difficulty: 3, type: 'clinical', instructions: 'אחזו משקולות קלות. הרימו ידיים ישרות לא קדימה ולא הצידה, אלא ב-30 מעלות קדימה (מישור השכמה) עד גובה הכתף.', xpReward: 40, videoPlaceholder: 'סקאפשן', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-23', name: 'הרמה קדמית (Front Raise)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 12, difficulty: 2, type: 'standard', instructions: 'אחזו משקולות. הרימו את הידיים ישרות קדימה עד גובה הכתפיים והורידו לאט.', xpReward: 30, videoPlaceholder: 'הרמה קדמית משקולת', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-24', name: 'הרמה צדית (Lateral Raise)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 12, difficulty: 3, type: 'standard', instructions: 'אחזו משקולות. הרימו ידיים הצידה (עם כיפוף קל جدا במרפק) עד גובה הכתפיים. אין לעבור גובה כתף בשיקום אקוטי.', xpReward: 35, videoPlaceholder: 'הרמה צדית משקולת', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-25', name: 'לחיצת כתף (Overhead Press)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 10, difficulty: 4, type: 'standard', instructions: 'אחזו משקולות בגובה הכתפיים. דחפו אותן מעלה מעל הראש עד ליישור מלא והורידו מבוקר.', xpReward: 45, videoPlaceholder: 'לחיצת כתף מעל הראש', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-26', name: 'חיבוק דינמי עם גומייה (Dynamic Hug)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 15, difficulty: 3, type: 'clinical', instructions: 'העבירו גומייה מאחורי הגב ואחזו בקצוות. בצעו תנועת חיבוק גדולה קדימה. מצוין לסראטוס אנטריור.', xpReward: 40, videoPlaceholder: 'חיבוק דינמי', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-27', name: 'אלכסוני PNF עם גומייה (D2 Flexion)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 10, difficulty: 4, type: 'clinical', instructions: 'גומייה למטה בצד הנגדי. שלפו חרב: משכו אלכסון למעלה והחוצה, תוך סיבוב היד כך שהאגודל למעלה.', xpReward: 45, videoPlaceholder: 'PNF D2', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  
  // -- פרופריוספציה ונשיאת משקל (Proprioception & Weight Bearing) --
  { id: 'lib-sh-28', name: 'ייצוב קצבי עם כדור קיר', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, holdSeconds: 30, difficulty: 4, type: 'clinical', instructions: 'החזיקו כדור מול הקיר ביד אחת (מרפק כמעט ישר). ציירו איתו מעגלים קטנים או אותיות על הקיר.', xpReward: 40, videoPlaceholder: 'כדור על קיר', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-29', name: 'הליכת דוב (Bear Crawl)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 10, difficulty: 5, type: 'clinical', instructions: 'עמידת שש כשהברכיים מעט באוויר. צעדו קדימה ואחורה. דורש נשיאת משקל וייצוב כתף מעולה.', xpReward: 50, videoPlaceholder: 'הליכת דוב', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-sh-30', name: 'פלאנק עם נגיעות כתף (Shoulder Taps)', muscleGroup: 'כתף', targetArea: 'shoulder_right', sets: 3, reps: 16, difficulty: 5, type: 'standard', instructions: 'עמדו בפלאנק גבוה (על כפות הידיים). העבירו משקל ליד אחת וגעו עם היד השנייה בכתף הנגדית. החליפו.', xpReward: 50, videoPlaceholder: 'נגיעות כתף', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  // ---------------------------------------------------------
  // === קרסול וכף רגל (30 תרגילים: ROM, Strength, Proprioception) ===
  // ---------------------------------------------------------

  // -- טווחים, גמישות והורדת נפיחות (ROM & Mobility) --
  { id: 'lib-ak-01', name: 'משאבות קרסול (Ankle Pumps)', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, reps: 20, difficulty: 1, type: 'clinical', instructions: 'שכבו או שבו. הניעו את כף הרגל למעלה (פלקס) ולמטה (פוינט) בקצב אחיד. מצוין להורדת נפיחות.', xpReward: 20, videoPlaceholder: 'משאבות קרסול', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-02', name: 'מעגלי קרסול', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 2, reps: 15, difficulty: 1, type: 'clinical', instructions: 'סובבו את הקרסול בתנועות מעגליות גדולות ואיטיות. 15 פעמים עם כיוון השעון, ו-15 נגד הכיוון.', xpReward: 15, videoPlaceholder: 'מעגלי קרסול', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-03', name: 'כתיבת אלפבית עם הקרסול', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 2, reps: 1, difficulty: 1, type: 'clinical', instructions: 'ציירו באוויר את אותיות הא"ב בעזרת הבוהן הגדולה. התנועה מגיעה רק מהקרסול ולא מהברך.', xpReward: 25, videoPlaceholder: 'אלפבית קרסול', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-04', name: 'מתיחת שוק עם מגבת', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 2, holdSeconds: 45, difficulty: 1, type: 'standard', instructions: 'שבו כשהרגל ישרה. הניחו מגבת סביב כרית כף הרגל ומשכו אליכם בעדינות עד למתיחה בשוק לאחור.', xpReward: 20, videoPlaceholder: 'מתיחת מגבת', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-05', name: 'מתיחת תאומים (Gastrocnemius)', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 2, holdSeconds: 45, difficulty: 1, type: 'standard', instructions: 'עמדו מול קיר. רגל פגועה ישרה מאחור, רגל בריאה כפופה מלפנים. דחפו עקב אחורי לרצפה עד למתיחה.', xpReward: 20, videoPlaceholder: 'מתיחת תאומים קיר', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-06', name: 'מתיחת סוליה (Soleus)', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 2, holdSeconds: 45, difficulty: 2, type: 'clinical', instructions: 'כמו מתיחת תאומים, אך הפעם כופפו מעט את הברך של הרגל האחורית (הפגועה) תוך שמירת העקב ברצפה.', xpReward: 25, videoPlaceholder: 'מתיחת סוליה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-07', name: 'מתיחת פציה פלנטרית', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, holdSeconds: 30, difficulty: 1, type: 'clinical', instructions: 'שבו והניחו את הקרסול הפגוע על הברך הנגדית. בעזרת היד, מתחו את אצבעות הרגל לאחור (לכיוון השוק).', xpReward: 20, videoPlaceholder: 'מתיחת כף רגל', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  
  // -- חיזוק איזומטרי (Early Strengthening - Isometrics) --
  { id: 'lib-ak-08', name: 'איזומטרי: איברזיה (Eversion)', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, holdSeconds: 5, reps: 10, difficulty: 1, type: 'clinical', instructions: 'שבו ליד קיר/רהיט. דחפו את הצד החיצוני של כף הרגל נגד הקיר חזק, מבלי להזיז את הרגל בפועל.', xpReward: 25, videoPlaceholder: 'איזומטרי החוצה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-09', name: 'איזומטרי: אינברזיה (Inversion)', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, holdSeconds: 5, reps: 10, difficulty: 1, type: 'clinical', instructions: 'הצמידו את החלק הפנימי של כף הרגל נגד קיר או רגל כיסא. דחפו פנימה חזק והחזיקו 5 שניות.', xpReward: 25, videoPlaceholder: 'איזומטרי פנימה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-10', name: 'איזומטרי: דורסיפלקסיה', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, holdSeconds: 5, reps: 10, difficulty: 1, type: 'clinical', instructions: 'הניחו את רגל אחת על השנייה. נסו להרים את הרגל התחתונה למעלה (פלקס), והתנגדו עם הרגל העליונה.', xpReward: 25, videoPlaceholder: 'איזומטרי פלקס', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },

  // -- חיזוק דינמי עם התנגדות (Dynamic Strengthening) --
  { id: 'lib-ak-11', name: 'פוינט (Plantarflexion) עם גומייה', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'שבו, גומייה סביב כרית כף הרגל. אחזו בקצוות ודחפו את כף הרגל קדימה (פוינט) נגד ההתנגדות.', xpReward: 30, videoPlaceholder: 'פוינט גומייה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-12', name: 'פלקס (Dorsiflexion) עם גומייה', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'קבעו גומייה לחפץ כבד מולכם וכרכו סביב גב כף הרגל. משכו את כף הרגל אליכם (פלקס) ושחררו לאט.', xpReward: 30, videoPlaceholder: 'פלקס גומייה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-13', name: 'איברזיה (הרחקה) עם גומייה', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'קבעו גומייה מולכם/פנימה מכם. סובבו את כף הרגל החוצה כנגד התנגדות הגומייה. התנועה מגיעה רק מהקרסול.', xpReward: 35, videoPlaceholder: 'איברזיה גומייה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-14', name: 'אינברזיה (קירוב) עם גומייה', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, reps: 15, difficulty: 2, type: 'clinical', instructions: 'שיכלו רגליים או קבעו גומייה החוצה מכם. סובבו את כף הרגל פנימה נגד ההתנגדות. ירידה מבוקרת.', xpReward: 35, videoPlaceholder: 'אינברזיה גומייה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-15', name: 'איסוף מגבת (Towel Scrunches)', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 2, reps: 15, difficulty: 2, type: 'clinical', instructions: 'שבו והניחו מגבת חלקה על הרצפה. בעזרת אצבעות כף הרגל, "אספו" את המגבת אליכם וקמטו אותה.', xpReward: 30, videoPlaceholder: 'איסוף מגבת', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-16', name: 'הרמת גולות באצבעות הרגליים', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 2, reps: 10, difficulty: 2, type: 'clinical', instructions: 'פזרו מספר גולות או חפצים קטנים. בעזרת אצבעות הרגליים, הרימו אותם והעבירו לכוס קטנה.', xpReward: 35, videoPlaceholder: 'הרמת גולות', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },

  // -- חיזוק נשיאת משקל ופונקציה (Weight Bearing & Functional) --
  { id: 'lib-ak-17', name: 'עליית תאומים - שתי רגליים', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, reps: 15, difficulty: 2, type: 'standard', instructions: 'עמדו זקוף (אפשר להיתמך קלות). עלו גבוה על קצות האצבעות, השהו שנייה ורדו לאט.', xpReward: 30, videoPlaceholder: 'עליית תאומים', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-18', name: 'עליית תאומים - רגל אחת', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, reps: 12, difficulty: 4, type: 'standard', instructions: 'עמדו על הרגל הפגועה בלבד. עלו על קצות האצבעות הכי גבוה שאפשר, ורדו מבוקר. השתמשו בתמיכה לשיווי משקל.', xpReward: 40, videoPlaceholder: 'עליית תאומים רגל אחת', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-19', name: 'ירידה אקסנטרית ממדרגה', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, reps: 12, difficulty: 4, type: 'clinical', instructions: 'עמדו על מדרגה עם עקבים באוויר. עלו למעלה עם 2 הרגליים, נתקו רגל בריאה, ורדו לאט *רק* עם הרגל הפגועה.', xpReward: 45, videoPlaceholder: 'תאומים אקסנטרי', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-20', name: 'עליית סוליה בישיבה (Seated Calf Raise)', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, reps: 15, difficulty: 2, type: 'standard', instructions: 'שבו על כיסא כשהברכיים ב-90°. הניחו משקולת/לחץ על הברכיים, והרימו עקבים מהרצפה חזק.', xpReward: 30, videoPlaceholder: 'עליית תאומים ישיבה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-21', name: 'הליכת עקבים (Heel Walk)', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, holdSeconds: 30, difficulty: 3, type: 'clinical', instructions: 'הרימו את קדמת כף הרגל (פלקס חזק) ולכו ברחבי החדר על העקבים בלבד. מצוין לחיזוק טיביאליס אנטריור.', xpReward: 35, videoPlaceholder: 'הליכת עקבים', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-22', name: 'הליכת קצות אצבעות', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, holdSeconds: 30, difficulty: 3, type: 'standard', instructions: 'עלו גבוה על קצות האצבעות ולכו ברחבי החדר. אל תתנו לעקבים לרדת לרצפה לאורך כל הסט.', xpReward: 35, videoPlaceholder: 'הליכת קצות אצבעות', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },

  // -- פרופריוספציה ושיווי משקל (Proprioception & Balance) --
  { id: 'lib-ak-23', name: 'עמידה על רגל אחת (SLS)', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, holdSeconds: 30, difficulty: 3, type: 'clinical', instructions: 'עמדו על הרגל הפגועה בלבד. נסו לייצב את הקרסול ולמנוע תנודות ככל האפשר.', xpReward: 35, videoPlaceholder: 'עמידה רגל אחת', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-24', name: 'רגל אחת - עיניים עצומות', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, holdSeconds: 20, difficulty: 4, type: 'clinical', instructions: 'עמדו על הרגל הפגועה ועיצמו עיניים. התרגול מעביר את עבודת הייצוב ממערכת הראייה לקרסול.', xpReward: 45, videoPlaceholder: 'רגל אחת עיניים עצומות', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-25', name: 'רגל אחת על משטח לא יציב', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, holdSeconds: 30, difficulty: 4, type: 'clinical', instructions: 'עמדו על הרגל הפגועה מעל כרית, פיתה לשיווי משקל או בוסו. שמרו על שיווי משקל.', xpReward: 45, videoPlaceholder: 'רגל אחת על כרית', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-26', name: 'עמידת עקב-אגודל (Tandem Stance)', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, holdSeconds: 30, difficulty: 3, type: 'clinical', instructions: 'עמדו כשרגל אחת בדיוק לפני השנייה (עקב נוגע באגודל - כמו הליכה על חבל). הרגל הפגועה מאחור.', xpReward: 35, videoPlaceholder: 'עמידת חבל', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  
  // -- פליאומטרי ותפקוד מתקדם (Advanced & Plyometrics) --
  { id: 'lib-ak-27', name: 'קפיצות צד מעל קו (Line Hops Lateral)', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, holdSeconds: 20, difficulty: 4, type: 'standard', instructions: 'דמיינו קו על הרצפה. קפצו ב-2 רגליים מהר מצד לצד מעל הקו (זמן מגע מינימלי עם הרצפה).', xpReward: 40, videoPlaceholder: 'קפיצות קו צד', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-28', name: 'קפיצות קדימה-אחורה מעל קו', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, holdSeconds: 20, difficulty: 4, type: 'standard', instructions: 'קפצו ב-2 רגליים קדימה ואחורה מעל הקו הדמיוני. שמרו על קצב מהיר וברכיים "רכות".', xpReward: 40, videoPlaceholder: 'קפיצות קו קדימה', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-29', name: 'קפיצה על רגל אחת במקום (Single Leg Hops)', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, reps: 15, difficulty: 5, type: 'clinical', instructions: 'קפצו קפיצות קלות במקום רק על הרגל הפגועה. התמקדו בנחיתה רכה ויציבה מהקרסול והברך.', xpReward: 50, videoPlaceholder: 'קפיצות רגל אחת', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
  { id: 'lib-ak-30', name: 'ריצה בצורת 8 (Figure 8 Run)', muscleGroup: 'קרסול', targetArea: 'ankle_right', sets: 3, reps: 5, difficulty: 5, type: 'standard', instructions: 'הניחו 2 כוסות במרחק 3 מטרים. רוצו ביניהן בצורת הספרה 8. מצוין להחזרת יכולת חיתוך ושינוי כיוון לקרסול.', xpReward: 50, videoPlaceholder: 'ריצת שמיניות', videoUrl: DEFAULT_EXERCISE_DEMO_VIDEO_URL },
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
