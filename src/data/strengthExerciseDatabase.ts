import type { BodyArea } from '../types';

/** CC0 clips — רמה שונה יכולה להציג קישור וידאו שונה מהמסד */
const DEMO_L1 = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4';
const DEMO_L2 = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/framerate.mp4';
const DEMO_L3 = 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.webm';

export interface StrengthExerciseLevelDef {
  level: 1 | 2 | 3;
  id: string;
  name: string;
  sets: number;
  reps: number;
  /** When true, UI shows reps as seconds (ש״) not חזרות */
  repsAreSeconds?: boolean;
  instructions: string;
  /** YouTube / Vimeo / MP4 — אותו שדה כמו בתרגילי שיקום */
  videoUrl: string;
  /** נק׳ XP כמו בתרגילי שיקום (אחרי טיימר + דיווח) */
  xpReward: number;
}

export interface StrengthChainDef {
  /** Same as bodyArea — one progression track per zone */
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
  repsAreSeconds?: boolean
): StrengthExerciseLevelDef {
  const xpReward = level === 1 ? 28 : level === 2 ? 33 : 38;
  return {
    level,
    id,
    name,
    sets,
    reps,
    repsAreSeconds,
    instructions,
    videoUrl: level === 1 ? DEMO_L1 : level === 2 ? DEMO_L2 : DEMO_L3,
    xpReward,
  };
}

/**
 * Progressive strength / prehab chains (gym or home). Each body area has L1 → L2 → L3.
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
      L(1, 'str-kl-1', 'סקווט משקל גוף', 3, 15, 'עמידה רחבה; ירידה עד כיסא; ברכיים בקו אצבעות.'),
      L(2, 'str-kl-2', 'סקווט גובלט', 3, 12, 'דמבל אחד לחזה; עומק מבוקר.'),
      L(3, 'str-kl-3', 'סקווט גב עם מוט', 4, 6, 'רק אם מאושר קלינית; עומק ושליטה.'),
    ],
  },
  {
    chainId: 'knee_right',
    bodyArea: 'knee_right',
    levels: [
      L(1, 'str-kr-1', 'סקווט משקל גוף', 3, 15, 'עמידה רחבה; ירידה עד כיסא; ברכיים בקו אצבעות.'),
      L(2, 'str-kr-2', 'סקווט גובלט', 3, 12, 'דמבל אחד לחזה; עומק מבוקר.'),
      L(3, 'str-kr-3', 'סקווט גב עם מוט', 4, 6, 'רק אם מאושר קלינית; עומק ושליטה.'),
    ],
  },
  {
    chainId: 'ankle_left',
    bodyArea: 'ankle_left',
    levels: [
      L(1, 'str-al-1', 'הרמת עקב דו-צדדיות', 3, 20, 'עמידה; טווח מלא; שליטה בירידה.'),
      L(2, 'str-al-2', 'עקב יחיד + תמיכה קלה', 3, 12, 'אחיזה בקיר; עומס על קרסול אחד.'),
      L(3, 'str-al-3', 'עקב יחיד עם משקל', 4, 10, 'דמבל ביד; שליטה מלאה.'),
    ],
  },
  {
    chainId: 'ankle_right',
    bodyArea: 'ankle_right',
    levels: [
      L(1, 'str-ar-1', 'הרמת עקב דו-צדדיות', 3, 20, 'עמידה; טווח מלא; שליטה בירידה.'),
      L(2, 'str-ar-2', 'עקב יחיד + תמיכה קלה', 3, 12, 'אחיזה בקיר; עומס על קרסול אחד.'),
      L(3, 'str-ar-3', 'עקב יחיד עם משקל', 4, 10, 'דמבל ביד; שליטה מלאה.'),
    ],
  },
  {
    chainId: 'wrist_left',
    bodyArea: 'wrist_left',
    levels: [
      L(1, 'str-wl-1', 'כפיפה סטטית — שולחן', 3, 10, 'לחיצה כלפי מטה 10 שניות.'),
      L(2, 'str-wl-2', 'כפיפה עם דמבל קל', 3, 15, 'אגרוף על משטח; טווח מלא איטי.'),
      L(3, 'str-wl-3', 'Farmer carry זמן', 3, 40, 'הליכה 30–45 שניות; אחיזה חזקה.', true),
    ],
  },
  {
    chainId: 'wrist_right',
    bodyArea: 'wrist_right',
    levels: [
      L(1, 'str-wr-1', 'כפיפה סטטית — שולחן', 3, 10, 'לחיצה כלפי מטה 10 שניות.'),
      L(2, 'str-wr-2', 'כפיפה עם דמבל קל', 3, 15, 'אגרוף על משטח; טווח מלא איטי.'),
      L(3, 'str-wr-3', 'Farmer carry זמן', 3, 40, 'הליכה 30–45 שניות; אחיזה חזקה.', true),
    ],
  },
  {
    chainId: 'elbow_left',
    bodyArea: 'elbow_left',
    levels: [
      L(1, 'str-el-1', 'יישור מרפק עם גומייה', 3, 15, 'מרפק צמוד לגוף; יישור איטי.'),
      L(2, 'str-el-2', 'כפיפה/יישור דמבל ניטרלי', 3, 12, 'ישיבה; טווח מלא מבוקר.'),
      L(3, 'str-el-3', 'סקווש משקל — EZ / כבל', 4, 10, 'מרפקים קבועים; ללא נענוע כתפיים.'),
    ],
  },
  {
    chainId: 'elbow_right',
    bodyArea: 'elbow_right',
    levels: [
      L(1, 'str-er-1', 'יישור מרפק עם גומייה', 3, 15, 'מרפק צמוד לגוף; יישור איטי.'),
      L(2, 'str-er-2', 'כפיפה/יישור דמבל ניטרלי', 3, 12, 'ישיבה; טווח מלא מבוקר.'),
      L(3, 'str-er-3', 'סקווש משקל — EZ / כבל', 4, 10, 'מרפקים קבועים; ללא נענוע כתפיים.'),
    ],
  },
];

const CHAIN_BY_AREA: Record<BodyArea, StrengthChainDef> = STRENGTH_EXERCISE_CHAINS.reduce(
  (acc, c) => {
    acc[c.bodyArea] = c;
    return acc;
  },
  {} as Record<BodyArea, StrengthChainDef>
);

export function getStrengthChainForArea(area: BodyArea): StrengthChainDef {
  return CHAIN_BY_AREA[area];
}

export function getStrengthLevelDef(area: BodyArea, level: 1 | 2 | 3): StrengthExerciseLevelDef {
  const chain = CHAIN_BY_AREA[area];
  return chain.levels[level - 1];
}

export function clampStrengthLevel(area: BodyArea, level: number): 1 | 2 | 3 {
  const max = CHAIN_BY_AREA[area].levels.length;
  const n = Math.min(max, Math.max(1, Math.round(level)));
  return n as 1 | 2 | 3;
}
