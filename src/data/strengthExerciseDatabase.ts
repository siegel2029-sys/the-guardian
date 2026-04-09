import type { BodyArea } from '../types';
import {
  DEMO_VIDEO_URL_L1,
  DEMO_VIDEO_URL_L2,
  DEMO_VIDEO_URL_L3,
} from './exerciseVideoDefaults';

const REGRESSION_BY_LEVEL: Record<1 | 2 | 3, string> = {
  1: 'אם כאב מעל 4/10: הקטינו טווח תנועה, האטו, או צמצמו חזרות. עצרו מיד אם הכאב חד.',
  2: 'קשה? הסירו גומייה או משקל, או הורידו רמה אחת במחוון. נשימה אחידה.',
  3: 'מרגישים עומס? חזרו לרמת «בינוני», הפחיתו סטים, או קצרו זמן החזקה.',
};

const PROGRESSION_BY_LEVEL: Record<1 | 2 | 3, string> = {
  1: 'קל מדי? העבירו את המחוון ל«בינוני» או הוסיפו 3–5 שניות החזקה בכל חזרה.',
  2: 'קל מדי? עברו ל«קשה», הוסיפו גומייה או משקל קל — לפי הנחיית המטפל.',
  3: 'מתקדמים? האריכו זמן, הוסיפו נפח (סטים/חזרות), או תאמו עם המטפל העמסה נוספת.',
};

export interface StrengthExerciseLevelDef {
  level: 1 | 2 | 3;
  id: string;
  name: string;
  sets: number;
  reps: number;
  repsAreSeconds?: boolean;
  instructions: string;
  videoUrl: string;
  xpReward: number;
  /** הנחיה להקלה — מוצג במודאל */
  regressionHint: string;
  /** הנחיה להתקדמות — מוצג במודאל */
  progressionHint: string;
}

export interface StrengthChainDef {
  chainId: BodyArea;
  bodyArea: BodyArea;
  levels: [StrengthExerciseLevelDef, StrengthExerciseLevelDef, StrengthExerciseLevelDef];
}

function L(
  level: 1 | 2 | 3,
  id: string,
  name: string,
  sets: number,
  reps: number,
  instructions: string,
  repsAreSeconds?: boolean,
  hints?: { regressionHint?: string; progressionHint?: string; videoUrl?: string }
): StrengthExerciseLevelDef {
  const xpReward = level === 1 ? 28 : level === 2 ? 33 : 38;
  const videoUrl =
    hints?.videoUrl ??
    (level === 1 ? DEMO_VIDEO_URL_L1 : level === 2 ? DEMO_VIDEO_URL_L2 : DEMO_VIDEO_URL_L3);
  return {
    level,
    id,
    name,
    sets,
    reps,
    repsAreSeconds,
    instructions,
    videoUrl,
    xpReward,
    regressionHint: hints?.regressionHint ?? REGRESSION_BY_LEVEL[level],
    progressionHint: hints?.progressionHint ?? PROGRESSION_BY_LEVEL[level],
  };
}

/**
 * Progressive strength / prehab chains (gym or home). Each body area has L1 → L2 → L3.
 * ניתן לעדכן `videoUrl` וטקסטי regression/progression פר־שלב דרך הארגומנט האחרון של L().
 */
export const STRENGTH_EXERCISE_CHAINS: StrengthChainDef[] = [
  {
    chainId: 'neck',
    bodyArea: 'neck',
    levels: [
      L(1, 'str-neck-1', 'יישור isometric בקיר', 3, 8, 'דחקו מצח קלות לקיר 5 שניות; ללא כאב.'),
      L(2, 'str-neck-2', 'שכיבה — חיזוק שרשרת צוואר', 3, 10, 'שכיבה — הרמת ראש קטנה ממשטח; 2 שניות למעלה.'),
      L(3, 'str-neck-3', 'Dead bug + ייצוב צוואר', 3, 8, 'מתוחים זרועות; שמרו סנטר מכווץ, ברכיים 90°.'),
    ],
  },
  {
    chainId: 'shoulder_left',
    bodyArea: 'shoulder_left',
    levels: [
      L(1, 'str-shl-1', 'שכיבה — חיזוק חיצוני', 3, 12, 'משקל בקבוק מים; הרמה לצד 45° בלי כיפוף גוף.'),
      L(2, 'str-shl-2', 'חתירה אלכסונית עם גומייה', 3, 12, 'עמידה; משיכה אל הבטן בזווית 45°.'),
      L(3, 'str-shl-3', 'דחיפת כתף חד-צדדית (דמבל)', 4, 8, 'עמידה; דחיפה מכתף לאוזן; שליטה במשקל.'),
    ],
  },
  {
    chainId: 'shoulder_right',
    bodyArea: 'shoulder_right',
    levels: [
      L(1, 'str-shr-1', 'שכיבה — חיזוק חיצוני', 3, 12, 'משקל בקבוק מים; הרמה לצד 45° בלי כיפוף גוף.'),
      L(2, 'str-shr-2', 'חתירה אלכסונית עם גומייה', 3, 12, 'עמידה; משיכה אל הבטן בזווית 45°.'),
      L(3, 'str-shr-3', 'דחיפת כתף חד-צדדית (דמבל)', 4, 8, 'עמידה; דחיפה מכתף לאוזן; שליטה במשקל.'),
    ],
  },
  {
    chainId: 'back_upper',
    bodyArea: 'back_upper',
    levels: [
      L(1, 'str-bu-1', 'חתירה גומייה — גב עליון', 3, 15, 'ברכיים כפופות; משיכה לגב התחתון.'),
      L(2, 'str-bu-2', 'משיכת פנים TRX / טבעות', 3, 10, 'גוף נטוי; חזה לשמים; שליפת כתפיים אחורה.'),
      L(3, 'str-bu-3', 'משיכה אנכית משקל / מכונה', 4, 8, 'גב ישר; תנועה מלאה; ללא נענוע מותניים.'),
    ],
  },
  {
    chainId: 'back_lower',
    bodyArea: 'back_lower',
    levels: [
      L(1, 'str-bl-1', 'גשר יריים דו-צדדי', 3, 15, 'שכיבה; לחיצת עקבים; כיווץ ישבן למעלה.'),
      L(2, 'str-bl-2', 'Deadlift רומני עם דמבל קל', 3, 10, 'ברכיים רכות; ירידת מותניים עם גב ניטרלי.'),
      L(3, 'str-bl-3', 'Deadlift ברומיני עם משקל', 4, 6, 'אותה טכניקה — עומס מתקדם; שומרים ליבה.'),
    ],
  },
  {
    chainId: 'hip_left',
    bodyArea: 'hip_left',
    levels: [
      L(1, 'str-hl-1', 'כפיפת ירך שכיבה', 3, 12, 'שכיבה; ברך אחת לחזה; ללא כאב מפרק.'),
      L(2, 'str-hl-2', 'בולגריאן ספליט סקווט', 3, 8, 'רגל אחורה על ספסל; ירידה אנכית.'),
      L(3, 'str-hl-3', 'סקווט בולגריאני עם משקל', 4, 6, 'אותה תבנית — דמבל/קטלבל.'),
    ],
  },
  {
    chainId: 'hip_right',
    bodyArea: 'hip_right',
    levels: [
      L(1, 'str-hr-1', 'כפיפת ירך שכיבה', 3, 12, 'שכיבה; ברך אחת לחזה; ללא כאב מפרק.'),
      L(2, 'str-hr-2', 'בולגריאן ספליט סקווט', 3, 8, 'רגל אחורה על ספסל; ירידה אנכית.'),
      L(3, 'str-hr-3', 'סקווט בולגריאני עם משקל', 4, 6, 'אותה תבנית — דמבל/קטלבל.'),
    ],
  },
  {
    chainId: 'knee_left',
    bodyArea: 'knee_left',
    levels: [
      L(1, 'str-kl-1', 'הרמת רגל ישרה שכיבה', 3, 12, 'ברך מעט כפופה; הרמה איטית; כיווץ ירך.'),
      L(2, 'str-kl-2', 'סקווט חלקי לכיסא', 3, 10, 'ישיבה מבוקרת עד מגע קל בכיסא; ללא כאב ברך.'),
      L(3, 'str-kl-3', 'סקווט חלקי עם גומייה', 3, 8, 'גומייה מעל ברכיים; דחיפת ברכיים החוצה קלות.'),
    ],
  },
  {
    chainId: 'knee_right',
    bodyArea: 'knee_right',
    levels: [
      L(1, 'str-kr-1', 'הרמת רגל ישרה שכיבה', 3, 12, 'ברך מעט כפופה; הרמה איטית; כיווץ ירך.'),
      L(2, 'str-kr-2', 'סקווט חלקי לכיסא', 3, 10, 'ישיבה מבוקרת עד מגע קל בכיסא; ללא כאב ברך.'),
      L(3, 'str-kr-3', 'סקווט חלקי עם גומייה', 3, 8, 'גומייה מעל ברכיים; דחיפת ברכיים החוצה קלות.'),
    ],
  },
  {
    chainId: 'ankle_left',
    bodyArea: 'ankle_left',
    levels: [
      L(1, 'str-al-1', 'כפיפת קרסול ישיבה', 3, 15, 'רגל על הרצפה; משוך אצבעות לכיוון השין.'),
      L(2, 'str-al-2', 'עמידה על קצה רגל', 3, 10, 'אחיזה בקיר; הרמה איטית; ירידה מבוקרת.'),
      L(3, 'str-al-3', 'קפיצות קלות (פליומטריקה)', 3, 8, 'מדרגה נמוכה; נחיתה רכה; עצירה אם נפיחות.'),
    ],
  },
  {
    chainId: 'ankle_right',
    bodyArea: 'ankle_right',
    levels: [
      L(1, 'str-ar-1', 'כפיפת קרסול ישיבה', 3, 15, 'רגל על הרצפה; משוך אצבעות לכיוון השין.'),
      L(2, 'str-ar-2', 'עמידה על קצה רגל', 3, 10, 'אחיזה בקיר; הרמה איטית; ירידה מבוקרת.'),
      L(3, 'str-ar-3', 'קפיצות קלות (פליומטריקה)', 3, 8, 'מדרגה נמוכה; נחיתה רכה; עצירה אם נפיחות.'),
    ],
  },
  {
    chainId: 'wrist_left',
    bodyArea: 'wrist_left',
    levels: [
      L(1, 'str-wl-1', 'כפיפה/פשיטה איטית', 3, 12, 'מרפק על שולחן; תנועה קטנה ללא כאב.'),
      L(2, 'str-wl-2', 'כפיפה עם התנגדות קלה', 3, 10, 'בקבוק מים / גומייה עדינה.'),
      L(3, 'str-wl-3', 'תמיכה על ברכיים + משקל גוף', 3, 8, 'אצבעות פשוטות; לחץ עדון.'),
    ],
  },
  {
    chainId: 'wrist_right',
    bodyArea: 'wrist_right',
    levels: [
      L(1, 'str-wr-1', 'כפיפה/פשיטה איטית', 3, 12, 'מרפק על שולחן; תנועה קטנה ללא כאב.'),
      L(2, 'str-wr-2', 'כפיפה עם התנגדות קלה', 3, 10, 'בקבוק מים / גומייה עדינה.'),
      L(3, 'str-wr-3', 'תמיכה על ברכיים + משקל גוף', 3, 8, 'אצבעות פשוטות; לחץ עדון.'),
    ],
  },
  {
    chainId: 'elbow_left',
    bodyArea: 'elbow_left',
    levels: [
      L(1, 'str-el-1', 'כפיפת מרפק isometric', 3, 8, 'יד תומכת; לחץ קל 5 שניות ללא תנועה.'),
      L(2, 'str-el-2', 'כפיפה עם משקל קל', 3, 10, 'יושבים; טווח מלא מבוקר.'),
      L(3, 'str-el-3', 'פשיטה אקסנטרית איטית', 3, 6, 'הורדה איטית משקל כבד יותר.'),
    ],
  },
  {
    chainId: 'elbow_right',
    bodyArea: 'elbow_right',
    levels: [
      L(1, 'str-er-1', 'כפיפת מרפק isometric', 3, 8, 'יד תומכת; לחץ קל 5 שניות ללא תנועה.'),
      L(2, 'str-er-2', 'כפיפה עם משקל קל', 3, 10, 'יושבים; טווח מלא מבוקר.'),
      L(3, 'str-er-3', 'פשיטה אקסנטרית איטית', 3, 6, 'הורדה איטית משקל כבד יותר.'),
    ],
  },
];

/** מיפוי מקטע אנטומי מפורט → אזור שרשרת כוח קיימת */
const STRENGTH_CHAIN_ANCHOR: Partial<Record<BodyArea, BodyArea>> = {
  chest: 'back_upper',
  abdomen: 'back_lower',
  upper_arm_left: 'shoulder_left',
  upper_arm_right: 'shoulder_right',
  forearm_left: 'elbow_left',
  forearm_right: 'elbow_right',
  thigh_left: 'hip_left',
  thigh_right: 'hip_right',
  shin_left: 'knee_left',
  shin_right: 'knee_right',
};

export function getStrengthChainForArea(area: BodyArea): StrengthChainDef {
  const anchor = STRENGTH_CHAIN_ANCHOR[area] ?? area;
  const c = STRENGTH_EXERCISE_CHAINS.find((x) => x.bodyArea === anchor);
  if (!c) {
    throw new Error(`No strength chain for area: ${area}`);
  }
  return c;
}
