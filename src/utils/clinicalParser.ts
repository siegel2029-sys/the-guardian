/**
 * ניתוח הערכה קלינית חופשית (דמו) — לוגיקה מבוססת כללים ללא API.
 * מזהה אזורי גוף, רמות כאב ומטרות, ומתאים תרגילים מספריית המערכת.
 */
import type { BodyArea, Exercise } from '../types';
import { EXERCISE_LIBRARY } from '../data/mockData';

export type ClinicalGoalTag =
  | 'rom'
  | 'strength'
  | 'stability'
  | 'pain_reduction'
  | 'return_to_function';

export type ClinicalIntakeAnalysis = {
  /** טקסט מנורמל לחיפוש */
  normalizedText: string;
  /** אזורים שזוהו */
  bodyAreas: BodyArea[];
  /** מוקד ראשי לתוכנית */
  primaryBodyArea: BodyArea | null;
  /** כל ערכי הכאב שחולצו מהטקסט */
  painLevelsDetected: number[];
  /** הערכת כאב לשימוש בלוגיקה (מקסימום מזוהה, או null) */
  inferredPainLevel: number | null;
  /** מטרות קליניות מזוהות */
  goals: ClinicalGoalTag[];
  /** תרגילים מומלצים (מהספרייה, עם targetArea מותאם לצד אם רלוונטי) */
  proposedExercises: Exercise[];
  /** הסבר קצר לתצוגת מטפל */
  rationaleLinesHe: string[];
};

type SideHint = 'right' | 'left' | null;

const BODY_RULES: {
  patterns: RegExp[];
  areas: [BodyArea, BodyArea];
  labelHe: string;
}[] = [
  {
    patterns: [
      /\bknee\b|\bpatella\b|\bmeniscus\b|\bacl\b|\bmcl\b|\blcl\b|\bhamstring\b/i,
      /ברך|ברכיים|ACL|מניסקוס|צולבת/i,
    ],
    areas: ['knee_right', 'knee_left'],
    labelHe: 'ברך',
  },
  {
    patterns: [/\bshoulder\b|\brotator\b|\bcuff\b/i, /כתף|רוטטור|מסובבים/i],
    areas: ['shoulder_right', 'shoulder_left'],
    labelHe: 'כתף',
  },
  {
    patterns: [/\blower\s*back\b|\blumbar\b|\bsciatica\b/i, /גב תחתון|לומבלי|מותני/i],
    areas: ['back_lower', 'back_lower'],
    labelHe: 'גב תחתון',
  },
  {
    patterns: [/\bupper\s*back\b|\bthoracic\b/i, /גב עליון|חזה|תורקלי/i],
    areas: ['back_upper', 'back_upper'],
    labelHe: 'גב עליון',
  },
  {
    patterns: [/\bneck\b|\bcervical\b/i, /צוואר|צווארי/i],
    areas: ['neck', 'neck'],
    labelHe: 'צוואר',
  },
  {
    patterns: [/\bhip\b|\bgroin\b/i, /ירך|מפרק ירך|מפשעה/i],
    areas: ['hip_right', 'hip_left'],
    labelHe: 'ירך',
  },
  {
    patterns: [/\bankle\b|\bcalf\b|\bachilles\b/i, /קרסול|שוק|אכילס/i],
    areas: ['ankle_right', 'ankle_left'],
    labelHe: 'קרסול',
  },
  {
    patterns: [/\bwrist\b/i, /פרק כף יד|שורש כף/i],
    areas: ['wrist_right', 'wrist_left'],
    labelHe: 'פרק כף יד',
  },
  {
    patterns: [/\belbow\b/i, /מרפק/i],
    areas: ['elbow_right', 'elbow_left'],
    labelHe: 'מרפק',
  },
];

const GOAL_RULES: { patterns: RegExp[]; goal: ClinicalGoalTag; labelHe: string }[] = [
  {
    patterns: [/\brom\b|\brange\s+of\s+motion\b|\blimited\s+rom\b|\bstiffness\b/i, /טווח תנועה|נעילה|נוקשות|ROM/i],
    goal: 'rom',
    labelHe: 'שיפור טווח תנועה',
  },
  {
    patterns: [/\bstrain\b|\btear\b|\bstrengthen/i, /מתיחה|קרע|חיזוק|עומס/i],
    goal: 'strength',
    labelHe: 'חיזוק הדרגתי',
  },
  {
    patterns: [/\bstability\b|\bbalance\b|\bproprioception\b/i, /יציבות|שיווי משקל|פרופריוצפציה/i],
    goal: 'stability',
    labelHe: 'יציבות ושליטה',
  },
  {
    patterns: [/\bpain\b|\bach(e|ing)\b|\bvas\b/i, /כאב|VAS/i],
    goal: 'pain_reduction',
    labelHe: 'הפחתת כאב',
  },
  {
    patterns: [/\breturn\b|\bfunction\b|\badl\b|\bsport\b/i, /תפקוד|ספורט|שיקום/i],
    goal: 'return_to_function',
    labelHe: 'חזרה לתפקוד',
  },
];

function detectSide(text: string): SideHint {
  if (/\bleft\b|שמאל|שמאלית/i.test(text)) return 'left';
  if (/\bright\b|ימין|ימנית/i.test(text)) return 'right';
  return null;
}

function pickLateralArea(base: [BodyArea, BodyArea], side: SideHint): BodyArea {
  const [r, l] = base;
  if (r === l) return r;
  return side === 'left' ? l : r;
}

function extractPainLevels(text: string): number[] {
  const out: number[] = [];
  const reList: RegExp[] = [
    /(?:pain|vas|כאב)\s*[:\s]*(\d{1,2})(?:\s*\/\s*10)?/gi,
    /\b(\d{1,2})\s*\/\s*10\b/g,
    /\bnrs\s*(\d{1,2})\b/gi,
  ];
  for (const re of reList) {
    let m: RegExpExecArray | null;
    const r = new RegExp(re.source, re.flags);
    while ((m = r.exec(text)) !== null) {
      const n = parseInt(m[1], 10);
      if (n >= 0 && n <= 10) out.push(n);
    }
  }
  return out;
}

function exercisesForArea(area: BodyArea): Exercise[] {
  return EXERCISE_LIBRARY.filter((e) => e.targetArea === area);
}

/** תרגילים „שכנים” קליניים (למשל ירך לשיקום ברך) */
function relatedAreas(area: BodyArea): BodyArea[] {
  if (area.startsWith('knee')) return [area, 'hip_right', 'hip_left'];
  if (area.startsWith('shoulder')) return [area, 'neck'];
  if (area === 'back_lower') return ['back_lower', 'hip_right', 'hip_left'];
  return [area];
}

function maxDifficultyForPain(maxPain: number | null): number {
  if (maxPain == null) return 5;
  if (maxPain >= 7) return 2;
  if (maxPain >= 5) return 3;
  if (maxPain >= 3) return 4;
  return 5;
}

function rankAndSlice(candidates: Exercise[], goals: ClinicalGoalTag[], maxPain: number | null): Exercise[] {
  const maxD = maxDifficultyForPain(maxPain);
  const filtered = candidates.filter((e) => e.difficulty <= maxD);

  const wantsRom = goals.includes('rom');
  const wantsStability = goals.includes('stability') || goals.includes('return_to_function');
  const wantsStrength = goals.includes('strength');

  const score = (e: Exercise): number => {
    let s = 0;
    if (e.type === 'clinical') s += 3;
    if (wantsRom && (e.holdSeconds ?? 0) > 0) s += 2;
    if (wantsRom && (e.reps ?? 0) >= 10 && !(e.holdSeconds ?? 0)) s += 1;
    if (wantsStability && e.name.includes('עמידה')) s += 2;
    if (wantsStrength && (e.reps ?? 0) > 0) s += 1;
    if (wantsStrength && e.difficulty >= 3) s += 1;
    // ACL / שיקום ברך — העדפת תרגילים בסיסיים
    s -= (e.difficulty - 1) * 0.3;
    return s;
  };

  const uniq = new Map<string, Exercise>();
  for (const e of filtered) {
    if (!uniq.has(e.id)) uniq.set(e.id, e);
  }
  const sorted = [...uniq.values()].sort((a, b) => score(b) - score(a));
  return sorted.slice(0, 8);
}

function withTargetArea(exercises: Exercise[], area: BodyArea): Exercise[] {
  return exercises.map((e) => ({ ...e, targetArea: area }));
}

/**
 * ניתוח הערת הערכה/אינטייק קליני והצעת תוכנית תרגול מהספרייה הקיימת.
 */
export function analyzeClinicalNote(raw: string): ClinicalIntakeAnalysis {
  const normalizedText = raw.trim();
  const lower = normalizedText.toLowerCase();
  const painLevelsDetected = extractPainLevels(lower);
  const inferredPainLevel =
    painLevelsDetected.length > 0 ? Math.max(...painLevelsDetected) : null;

  const goals: ClinicalGoalTag[] = [];
  const rationaleLinesHe: string[] = [];
  for (const { patterns, goal, labelHe } of GOAL_RULES) {
    if (patterns.some((p) => p.test(normalizedText))) {
      if (!goals.includes(goal)) {
        goals.push(goal);
        rationaleLinesHe.push(`זוהתה מטרה: ${labelHe}`);
      }
    }
  }
  if (goals.length === 0) {
    goals.push('return_to_function');
    rationaleLinesHe.push('לא זוהו מטרות מפורשות — הוגדרה מטרת ברירת מחדל: חזרה לתפקוד.');
  }

  const detectedAreas: BodyArea[] = [];
  for (const rule of BODY_RULES) {
    if (rule.patterns.some((p) => p.test(normalizedText))) {
      const side = detectSide(normalizedText);
      const primary = pickLateralArea(rule.areas, side);
      if (!detectedAreas.includes(primary)) {
        detectedAreas.push(primary);
        rationaleLinesHe.push(`זוהה מוקד אנטומי: ${rule.labelHe}${side ? ` (צד: ${side === 'left' ? 'שמאל' : 'ימין'})` : ''}.`);
      }
    }
  }

  let primaryBodyArea: BodyArea | null = detectedAreas[0] ?? null;
  if (!primaryBodyArea) {
    primaryBodyArea = 'back_lower';
    rationaleLinesHe.push('לא זוהה אזור מפורש — מוצעת תוכנית בסיסית לגב תחתון (ניתן לעדכן ידנית).');
  }

  const areaSet = new Set<BodyArea>();
  for (const a of detectedAreas.length > 0 ? detectedAreas : [primaryBodyArea]) {
    for (const r of relatedAreas(a)) areaSet.add(r);
  }

  let candidates: Exercise[] = [];
  for (const a of areaSet) {
    candidates.push(...exercisesForArea(a));
  }

  let hadDirectLibraryMatch = candidates.length > 0;

  if (candidates.length === 0) {
    candidates = exercisesForArea('back_lower');
    rationaleLinesHe.push('לא נמצאו תרגילים לאזור המדויק — שימוש בתרגילי גב תחתון כברירת מחדל.');
    hadDirectLibraryMatch = false;
  }

  let proposed = rankAndSlice(candidates, goals, inferredPainLevel);

  if (proposed.length === 0) {
    const fb =
      primaryBodyArea.startsWith('wrist') ||
      primaryBodyArea.startsWith('elbow') ||
      primaryBodyArea === 'neck'
        ? ('shoulder_right' as BodyArea)
        : ('back_lower' as BodyArea);
    proposed = rankAndSlice(exercisesForArea(fb), goals, inferredPainLevel);
    rationaleLinesHe.push(
      'לא נמצאו מועמדים לאחר סינון — הוצגה תוכנית חלופית מהספרייה הקרובה קלינית.'
    );
    hadDirectLibraryMatch = false;
  }

  if (hadDirectLibraryMatch && primaryBodyArea) {
    proposed = withTargetArea(proposed, primaryBodyArea);
  }

  if (inferredPainLevel != null) {
    rationaleLinesHe.push(`רמות כאב שזוהו בטקסט: ${painLevelsDetected.join(', ')} (מקסימום ${inferredPainLevel}/10).`);
    rationaleLinesHe.push(
      inferredPainLevel >= 7
        ? 'בשל כאב גבוה — הוצגו תרגילים בעלי דרגת קושי נמוכה בלבד.'
        : inferredPainLevel >= 5
          ? 'כאב בינוני — הוגבלה עוצמת התרגילים המוצעים.'
          : 'רמת כאב נמוכה יחסית — ניתן לכלול מגוון רחב יותר.'
    );
  }

  rationaleLinesHe.push(`הוצעו ${proposed.length} תרגילים מהספרייה הקלינית של המערכת.`);

  return {
    normalizedText,
    bodyAreas: detectedAreas.length > 0 ? detectedAreas : [primaryBodyArea],
    primaryBodyArea,
    painLevelsDetected,
    inferredPainLevel,
    goals,
    proposedExercises: proposed,
    rationaleLinesHe,
  };
}
