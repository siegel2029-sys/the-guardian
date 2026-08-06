/**
 * איסוף נתונים קליניים למנוע «תובנות AI» — מסלול פעיל, כאב, עמידה, אזורי Avatar.
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
  TreatmentProtocolWeek,
} from '../types';
import { clinicalDateToLocalMidnight, toLocalYmd } from '../utils/clinicalCalendar';
import { STRENGTH_EXERCISE_CHAINS } from '../data/strengthExerciseDatabase';
import {
  eachClinicalDayInRange,
  resolveClinicalActiveStreak,
  type ClinicalActiveStreakContext,
  type TrainingPhaseSegment,
} from '../utils/clinicalActiveStreak';
import { computeGraceAwareAdherence, computeGapAwareWeeklyAdherence } from '../utils/clinicalAdherence';
import { clampTargetWorkoutsPerWeek } from '../utils/targetWorkoutsPerWeek';
import { collectPatientSessionDates } from '../utils/collectPatientSessionDates';
import { computeClinicalProtocolContext, resolveProtocolStartDateForPatient } from '../utils/clinicalProtocolWeek';
import { effortToScale10 } from '../utils/effortScale';

export type ClinicalDayPoint = {
  date: string;
  label: string;
  weekdayHe: string;
  pain: number | null;
  /** Effort / RPE on 1–10 (legacy field name kept for prompt JSON compatibility). */
  effort1to5: number | null;
};

export type PriorStreakStats = {
  startDate: string;
  endDate: string;
  sessionDayCount: number;
  avgComplianceRate: number | null;
  avgPainPrimary: number | null;
  avgEffort1to5: number | null;
};

export type ClinicalInsightsAggregated = {
  patientId: string;
  clinicalToday: string;
  primaryBodyArea: BodyArea;
  exerciseHistory: ExerciseSession[];
  activeStreak: ClinicalActiveStreakContext;
  actualStartDate: string | null;
  /** 1-based week within treatment protocol (floor(daysSinceStart / 7) + 1) */
  currentProtocolWeek: number | null;
  /** Pure calendar week ignoring gaps (for diagnostics / AI). */
  chronologicalProtocolWeek: number | null;
  currentProtocolName: string | null;
  daysSinceProtocolStart: number | null;
  /** True when protocol week is stalled behind calendar due to gap / low adherence. */
  protocolProgressionFrozen: boolean;
  protocolFreezeReason: 'critical_gap' | 'low_adherence' | null;
  trainingPhaseHistory: TrainingPhaseSegment[];
  /**
   * Gap-aware weekly adherence vs `targetWorkoutsPerWeek` (rolling lookback + weekly cap + gap penalty).
   * Server hard fact — never invented by the LLM.
   */
  adherencePercent: number | null;
  /** Weekly session target from active plan (1–7). */
  targetWorkoutsPerWeek: number;
  /** Longest consecutive calendar days without a logged session in the adherence lookback. */
  longestGapDays: number;
  /** true when longestGapDays > critical threshold (binge/cram risk). */
  hasCriticalGaps: boolean;
  /** Adherence % before gap penalty (weekly-capped average). */
  adherenceBeforeGapPenalty: number | null;
  /** Session days counted inside the gap-aware lookback window. */
  sessionDaysInLookback: number;
  /** true when current active phase started after a gap > 4 days */
  hasRecentGap: boolean;
  adherenceCountableDays: number;
  adherenceCompletedSum: number;
  adherencePlannedSum: number;
  priorStreakStats: PriorStreakStats | null;
  painRecordsInActiveStreak: PainRecord[];
  fullPainHistory: PainRecord[];
  painTrendPercent: number | null;
  avgPainActiveStreakPrimary: number | null;
  avgEffort1to5: number | null;
  compliance: {
    completedSum: number;
    plannedSum: number;
    rate: number | null;
    daysPlanned: number;
  };
  selfSelectedZones: BodyArea[];
  offPlanSelfCareZones: BodyArea[];
  daySeriesActive: ClinicalDayPoint[];
  fullSessionTimeline: {
    date: string;
    exercisesCompleted: number;
    totalExercises: number;
    difficultyRating: number;
    completionRate: number | null;
  }[];
  selfCareReportsInActiveStreak: SelfCareSessionReport[];
  offPlanSelfCareReportsInActiveStreak: SelfCareSessionReport[];
  highPainWithStrongCompliance: boolean;
  highPainLowCompletionDays: number;
};

const DAY_SERIES_ACTIVE_CAP = 30;

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

function clampEffort110(n: number): number {
  const c = Math.min(10, Math.max(1, n));
  return Math.round(c * 10) / 10;
}

function effortRaw1to10ForClinicalDay(
  ymd: string,
  sessionHistory: ExerciseSession[],
  finishReports: PatientExerciseFinishReport[],
  selfCareReports: SelfCareSessionReport[]
): number | null {
  const sess = sessionHistory.find((s) => s.date === ymd);
  if (sess) {
    return clampEffort110(effortToScale10(sess.difficultyRating, sess.effortScale ?? null));
  }

  const finishes = finishReports.filter((r) => toLocalYmd(new Date(r.timestamp)) === ymd);
  if (finishes.length > 0) {
    const avg =
      finishes.reduce(
        (sum, r) => sum + effortToScale10(r.difficultyScore, r.effortScale ?? null),
        0
      ) / finishes.length;
    return clampEffort110(avg);
  }

  const sc = selfCareReports.filter((r) => r.clinicalDate === ymd);
  if (sc.length > 0) {
    const avg =
      sc.reduce((sum, r) => sum + effortToScale10(r.effortRating, r.effortScale ?? null), 0) /
      sc.length;
    return clampEffort110(avg);
  }
  return null;
}

function painForDayPrimary(ymd: string, ph: PainRecord[], primary: BodyArea): number | null {
  const day = ph.filter((r) => r.date === ymd && r.bodyArea === primary);
  if (day.length === 0) return null;
  return day.reduce((s, r) => s + r.painLevel, 0) / day.length;
}

function painTrendPercentInWindow(records: PainRecord[], primary: BodyArea): number | null {
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

function computeComplianceInRange(
  start: string,
  end: string,
  plannedPerDay: number,
  dailyHistoryForPatient: Record<string, DailyHistoryEntry> | undefined
): { completedSum: number; plannedSum: number; rate: number | null; daysPlanned: number } {
  let completedSum = 0;
  let plannedSum = 0;
  let daysPlanned = 0;

  for (const ymd of eachClinicalDayInRange(start, end)) {
    if (plannedPerDay <= 0) continue;
    const entry = dailyHistoryForPatient?.[ymd];
    const done = entry?.exercisesCompleted ?? 0;
    completedSum += done;
    plannedSum += plannedPerDay;
    daysPlanned += 1;
  }

  return {
    completedSum,
    plannedSum,
    rate: plannedSum > 0 ? completedSum / plannedSum : null,
    daysPlanned,
  };
}

function computeAvgEffortInRange(
  start: string,
  end: string,
  sessionHistory: ExerciseSession[],
  finishReports: PatientExerciseFinishReport[],
  selfCareReports: SelfCareSessionReport[]
): number | null {
  const vals: number[] = [];
  for (const ymd of eachClinicalDayInRange(start, end)) {
    const e = effortRaw1to10ForClinicalDay(ymd, sessionHistory, finishReports, selfCareReports);
    if (e != null) vals.push(e);
  }
  return vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

function computePriorStreakStats(
  prior: { startDate: string; endDate: string; sessionDayCount: number },
  painHistory: PainRecord[],
  primary: BodyArea,
  plannedPerDay: number,
  dailyHistoryForPatient: Record<string, DailyHistoryEntry> | undefined,
  sessionHistory: ExerciseSession[],
  finishReports: PatientExerciseFinishReport[],
  selfCareReports: SelfCareSessionReport[]
): PriorStreakStats {
  const painInPrior = painHistory.filter(
    (r) => r.date >= prior.startDate && r.date <= prior.endDate && r.bodyArea === primary
  );
  const avgPainPrimary =
    painInPrior.length > 0
      ? painInPrior.reduce((s, r) => s + r.painLevel, 0) / painInPrior.length
      : null;
  const compliance = computeComplianceInRange(
    prior.startDate,
    prior.endDate,
    plannedPerDay,
    dailyHistoryForPatient
  );
  const avgEffort1to5 = computeAvgEffortInRange(
    prior.startDate,
    prior.endDate,
    sessionHistory,
    finishReports,
    selfCareReports
  );

  return {
    startDate: prior.startDate,
    endDate: prior.endDate,
    sessionDayCount: prior.sessionDayCount,
    avgComplianceRate: compliance.rate,
    avgPainPrimary,
    avgEffort1to5,
  };
}

export function aggregateClinicalInsights(params: {
  patient: Patient;
  clinicalToday: string;
  plan: ExercisePlan | undefined;
  dailyHistoryForPatient: Record<string, DailyHistoryEntry> | undefined;
  selfSelectedZones: BodyArea[];
  selfCareReports: SelfCareSessionReport[];
  finishReports: PatientExerciseFinishReport[];
  treatmentProtocol?: TreatmentProtocolWeek[] | string;
}): ClinicalInsightsAggregated {
  const {
    patient,
    clinicalToday,
    plan,
    dailyHistoryForPatient,
    selfSelectedZones,
    selfCareReports,
    finishReports,
    treatmentProtocol,
  } = params;

  const painHistory = patient.analytics?.painHistory ?? [];
  const sessionHistoryRaw = patient.analytics?.sessionHistory ?? [];
  const exerciseHistory = [...sessionHistoryRaw].sort((a, b) => a.date.localeCompare(b.date));

  const sessionDates = collectPatientSessionDates({
    patient,
    dailyHistoryForPatient,
  });
  const activeStreak = resolveClinicalActiveStreak(sessionDates, clinicalToday);

  const assigned = buildAssignedBodyAreas(patient, plan);
  const offPlanSelfCareZones = selfSelectedZones.filter((z) => !assigned.has(z));

  const patientFinishes = finishReports.filter((r) => r.patientId === patient.id);
  const patientSelfCare = selfCareReports.filter((r) => r.patientId === patient.id);

  const plannedPerDay = plan?.exercises.length ?? 0;
  const targetWorkoutsPerWeek = clampTargetWorkoutsPerWeek(plan?.targetWorkoutsPerWeek);
  const primary = patient.primaryBodyArea;

  const streakStart = activeStreak.activeStreakStart ?? clinicalToday;
  const streakEnd = clinicalToday;

  const gapAwareAdherence = computeGapAwareWeeklyAdherence({
    clinicalToday,
    sessionDatesChronological: sessionDates,
    targetWorkoutsPerWeek,
  });

  const graceAdherence = computeGraceAwareAdherence({
    activeStreakStart: activeStreak.activeStreakStart,
    clinicalToday,
    sessionDatesChronological: activeStreak.sessionDatesChronological,
    plannedPerDay,
    dailyHistoryForPatient,
  });

  const compliance = {
    completedSum: graceAdherence.adherenceCompletedSum,
    plannedSum: graceAdherence.adherencePlannedSum,
    rate:
      gapAwareAdherence.adherencePercent != null
        ? gapAwareAdherence.adherencePercent / 100
        : graceAdherence.adherencePlannedSum > 0
          ? graceAdherence.adherenceCompletedSum / graceAdherence.adherencePlannedSum
          : null,
    daysPlanned: graceAdherence.adherenceCountableDays,
  };

  const painInActiveStreak = painHistory.filter(
    (r) => r.date >= streakStart && r.date <= streakEnd
  );
  const primaryPainVals = painInActiveStreak
    .filter((r) => r.bodyArea === primary)
    .map((r) => r.painLevel);
  const avgPainActiveStreakPrimary =
    primaryPainVals.length > 0
      ? primaryPainVals.reduce<number>((a, b) => a + b, 0) / primaryPainVals.length
      : null;

  const painTrendPercent = painTrendPercentInWindow(painInActiveStreak, primary);
  const avgEffort1to5 = computeAvgEffortInRange(
    streakStart,
    streakEnd,
    exerciseHistory,
    patientFinishes,
    patientSelfCare
  );

  const priorStreakStats = activeStreak.priorStreak
    ? computePriorStreakStats(
        activeStreak.priorStreak,
        painHistory,
        primary,
        plannedPerDay,
        dailyHistoryForPatient,
        exerciseHistory,
        patientFinishes,
        patientSelfCare
      )
    : null;

  const selfCareReportsInActiveStreak = patientSelfCare.filter(
    (r) => r.clinicalDate >= streakStart && r.clinicalDate <= streakEnd
  );
  const offPlanSelfCareReportsInActiveStreak = selfCareReportsInActiveStreak.filter((r) => {
    const area = strengthExerciseBodyArea(r.exerciseId);
    return area != null && !assigned.has(area);
  });

  const daySeriesActive: ClinicalDayPoint[] = [];
  const allDays = [...eachClinicalDayInRange(streakStart, streakEnd)];
  const cappedDays =
    allDays.length > DAY_SERIES_ACTIVE_CAP
      ? allDays.slice(allDays.length - DAY_SERIES_ACTIVE_CAP)
      : allDays;

  for (const ymd of cappedDays) {
    const pain = painForDayPrimary(ymd, painHistory, primary);
    const effort1to5 = effortRaw1to10ForClinicalDay(
      ymd,
      exerciseHistory,
      patientFinishes,
      patientSelfCare
    );
    daySeriesActive.push({
      date: ymd,
      label: formatDayTickHe(ymd),
      weekdayHe: weekdayLongHe(ymd),
      pain,
      effort1to5,
    });
  }

  const fullSessionTimeline = exerciseHistory.map((s) => ({
    date: s.date,
    exercisesCompleted: s.exercisesCompleted,
    totalExercises: s.totalExercises,
    difficultyRating: s.difficultyRating,
    completionRate: s.totalExercises > 0 ? s.exercisesCompleted / s.totalExercises : null,
  }));

  const highPainWithStrongCompliance =
    avgPainActiveStreakPrimary != null &&
    avgPainActiveStreakPrimary >= 5.5 &&
    gapAwareAdherence.adherencePercent != null &&
    gapAwareAdherence.adherencePercent >= 82;

  let highPainLowCompletionDays = 0;
  for (const ymd of eachClinicalDayInRange(streakStart, streakEnd)) {
    const pains = painHistory.filter((r) => r.date === ymd && r.bodyArea === primary);
    const maxP = pains.length ? Math.max(...pains.map((p) => p.painLevel)) : 0;
    const entry = dailyHistoryForPatient?.[ymd];
    const done = entry?.exercisesCompleted ?? 0;
    if (maxP >= 7 && plannedPerDay > 0 && done / plannedPerDay < 0.34) {
      highPainLowCompletionDays += 1;
    }
  }

  const protocolContext = computeClinicalProtocolContext({
    protocolStartDate: resolveProtocolStartDateForPatient(
      patient,
      activeStreak.actualStartDate
    ),
    clinicalToday,
    treatmentProtocol,
    sessionDatesChronological: sessionDates,
    adherencePercent: gapAwareAdherence.adherencePercent,
    hasCriticalGaps: gapAwareAdherence.hasCriticalGaps,
    longestGapDays: gapAwareAdherence.longestGapDays,
    targetWorkoutsPerWeek,
  });

  return {
    patientId: patient.id,
    clinicalToday,
    primaryBodyArea: primary,
    exerciseHistory,
    activeStreak,
    actualStartDate: activeStreak.actualStartDate,
    currentProtocolWeek: protocolContext.currentProtocolWeek,
    chronologicalProtocolWeek: protocolContext.chronologicalProtocolWeek,
    currentProtocolName: protocolContext.currentProtocolName,
    daysSinceProtocolStart: protocolContext.daysSinceProtocolStart,
    protocolProgressionFrozen: protocolContext.protocolProgressionFrozen,
    protocolFreezeReason: protocolContext.protocolFreezeReason,
    trainingPhaseHistory: activeStreak.trainingPhaseHistory,
    adherencePercent: gapAwareAdherence.adherencePercent,
    targetWorkoutsPerWeek: gapAwareAdherence.targetWorkoutsPerWeek,
    longestGapDays: gapAwareAdherence.longestGapDays,
    hasCriticalGaps: gapAwareAdherence.hasCriticalGaps,
    adherenceBeforeGapPenalty: gapAwareAdherence.adherenceBeforePenalty,
    sessionDaysInLookback: gapAwareAdherence.sessionDaysInLookback,
    hasRecentGap: activeStreak.lastGapDays != null,
    adherenceCountableDays: graceAdherence.adherenceCountableDays,
    adherenceCompletedSum: graceAdherence.adherenceCompletedSum,
    adherencePlannedSum: graceAdherence.adherencePlannedSum,
    priorStreakStats,
    painRecordsInActiveStreak: painInActiveStreak,
    fullPainHistory: [...painHistory].sort((a, b) => a.date.localeCompare(b.date)),
    painTrendPercent,
    avgPainActiveStreakPrimary,
    avgEffort1to5,
    compliance,
    selfSelectedZones: [...selfSelectedZones],
    offPlanSelfCareZones,
    daySeriesActive,
    fullSessionTimeline,
    selfCareReportsInActiveStreak,
    offPlanSelfCareReportsInActiveStreak,
    highPainWithStrongCompliance,
    highPainLowCompletionDays,
  };
}
