/**
 * איסוף נתונים קליניים למנוע «תובנות AI» — תרגול, כאב, עמידה בתוכנית, אזורי Avatar.
 */

import type {
  BodyArea,
  DailyHistoryEntry,
  ExercisePlan,
  ExerciseSession,
  PainRecord,
  Patient,
  PatientExerciseFinishReport,
  SelfCareSessionReport,
} from '../types';
import { addClinicalDays, clinicalDateToLocalMidnight, toLocalYmd } from '../utils/clinicalCalendar';
import { STRENGTH_EXERCISE_CHAINS } from '../data/strengthExerciseDatabase';

export type ClinicalDayPoint = {
  date: string;
  /** תווית לציר X (יום + תאריך קצר) */
  label: string;
  /** שם יום מלא בעברית לניסוח AI */
  weekdayHe: string;
  pain: number | null;
  /** מאמץ מדווח 1–5 (ממוצע אם יש כמה דיווחים באותו יום) */
  effort1to5: number | null;
};

export type ClinicalInsightsAggregated = {
  patientId: string;
  clinicalToday: string;
  primaryBodyArea: BodyArea;
  /** היסטוריית סשנים כפי שנשמרה באנליטיקה */
  exerciseHistory: ExerciseSession[];
  painRecordsLast7ClinicalDays: PainRecord[];
  /** שינוי יחסי בממוצע כאב (אזור ראשי) בין חציון מוקדם לחציון מאוחר בחלון 7 ימים */
  painTrendPercent: number | null;
  avgPain7dPrimary: number | null;
  avgEffort1to5: number | null;
  compliance: {
    completedSum: number;
    plannedSum: number;
    rate: number | null;
    daysPlanned: number;
  };
  /** אזורים שנבחרו במפת Avatar לפרהאב עצמאי */
  selfSelectedZones: BodyArea[];
  /** אזורי Avatar שאינם חלק מאזורי המוקד הקליני (ראשי + תרגילים בתוכנית) */
  offPlanSelfCareZones: BodyArea[];
  daySeries7: ClinicalDayPoint[];
  selfCareReportsLast7d: SelfCareSessionReport[];
  /** דיווחי self-care באזור שלא בתוכנית, בחלון */
  offPlanSelfCareReportsLast7d: SelfCareSessionReport[];
  /** דגל: כאב מורגש לצד עמידה גבוהה בתוכנית */
  highPainWithStrongCompliance: boolean;
  /** ימים עם דיווח כאב גבוה (≥7) וללא השלמה יחסית */
  highPainLowCompletionDays: number;
};

function strengthExerciseBodyArea(exerciseId: string): BodyArea | null {
  for (const chain of STRENGTH_EXERCISE_CHAINS) {
    if (chain.levels.some((l) => l.id === exerciseId)) return chain.bodyArea;
  }
  return null;
}

function buildAssignedBodyAreas(patient: Patient, plan: ExercisePlan | undefined): Set<BodyArea> {
  const s = new Set<BodyArea>();
  s.add(patient.primaryBodyArea);
  for (const ex of plan?.exercises ?? []) {
    s.add(ex.targetArea);
  }
  return s;
}

function formatDayTickHe(ymd: string): string {
  const d = clinicalDateToLocalMidnight(ymd);
  const w = d.toLocaleDateString('he-IL', { weekday: 'short' });
  const dm = d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' });
  return `${w} ${dm}`;
}

function weekdayLongHe(ymd: string): string {
  return clinicalDateToLocalMidnight(ymd).toLocaleDateString('he-IL', { weekday: 'long' });
}

function clampEffort15(n: number): number {
  const c = Math.min(5, Math.max(1, n));
  return Math.round(c * 10) / 10;
}

function effortRaw1to5ForClinicalDay(
  ymd: string,
  sessionHistory: ExerciseSession[],
  finishReports: PatientExerciseFinishReport[],
  selfCareReports: SelfCareSessionReport[]
): number | null {
  const sess = sessionHistory.find((s) => s.date === ymd);
  if (sess) return clampEffort15(sess.difficultyRating);

  const finishes = finishReports.filter((r) => toLocalYmd(new Date(r.timestamp)) === ymd);
  if (finishes.length > 0) {
    const avg =
      finishes.reduce((sum, r) => sum + r.difficultyScore, 0) / finishes.length;
    return clampEffort15(avg);
  }

  const sc = selfCareReports.filter((r) => r.clinicalDate === ymd);
  if (sc.length > 0) {
    const avg = sc.reduce((sum, r) => sum + r.effortRating, 0) / sc.length;
    return clampEffort15(avg);
  }
  return null;
}

function painForDayPrimary(ymd: string, ph: PainRecord[], primary: BodyArea): number | null {
  const day = ph.filter((r) => r.date === ymd && r.bodyArea === primary);
  if (day.length === 0) return null;
  return day.reduce((s, r) => s + r.painLevel, 0) / day.length;
}

function painTrendPercentInWindow(
  records: PainRecord[],
  primary: BodyArea
): number | null {
  const filtered = records.filter((r) => r.bodyArea === primary);
  if (filtered.length < 2) return null;
  const sorted = [...filtered].sort((a, b) => a.date.localeCompare(b.date));
  const mid = Math.floor(sorted.length / 2) || 1;
  const early = sorted.slice(0, mid);
  const late = sorted.slice(mid);
  const avgEarly = early.reduce((s, r) => s + r.painLevel, 0) / early.length;
  const avgLate = late.reduce((s, r) => s + r.painLevel, 0) / late.length;
  if (avgEarly <= 0.01) return null;
  return ((avgEarly - avgLate) / avgEarly) * 100;
}

export function aggregateClinicalInsights(params: {
  patient: Patient;
  clinicalToday: string;
  plan: ExercisePlan | undefined;
  dailyHistoryForPatient: Record<string, DailyHistoryEntry> | undefined;
  selfSelectedZones: BodyArea[];
  selfCareReports: SelfCareSessionReport[];
  finishReports: PatientExerciseFinishReport[];
}): ClinicalInsightsAggregated {
  const { patient, clinicalToday, plan, dailyHistoryForPatient, selfSelectedZones, selfCareReports, finishReports } =
    params;

  const start7 = addClinicalDays(clinicalToday, -6);
  const exerciseHistory = [...patient.analytics.sessionHistory].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const painInWindow = patient.analytics.painHistory.filter(
    (r) => r.date >= start7 && r.date <= clinicalToday
  );

  const assigned = buildAssignedBodyAreas(patient, plan);
  const offPlanSelfCareZones = selfSelectedZones.filter((z) => !assigned.has(z));

  const patientFinishes = finishReports.filter((r) => r.patientId === patient.id);
  const patientSelfCare = selfCareReports.filter((r) => r.patientId === patient.id);

  const selfCareReportsLast7d = patientSelfCare.filter(
    (r) => r.clinicalDate >= start7 && r.clinicalDate <= clinicalToday
  );

  const offPlanSelfCareReportsLast7d = selfCareReportsLast7d.filter((r) => {
    const area = strengthExerciseBodyArea(r.exerciseId);
    return area != null && !assigned.has(area);
  });

  const plannedPerDay = plan?.exercises.length ?? 0;
  let completedSum = 0;
  let plannedSum = 0;

  for (let i = 0; i < 7; i++) {
    const ymd = addClinicalDays(start7, i);
    if (plannedPerDay <= 0) continue;
    const entry = dailyHistoryForPatient?.[ymd];
    const done = entry?.exercisesCompleted ?? 0;
    completedSum += done;
    plannedSum += plannedPerDay;
  }

  const complianceRate = plannedSum > 0 ? completedSum / plannedSum : null;

  const primary = patient.primaryBodyArea;
  const primaryPainVals = painInWindow.filter((r) => r.bodyArea === primary).map((r) => r.painLevel);
  const avgPain7dPrimary =
    primaryPainVals.length > 0
      ? primaryPainVals.reduce<number>((a, b) => a + b, 0) / primaryPainVals.length
      : null;

  const painTrendPercent = painTrendPercentInWindow(painInWindow, primary);

  const daySeries7: ClinicalDayPoint[] = [];
  const effortVals: number[] = [];
  for (let i = 0; i < 7; i++) {
    const ymd = addClinicalDays(start7, i);
    const pain = painForDayPrimary(ymd, patient.analytics.painHistory, primary);
    const effort1to5 = effortRaw1to5ForClinicalDay(ymd, exerciseHistory, patientFinishes, patientSelfCare);
    if (effort1to5 != null) effortVals.push(effort1to5);
    daySeries7.push({
      date: ymd,
      label: formatDayTickHe(ymd),
      weekdayHe: weekdayLongHe(ymd),
      pain,
      effort1to5,
    });
  }

  const avgEffort1to5 =
    effortVals.length > 0 ? effortVals.reduce((a, b) => a + b, 0) / effortVals.length : null;

  const highPainWithStrongCompliance =
    avgPain7dPrimary != null &&
    avgPain7dPrimary >= 5.5 &&
    complianceRate != null &&
    complianceRate >= 0.82;

  let highPainLowCompletionDays = 0;
  for (let i = 0; i < 7; i++) {
    const ymd = addClinicalDays(start7, i);
    const pains = patient.analytics.painHistory.filter((r) => r.date === ymd && r.bodyArea === primary);
    const maxP = pains.length ? Math.max(...pains.map((p) => p.painLevel)) : 0;
    const entry = dailyHistoryForPatient?.[ymd];
    const planned = plannedPerDay;
    const done = entry?.exercisesCompleted ?? 0;
    if (maxP >= 7 && planned > 0 && done / planned < 0.34) {
      highPainLowCompletionDays += 1;
    }
  }

  return {
    patientId: patient.id,
    clinicalToday,
    primaryBodyArea: primary,
    exerciseHistory,
    painRecordsLast7ClinicalDays: painInWindow,
    painTrendPercent,
    avgPain7dPrimary,
    avgEffort1to5,
    compliance: {
      completedSum,
      plannedSum,
      rate: complianceRate,
      daysPlanned: plannedPerDay > 0 ? 7 : 0,
    },
    selfSelectedZones: [...selfSelectedZones],
    offPlanSelfCareZones,
    daySeries7,
    selfCareReportsLast7d,
    offPlanSelfCareReportsLast7d,
    highPainWithStrongCompliance,
    highPainLowCompletionDays,
  };
}
