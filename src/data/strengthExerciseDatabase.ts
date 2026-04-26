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
      L(1, 'str-neck-1', 'יישור איזומטרי כנגד קיר', 3, 10, 'דחפו מצח קלות לקיר; ללא תנועה וללא כאב.', true),
      L(2, 'str-neck-2', 'הרמות ראש מחוץ למיטה', 3, 15, 'שכבו על הבטן, ראש באוויר. הרימו והורידו ראש מבוקר.'),
      L(3, 'str-neck-3', 'גשר צוואר (Wrestler Bridge)', 3, 30, 'רמת עילית: תמיכת משקל הגוף על הראש והרגליים בלבד (מזרן רך).', true),
    ],
  },
  {
    chainId: 'shoulder_left',
    bodyArea: 'shoulder_left',
    levels: [
      L(1, 'str-shl-1', 'שכיבות סמיכה על קיר', 3, 15, 'עמדו מול קיר. דחפו והתרחקו בצורה מבוקרת.'),
      L(2, 'str-shl-2', 'שכיבות סמיכה קלאסיות', 3, 12, 'גוף ישר כמו קרש. חזה כמעט נוגע ברצפה.'),
      L(3, 'str-shl-3', 'שכיבות סמיכה בעמידת ידיים (HSPU)', 4, 8, 'רמת עילית: עמידת ידיים כנגד קיר, כפיפת מרפקים ודחיפה חזקה מעלה.'),
    ],
  },
  {
    chainId: 'shoulder_right',
    bodyArea: 'shoulder_right',
    levels: [
      L(1, 'str-shr-1', 'שכיבות סמיכה על קיר', 3, 15, 'עמדו מול קיר. דחפו והתרחקו בצורה מבוקרת.'),
      L(2, 'str-shr-2', 'שכיבות סמיכה קלאסיות', 3, 12, 'גוף ישר כמו קרש. חזה כמעט נוגע ברצפה.'),
      L(3, 'str-shr-3', 'שכיבות סמיכה בעמידת ידיים (HSPU)', 4, 8, 'רמת עילית: עמידת ידיים כנגד קיר, כפיפת מרפקים ודחיפה חזקה מעלה.'),
    ],
  },
  {
    chainId: 'back_upper',
    bodyArea: 'back_upper',
    levels: [
      L(1, 'str-bu-1', 'משיכת גומייה פנים (Face Pulls)', 3, 15, 'משכו גומייה לכיוון הפנים תוך קירוב שכמות חזק.'),
      L(2, 'str-bu-2', 'עליות מתח (Pull-ups)', 3, 8, 'אחיזה רחבה, עלו עד שהסנטר עובר את המתח.'),
      L(3, 'str-bu-3', 'עליית כוח (Muscle-Up)', 3, 5, 'רמת עילית: משיכה מתפרצת ומעבר לעליית תמך מעל הבר.'),
    ],
  },
  {
    chainId: 'back_lower',
    bodyArea: 'back_lower',
    levels: [
      L(1, 'str-bl-1', 'ציפור-כלב (Bird-Dog)', 3, 12, 'עמידת שש, יישור יד ורגל נגדית ללא הקשתת גב.'),
      L(2, 'str-bl-2', 'פלאנק מלא עם ניתוקים', 3, 45, 'פלאנק על אמות. כל 10 שניות נתקו רגל באוויר.', true),
      L(3, 'str-bl-3', 'תליית L-Sit / דגל תחתון', 3, 15, 'רמת עילית: תלייה על מתח והחזקת רגליים ישרות ב-90 מעלות לזמן.', true),
    ],
  },
  {
    chainId: 'hip_left',
    bodyArea: 'hip_left',
    levels: [
      L(1, 'str-hl-1', 'גשר אגן רגל אחת', 3, 12, 'שכבו על הגב. דחפו מהעקב השמאלי, רגל ימין באוויר.'),
      L(2, 'str-hl-2', 'דדליפט רגל אחת (RDL)', 3, 10, 'עמידה על שמאל, התכופפו קדימה עם גב ישר. רגל ימין עולה לאחור.'),
      L(3, 'str-hl-3', 'פיסטול סקווט (Pistol Squat)', 3, 6, 'רמת עילית: סקווט מלא על רגל שמאל בלבד עד למטה וקימה.'),
    ],
  },
  {
    chainId: 'hip_right',
    bodyArea: 'hip_right',
    levels: [
      L(1, 'str-hr-1', 'גשר אגן רגל אחת', 3, 12, 'שכבו על הגב. דחפו מהעקב הימני, רגל שמאל באוויר.'),
      L(2, 'str-hr-2', 'דדליפט רגל אחת (RDL)', 3, 10, 'עמידה על ימין, התכופפו קדימה עם גב ישר. רגל שמאל עולה לאחור.'),
      L(3, 'str-hr-3', 'פיסטול סקווט (Pistol Squat)', 3, 6, 'רמת עילית: סקווט מלא על רגל ימין בלבד עד למטה וקימה.'),
    ],
  },
  {
    chainId: 'knee_left',
    bodyArea: 'knee_left',
    levels: [
      L(1, 'str-kl-1', 'סקווט משקל גוף', 3, 15, 'ירידה מבוקרת עד 90 מעלות. משקל על העקבים.'),
      L(2, 'str-kl-2', 'ספליט סקווט בולגרי', 3, 10, 'רגל ימין על ספסל מאחור, ירידה מבוקרת על רגל שמאל.'),
      L(3, 'str-kl-3', 'קפיצות קופסה (Box Jumps)', 4, 8, 'רמת עילית: קפיצה מתפרצת על קופסה גבוהה מולך ונחיתה רכה.'),
    ],
  },
  {
    chainId: 'knee_right',
    bodyArea: 'knee_right',
    levels: [
      L(1, 'str-kr-1', 'סקווט משקל גוף', 3, 15, 'ירידה מבוקרת עד 90 מעלות. משקל על העקבים.'),
      L(2, 'str-kr-2', 'ספליט סקווט בולגרי', 3, 10, 'רגל שמאל על ספסל מאחור, ירידה מבוקרת על רגל ימין.'),
      L(3, 'str-kr-3', 'קפיצות קופסה (Box Jumps)', 4, 8, 'רמת עילית: קפיצה מתפרצת על קופסה גבוהה מולך ונחיתה רכה.'),
    ],
  },
  {
    chainId: 'ankle_left',
    bodyArea: 'ankle_left',
    levels: [
      L(1, 'str-al-1', 'עמידה על רגל אחת (עיניים עצומות)', 3, 30, 'עמדו על רגל שמאל בלבד ועיצמו עיניים. שמרו על יציבות.', true),
      L(2, 'str-al-2', 'עליית תאומים אקסנטרית מהירה', 3, 12, 'עלו על שמאל בקצב מתפרץ ורדו לאט במשך 3 שניות.'),
      L(3, 'str-al-3', 'קפיצות "סקייטר" אגרסיביות', 3, 16, 'רמת עילית: קפיצות צד רחבות משמאל לימין עם נחיתה וספיגת זעזוע מתקדמת.'),
    ],
  },
  {
    chainId: 'ankle_right',
    bodyArea: 'ankle_right',
    levels: [
      L(1, 'str-ar-1', 'עמידה על רגל אחת (עיניים עצומות)', 3, 30, 'עמדו על רגל ימין בלבד ועיצמו עיניים. שמרו על יציבות.', true),
      L(2, 'str-ar-2', 'עליית תאומים אקסנטרית מהירה', 3, 12, 'עלו על ימין בקצב מתפרץ ורדו לאט במשך 3 שניות.'),
      L(3, 'str-ar-3', 'קפיצות "סקייטר" אגרסיביות', 3, 16, 'רמת עילית: קפיצות צד רחבות מימין לשמאל עם נחיתה וספיגת זעזוע מתקדמת.'),
    ],
  },
  {
    chainId: 'wrist_left',
    bodyArea: 'wrist_left',
    levels: [
      L(1, 'str-wl-1', 'כפיפת שורש כף יד עם דמבל', 3, 15, 'אמת שמאל תמוכה. כפיפה ופשיטה של שורש כף היד.'),
      L(2, 'str-wl-2', 'הליכת חקלאי (Farmer Walk) כבד', 3, 40, 'החזיקו משקולת כבדה מאוד ביד שמאל ולכו זקוף.', true),
      L(3, 'str-wl-3', 'שכיבות סמיכה על קצות האצבעות', 3, 10, 'רמת עילית: שכיבות סמיכה מלאות כשהתמיכה היא על אצבעות הידיים בלבד.'),
    ],
  },
  {
    chainId: 'wrist_right',
    bodyArea: 'wrist_right',
    levels: [
      L(1, 'str-wr-1', 'כפיפת שורש כף יד עם דמבל', 3, 15, 'אמת ימין תמוכה. כפיפה ופשיטה של שורש כף היד.'),
      L(2, 'str-wr-2', 'הליכת חקלאי (Farmer Walk) כבד', 3, 40, 'החזיקו משקולת כבדה מאוד ביד ימין ולכו זקוף.', true),
      L(3, 'str-wr-3', 'שכיבות סמיכה על קצות האצבעות', 3, 10, 'רמת עילית: שכיבות סמיכה מלאות כשהתמיכה היא על אצבעות הידיים בלבד.'),
    ],
  },
  {
    chainId: 'elbow_left',
    bodyArea: 'elbow_left',
    levels: [
      L(1, 'str-el-1', 'כפיפת מרפקים (Bicep Curls)', 3, 15, 'משקולת ביד שמאל. תנועה מבוקרת ללא תנופת גב.'),
      L(2, 'str-el-2', 'מקבילים אחוריים (Bench Dips)', 3, 12, 'ידיים על ספסל מאחור, רגליים ישרות קדימה.'),
      L(3, 'str-el-3', 'מקבילים על טבעות אולימפיות', 3, 8, 'רמת עילית: Dips מלאים על טבעות הדורשים ייצוב מטורף למרפק ולכתף.'),
    ],
  },
  {
    chainId: 'elbow_right',
    bodyArea: 'elbow_right',
    levels: [
      L(1, 'str-er-1', 'כפיפת מרפקים (Bicep Curls)', 3, 15, 'משקולת ביד ימין. תנועה מבוקרת ללא תנופת גב.'),
      L(2, 'str-er-2', 'מקבילים אחוריים (Bench Dips)', 3, 12, 'ידיים על ספסל מאחור, רגליים ישרות קדימה.'),
      L(3, 'str-er-3', 'מקבילים על טבעות אולימפיות', 3, 8, 'רמת עילית: Dips מלאים על טבעות הדורשים ייצוב מטורף למרפק ולכתף.'),
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
  hand_left: 'wrist_left',
  hand_right: 'wrist_right',
  thigh_left: 'hip_left',
  thigh_right: 'hip_right',
  shin_left: 'knee_left',
  shin_right: 'knee_right',
  foot_left: 'ankle_left',
  foot_right: 'ankle_right',
};

export function getStrengthChainForArea(area: BodyArea): StrengthChainDef {
  const anchor = STRENGTH_CHAIN_ANCHOR[area] ?? area;
  const c = STRENGTH_EXERCISE_CHAINS.find((x) => x.bodyArea === anchor);
  if (!c) {
    throw new Error(`No strength chain for area: ${area}`);
  }
  return c;
}
