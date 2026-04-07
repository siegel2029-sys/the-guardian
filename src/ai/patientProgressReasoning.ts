/**
 * מנוע ניתוח Guardian — לוגיקה ברמת בקר לקראת חיבור API חיצוני.
 * מדמה קריאת LLM: הפלט מובנה ונגזר מנתוני המטופל בלבד.
 */

import type { BodyArea, ExerciseSession, PainRecord, Patient, PatientExercise } from '../types';
import { bodyAreaLabels } from '../types';
import type { ClinicalTip, TipBodyContext } from '../data/clinicalTips';
import { CLINICAL_TIPS } from '../data/clinicalTips';

export type { TipBodyContext } from '../data/clinicalTips';

export interface PatientProgressPayload {
  patientId: string;
  displayName: string;
  firstName: string;
  primaryBodyArea: BodyArea;
  painHistory: PainRecord[];
  sessionHistory: ExerciseSession[];
  currentStreak: number;
  exercisesInPlan: PatientExercise[];
  /** מוכן לשליחה ל-API עתידי */
  exportForApi: Record<string, unknown>;
}

export type PainTrendLabel = 'increasing' | 'decreasing' | 'stable' | 'insufficient_data';

export interface PatientProgressAnalysis {
  /** סימולציית מודל: גרסת לוגיקה פנימית */
  reasoningModelVersion: string;
  painTrend: PainTrendLabel;
  avgPainRecent: number | null;
  avgPainOlder: number | null;
  avgDifficultyRecent: number | null;
  completionRateRecent: number | null;
  /** יחס כאב–קושי–השלמה — תמצית פנימית */
  relationshipSummaryHebrew: string;
  /** האם מותר לקדם עומס (חזרות/סטים) לפי כאב ומגמה */
  allowExerciseLoadIncrease: boolean;
  /** סירוב קליני בעברית (אם allowExerciseLoadIncrease === false) */
  refusalExplanationHebrew?: string;
  /** האם לשלוח התראה למטפל (בקשת מטופל לא תואמת נתונים) */
  suggestTherapistClinicalAlert: boolean;
  therapistAlertDetailHebrew?: string;
}

const MODEL_VERSION = 'guardian-reasoning-v1';

const CLINICAL_ALERT_STANDARD =
  'ה-AI זיהה בקשת מטופל לשינוי שאינה תואמת את נתוני הכאב. נדרשת החלטת מטפל.';

export function getClinicalAlertStandardMessage(): string {
  return CLINICAL_ALERT_STANDARD;
}

function firstNameFrom(full: string): string {
  const p = full.trim().split(/\s+/);
  return p[0] ?? full;
}

function bodyAreaToTipContext(area: BodyArea): TipBodyContext {
  if (area.startsWith('knee')) return 'knee';
  if (area.startsWith('shoulder')) return 'shoulder';
  if (area.startsWith('back')) return 'back';
  if (area.startsWith('hip')) return 'hip';
  if (area.startsWith('ankle')) return 'ankle';
  if (area === 'neck') return 'neck';
  return 'general';
}

/** בונה מפתח נתונים אחיד לניתוח ול-API עתידי */
export function buildPatientProgressPayload(
  patient: Patient,
  exercises: PatientExercise[] = []
): PatientProgressPayload {
  const painHistory = patient.analytics.painHistory;
  const sessionHistory = patient.analytics.sessionHistory;

  return {
    patientId: patient.id,
    displayName: patient.name,
    firstName: firstNameFrom(patient.name),
    primaryBodyArea: patient.primaryBodyArea,
    painHistory,
    sessionHistory,
    currentStreak: patient.currentStreak,
    exercisesInPlan: exercises,
    exportForApi: {
      patientId: patient.id,
      primaryBodyArea: patient.primaryBodyArea,
      streak: patient.currentStreak,
      painPoints: painHistory.length,
      sessionPoints: sessionHistory.length,
      avgOverallPain: patient.analytics.averageOverallPain,
      avgDifficulty: patient.analytics.averageDifficulty,
      planExerciseCount: exercises.length,
    },
  };
}

function slicePainRecentOlder(records: PainRecord[], area: BodyArea | null) {
  const filtered = area ? records.filter((r) => r.bodyArea === area) : [...records];
  if (filtered.length < 2) {
    return { recent: [] as PainRecord[], older: [] as PainRecord[] };
  }
  const sorted = [...filtered].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const half = Math.max(1, Math.floor(sorted.length / 2));
  const older = sorted.slice(0, half);
  const recent = sorted.slice(half);
  return { recent, older };
}

function avgPain(records: PainRecord[]): number | null {
  if (records.length === 0) return null;
  return records.reduce((s, r) => s + r.painLevel, 0) / records.length;
}

function classifyPainTrend(avgRecent: number | null, avgOlder: number | null): PainTrendLabel {
  if (avgRecent == null || avgOlder == null) return 'insufficient_data';
  const delta = avgRecent - avgOlder;
  if (delta > 0.75) return 'increasing';
  if (delta < -0.75) return 'decreasing';
  return 'stable';
}

function recentCompletionRates(sessions: ExerciseSession[], n: number): number[] {
  const slice = sessions.slice(-n);
  return slice.map((s) =>
    s.totalExercises > 0 ? s.exercisesCompleted / s.totalExercises : 0
  );
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

/**
 * ניתוח מרכזי — מעריך כאב, קושי והשלמת תרגילים ומפיק החלטות קליניות מבוקרות.
 */
export function analyzePatientProgress(data: PatientProgressPayload): PatientProgressAnalysis {
  const { recent, older } = slicePainRecentOlder(
    data.painHistory,
    data.primaryBodyArea
  );
  const avgPainRecent = avgPain(recent);
  const avgPainOlder = avgPain(older);
  const painTrend = classifyPainTrend(avgPainRecent, avgPainOlder);

  const lastSess = data.sessionHistory.slice(-5);
  const completionRates = recentCompletionRates(data.sessionHistory, 5);
  const completionRateRecent = avg(completionRates);
  const diffRatings = lastSess.map((s) => s.difficultyRating);
  const avgDifficultyRecent = avg(diffRatings);

  const highPain = avgPainRecent != null && avgPainRecent >= 5.5;
  const veryHighPain = avgPainRecent != null && avgPainRecent >= 7;
  const increasing = painTrend === 'increasing';

  const relationshipSummaryHebrew = [
    `מגמת כאב באזור ${bodyAreaLabels[data.primaryBodyArea]}: ${painTrend === 'insufficient_data' ? 'אין מספיק נתונים' : painTrend === 'increasing' ? 'עלייה' : painTrend === 'decreasing' ? 'ירידה' : 'יציבה'}.`,
    avgPainRecent != null ? `ממוצע כאב בתקופה האחרונה: ${avgPainRecent.toFixed(1)}/10.` : '',
    completionRateRecent != null
      ? `שיעור השלמה באימונים האחרונים (ממוצע): ${Math.round(completionRateRecent * 100)}%.`
      : '',
    avgDifficultyRecent != null
      ? `קושי מדווח ממוצע (אימונים אחרונים): ${avgDifficultyRecent.toFixed(1)}/5.`
      : '',
  ]
    .filter(Boolean)
    .join(' ');

  let allowExerciseLoadIncrease = true;
  let refusalExplanationHebrew: string | undefined;
  let suggestTherapistClinicalAlert = false;
  let therapistAlertDetailHebrew: string | undefined;

  if (painTrend === 'insufficient_data' && data.painHistory.length < 3) {
    allowExerciseLoadIncrease = false;
    refusalExplanationHebrew =
      'אין מספיק דיווחי כאב כדי לאשר שינוי בעומס בבטחה. המשיכו לפי תוכנית המטפל עד שייצברו עוד נתונים.';
  } else if (increasing || veryHighPain) {
    allowExerciseLoadIncrease = false;
    refusalExplanationHebrew = increasing
      ? 'מגמת הכאב באזור המטופל בעליה ביחס לתקופה הקודמת. מבחינה קלינית אין להגביר עומס כרגע — זה עלול להחמיר תסמינים. מומלץ לשמור על רמת התרגול הנוכחית ולעדכן את המטפל.'
      : 'רמות הכאב המדווחות גבוהות יחסית. הגדלת חזרות או עומס ללא ליווי מקצועי אינה מומלצת. נא להמשיך לפי הנחיות המטפל או לפנות אליו.';
    suggestTherapistClinicalAlert = true;
    therapistAlertDetailHebrew = increasing
      ? `המטופל ביקש קידום/שינוי בעוד שמגמת הכאב ב${bodyAreaLabels[data.primaryBodyArea]} עולה (ממוצע אחרון ${avgPainRecent?.toFixed(1) ?? '—'} לעומת קודם).`
      : `המטופל ביקש שינוי בעומס בעוד שממוצע הכאב האחרון גבוה (${avgPainRecent?.toFixed(1) ?? '—'}/10).`;
  } else if (highPain && painTrend === 'stable') {
    allowExerciseLoadIncrease = false;
    refusalExplanationHebrew =
      'הכאב נשאר ברמה בינונית–גבוהה ללא שיפור ברור. לפני הגדלת עומס נדרשת הערכה של המטפל כדי לא לסכן את התהליך.';
    suggestTherapistClinicalAlert = true;
    therapistAlertDetailHebrew = `כאב ממוצע יציב אך מורגש (${avgPainRecent?.toFixed(1)}/10) לצד בקשה לשינוי תרגול.`;
  }

  return {
    reasoningModelVersion: MODEL_VERSION,
    painTrend,
    avgPainRecent,
    avgPainOlder,
    avgDifficultyRecent,
    completionRateRecent,
    relationshipSummaryHebrew,
    allowExerciseLoadIncrease,
    refusalExplanationHebrew,
    suggestTherapistClinicalAlert,
    therapistAlertDetailHebrew,
  };
}

/** בדיקת בקשת שינוי תרגול מול ניתוח שכבר חושב */
export function evaluateExerciseChangeRequest(
  analysis: PatientProgressAnalysis,
  intentDescriptionHebrew: string
): {
  permitted: boolean;
  patientMessageHebrew: string;
  fireTherapistAlert: boolean;
} {
  if (analysis.allowExerciseLoadIncrease) {
    return {
      permitted: true,
      patientMessageHebrew: '',
      fireTherapistAlert: false,
    };
  }
  return {
    permitted: false,
    patientMessageHebrew:
      (analysis.refusalExplanationHebrew ?? 'לא ניתן לאשר את השינוי כרגע מבחינה קלינית.') +
      (intentDescriptionHebrew ? ` (${intentDescriptionHebrew})` : ''),
    fireTherapistAlert: analysis.suggestTherapistClinicalAlert,
  };
}

/** זיהוי כוונת שינוי עומס בשאלת המטופל */
export function detectExerciseChangeIntent(text: string): boolean {
  const t = text.trim().toLowerCase();
  return (
    /(הגביר|העלא|עוד\s*חזרות|עוד\s*סטים|להגביר|לשנות\s*תרגיל|שינוי\s*תרגיל|להחליף\s*תרגיל|עומס\s*גבוה|קשה\s*לי\s*מדי\s*פשוט|תגביר|תעלה)/i.test(
      t
    ) || /(increase|more\s*reps)/i.test(t)
  );
}

/** פסקה מותאמת לדוח כאב — מבוססת ניתוח + פיצול יציבות/כוח מתוכנית */
export function buildPainReportNarrative(
  patient: Patient,
  exercises: PatientExercise[],
  analysis: PatientProgressAnalysis
): string {
  const name = firstNameFrom(patient.name);
  const area = bodyAreaLabels[patient.primaryBodyArea];
  const holdCount = exercises.filter((e) => (e.holdSeconds ?? 0) > 0).length;
  const repCount = exercises.filter((e) => (e.patientReps ?? 0) > 0 && !(e.holdSeconds ?? 0)).length;

  const completionPct =
    analysis.completionRateRecent != null
      ? Math.round(analysis.completionRateRecent * 100)
      : null;
  const diff = analysis.avgDifficultyRecent;

  let stabilityClause = '';
  let strengthClause = '';

  if (holdCount > 0 && repCount > 0) {
    if (diff != null && diff <= 2.5 && (analysis.avgPainRecent ?? 10) <= 4) {
      stabilityClause = `השבוע אזור ה${area} שלך תפקד מצוין בתרגילי היציבות וההחזקה (לפי דיווחי הקושי הנמוכים יחד עם כאב נשלט), `;
    } else if (diff != null && diff <= 3) {
      stabilityClause = `בתרגילי יציבות והחזקה נראה שהמצב ב${area} נשלט יחסית טוב, `;
    } else {
      stabilityClause = `בתרגילי יציבות עדיין כדאי לשמור על איכות תנועה לפני שמוסיפים נפח, `;
    }

    if (diff != null && diff >= 4 && completionPct != null && completionPct >= 70) {
      strengthClause = `אבל בתרגילי הכוח והחזרות הדיווחים מראים שאתה מגיע לקצה היכולת — בוא נשמור על הקיים לעוד יומיים וניתן לגוף להסתגל.`;
    } else if (diff != null && diff >= 4) {
      strengthClause = `ובתרגילי כוח דיווח הקושי גבוה יחסית; עדיף לא להגביר עומס לפני שיחה עם המטפל.`;
    } else {
      strengthClause = `ובתרגילי כוח אפשר להמשיך בזהירות לפי התוכנית הנוכחית.`;
    }
  } else {
    stabilityClause = `לגבי אזור ה${area}, `;
    if (analysis.painTrend === 'decreasing') {
      strengthClause = `מגמת הכאב משתפרת — המשך בעקביות לפי הנחיות המטפל.`;
    } else if (analysis.painTrend === 'increasing') {
      strengthClause = `נרשמת עלייה בכאב — חשוב לשמור על רמת עומס קבועה ולעדכן את המטפל.`;
    } else {
      strengthClause =
        completionPct != null
          ? `שיעור ההשלמה שלך לאחרונה הוא כ-${completionPct}% — זה עוזר לנו לעקוב אחרי ההתאמה בין כאב לקושי.`
          : `נמשיך לעקוב אחרי הדיווחים כדי לכוון את העומס.`;
    }
  }

  return `${name}, ${stabilityClause}${strengthClause}`;
}

/** טיפ קליני רלוונטי לאזור הכאב העיקרי / משני */
export function selectContextualClinicalTip(patient: Patient): ClinicalTip {
  const primaryCtx = bodyAreaToTipContext(patient.primaryBodyArea);
  const areaCounts = new Map<TipBodyContext, number>();
  for (const r of patient.analytics.painHistory) {
    const c = bodyAreaToTipContext(r.bodyArea);
    areaCounts.set(c, (areaCounts.get(c) ?? 0) + 1);
  }
  let secondaryCtx: TipBodyContext = primaryCtx;
  let maxC = 0;
  for (const [c, n] of areaCounts) {
    if (n > maxC) {
      maxC = n;
      secondaryCtx = c;
    }
  }
  const targetCtx = maxC >= 2 ? secondaryCtx : primaryCtx;

  const tagged = CLINICAL_TIPS.filter((t) => (t.bodyContexts ?? ['general']).includes(targetCtx));
  const pool =
    tagged.length > 0
      ? tagged
      : CLINICAL_TIPS.filter((t) => (t.bodyContexts ?? ['general']).includes('general'));
  const finalPool = pool.length > 0 ? pool : CLINICAL_TIPS;
  const seed =
    patient.id.split('').reduce((a, ch) => a + ch.charCodeAt(0), 0) + targetCtx.charCodeAt(0);
  return finalPool[seed % finalPool.length];
}

/**
 * עטיפה אסינכרונית לקראת החלפה ב-fetch ל-API — כרגע מחזירה מיד את אותו ניתוח.
 */
export async function analyzePatientProgressAsync(
  data: PatientProgressPayload
): Promise<PatientProgressAnalysis> {
  return Promise.resolve(analyzePatientProgress(data));
}
