/**
 * Single shared clinical prompt-context builder for Gemini payloads.
 * Modes use field allowlists + max lengths; always compact JSON (no pretty-print).
 */

import type { ClinicalInsightsAggregated } from '../services/clinicalInsightsAggregation';
import type { Patient, SafetyAlert } from '../types';
import { bodyAreaLabels } from '../types';
import type { ClinicalExerciseCatalog } from '../utils/clinicalExerciseCatalog';
import { resolvePatientClinicalIntakeProfile } from '../utils/clinicalIntakeProfileDisplay';
import type { ClinicalProgressInsight } from './clinicalCommandInsight';
import {
  collectPatientPhiTokens,
  sanitizeFreeTextForClinicalAi,
} from './clinicalConsultantContext';
import { formatAdherenceStatus } from './clinicalInsightsNarrative';

export type ClinicalPromptContextMode =
  | 'patientChat'
  | 'therapistConsult'
  | 'treatment'
  | 'smart'
  | 'comparative'
  | 'intake';

/** Compact JSON for prompts — never pretty-print (saves tokens). */
export function compactJson(value: unknown): string {
  return JSON.stringify(value);
}

export function clipText(input: string, maxLen: number): string {
  const s = input.trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

function clipStringList(list: string[], maxItems: number, maxItemLen: number): string[] {
  return list
    .map((x) => clipText(x, maxItemLen))
    .filter(Boolean)
    .slice(0, maxItems);
}

const LIMITS = {
  therapistConsult: {
    freeText: 280,
    painRows: 8,
    alerts: 6,
    romItems: 12,
    goals: 8,
    tests: 10,
  },
  smart: {
    painHistory: 21,
    sessionTimeline: 21,
    daySeries: 21,
    phaseHistory: 8,
    catalogAvailable: 40,
    protocolText: 400,
    prognosis: 400,
    insightText: 320,
  },
  comparative: {
    storyPreview: 240,
    fieldValue: 400,
    changedFields: 48,
    painRows: 10,
    sessions: 8,
  },
} as const;

export type TherapistConsultPromptInput = {
  mode: 'therapistConsult';
  patient: Patient;
  safetyAlertsForPatient: SafetyAlert[];
  exerciseSafetyLocked?: boolean;
};

export type SmartClinicalPromptInput = {
  mode: 'smart';
  aggregated: ClinicalInsightsAggregated;
  patient: Patient;
  progressInsight: ClinicalProgressInsight;
  catalog: ClinicalExerciseCatalog;
  continuationProtocol: string;
  prognosis: string;
};

export type ComparativePromptInput = {
  mode: 'comparative';
  /** Pre-computed structured diff / baselines (already de-identified). */
  payload: Record<string, unknown>;
};

export type CompactRecordPromptInput = {
  mode: 'patientChat' | 'treatment' | 'intake';
  /** Allowlisted record already shaped by the caller. */
  payload: Record<string, unknown>;
};

export type BuildClinicalPromptContextInput =
  | TherapistConsultPromptInput
  | SmartClinicalPromptInput
  | ComparativePromptInput
  | CompactRecordPromptInput;

export type ClinicalPromptContextResult = {
  mode: ClinicalPromptContextMode;
  /** Ready-to-embed prompt text (lines or compact JSON). */
  text: string;
  /** Structured payload when applicable (same object that was stringified). */
  data: Record<string, unknown> | null;
};

function buildTherapistConsultText(input: TherapistConsultPromptInput): string {
  const { patient, safetyAlertsForPatient, exerciseSafetyLocked } = input;
  const knownTokens = collectPatientPhiTokens(patient);
  const lim = LIMITS.therapistConsult;
  const scrub = (s: string) =>
    sanitizeFreeTextForClinicalAi(s, { knownTokens, maxLen: lim.freeText });

  const lines: string[] = [];
  lines.push('הקשר מנותק מזיהוי אישי: ללא שם, כינוי, ת״ז, דוא״ל, שם משתמש פורטל או מזהה מערכת.');
  lines.push(`גיל: ${patient.age}`);
  if (patient.clinicalSex === 'male') {
    lines.push('מין (קליני, אם הוזן): זכר');
  } else if (patient.clinicalSex === 'female') {
    lines.push('מין (קליני, אם הוזן): נקבה');
  } else {
    lines.push('מין (קליני): לא צוין במערכת');
  }

  const demo = scrub(patient.demographicsFreeText ?? '');
  lines.push(
    demo
      ? `תיאור דמוגרפי/תעסוקתי (מנוקה ממזהים טכניים): ${demo}`
      : 'תיאור דמוגרפי/תעסוקתי: לא הוזן טקסט במערכת.'
  );

  lines.push(`מוקד גוף עיקרי בתוכנית: ${bodyAreaLabels[patient.primaryBodyArea]}`);
  const injury = patient.injuryHighlightSegments ?? [];
  if (injury.length > 0) {
    lines.push(`אזורי הדגשה קלינית: ${injury.map((a) => bodyAreaLabels[a]).join(', ')}`);
  }
  const secondary = patient.secondaryClinicalBodyAreas ?? [];
  if (secondary.length > 0) {
    lines.push(`מוקדים משניים: ${secondary.map((a) => bodyAreaLabels[a]).join(', ')}`);
  }

  const avg = patient.analytics.averageOverallPain;
  lines.push(
    `ממוצע כאב כללי בדיווחים: ${Number.isFinite(avg) ? avg.toFixed(1) : '—'}/10`
  );

  const recentPain = patient.analytics.painHistory.slice(-lim.painRows);
  if (recentPain.length > 0) {
    lines.push('דיווחי כאב אחרונים (רמה, אזור, תאריך):');
    for (const r of recentPain) {
      lines.push(`- ${r.painLevel}/10, ${bodyAreaLabels[r.bodyArea]}, ${r.date}`);
    }
  } else {
    lines.push('אין דיווחי כאב שמורים במערכת.');
  }

  lines.push(`דגל אדום פעיל במערכת: ${patient.hasRedFlag ? 'כן' : 'לא'}`);
  lines.push(`מצב נעילת תרגול (בטיחות): ${patient.redFlagActive ? 'כן — נעילה/התרעה' : 'לא'}`);
  if (exerciseSafetyLocked) {
    lines.push('נעילת תרגילים פעילה במערכת (מצב חירום/בטיחות — הושבת תרגול בפורטל).');
  }
  lines.push(`סטטוס תוכנית: ${patient.status}`);

  if (patient.initialIntakeArchive?.extras?.intakeRedFlag) {
    lines.push('באינטייק ראשון סומן חשש/דגל אדום.');
  }

  const intakeProfile = resolvePatientClinicalIntakeProfile(patient);
  const bg =
    intakeProfile?.medical_history?.backgroundDiseases?.trim() ??
    patient.medicalProfileMetadata?.backgroundDiseases?.trim();
  const meds =
    intakeProfile?.medical_history?.chronicMedications?.trim() ??
    patient.medicalProfileMetadata?.chronicMedications?.trim();
  if (bg) lines.push(`מחלות רקע (מאינטייק): ${scrub(bg)}`);
  if (meds) lines.push(`תרופות קבועות (מאינטייק): ${scrub(meds)}`);

  const rom = clipStringList(intakeProfile?.ranges ?? [], lim.romItems, lim.freeText);
  if (rom.length > 0) lines.push(`טווחי תנועה (ROM): ${rom.join('; ')}`);
  const strength = intakeProfile?.muscle_strength?.trim();
  if (strength) lines.push(`כוח שרירים: ${scrub(strength)}`);
  const tests = clipStringList(intakeProfile?.special_tests ?? [], lim.tests, lim.freeText);
  if (tests.length > 0) lines.push(`בדיקות מיוחדות: ${tests.join('; ')}`);
  const goals = clipStringList(intakeProfile?.goals ?? [], lim.goals, lim.freeText);
  if (goals.length > 0) lines.push(`מטרות שיקום: ${goals.join('; ')}`);

  const alerts = [...safetyAlertsForPatient].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  if (alerts.length > 0) {
    lines.push('התראות בטיחות אדומות אחרונות מהמערכת (ניסוח קליני):');
    for (const a of alerts.slice(0, lim.alerts)) {
      lines.push(`- (${a.severity}) ${scrub(a.reasonHebrew)}`);
    }
  }

  return lines.join('\n');
}

function buildSmartClinicalData(input: SmartClinicalPromptInput): Record<string, unknown> {
  const { aggregated: agg, patient, progressInsight, catalog, continuationProtocol, prognosis } =
    input;
  const lim = LIMITS.smart;
  const streak = agg.activeStreak;
  const joinDate = patient.joinDate?.slice(0, 10) ?? null;

  return {
    clinicalToday: agg.clinicalToday,
    primaryBodyArea: agg.primaryBodyArea,
    primaryBodyAreaLabel: bodyAreaLabels[agg.primaryBodyArea],
    accountJoinDate: joinDate,
    actualStartDate: agg.actualStartDate,
    daysSinceProtocolStart: agg.daysSinceProtocolStart,
    currentProtocolName: agg.currentProtocolName,
    currentProtocolWeek: agg.currentProtocolWeek,
    chronologicalProtocolWeek: agg.chronologicalProtocolWeek,
    protocolProgressionFrozen: agg.protocolProgressionFrozen,
    protocolFreezeReason: agg.protocolFreezeReason,
    continuationProtocol: clipText(continuationProtocol, lim.protocolText) || null,
    intakePrognosis: clipText(prognosis, lim.prognosis) || null,
    trainingPhaseHistory: agg.trainingPhaseHistory.slice(-lim.phaseHistory),
    activeStreak: {
      activeStreakStart: streak.activeStreakStart,
      activeStreakDayCount: streak.activeStreakDayCount,
      lastGapDays: streak.lastGapDays,
      priorStreak: streak.priorStreak,
    },
    priorStreakStats: agg.priorStreakStats,
    activePhaseStats: {
      targetWorkoutsPerWeek: agg.targetWorkoutsPerWeek,
      adherencePercent: agg.adherencePercent,
      adherenceStatus: formatAdherenceStatus(agg.adherencePercent),
      adherenceBeforeGapPenalty: agg.adherenceBeforeGapPenalty,
      hasRecentGap: agg.hasRecentGap,
      hasCriticalGaps: agg.hasCriticalGaps,
      longestGapDays: agg.longestGapDays,
      adherenceCountableDays: agg.adherenceCountableDays,
      painTrendPercent: agg.painTrendPercent,
      avgPainPrimary: agg.avgPainActiveStreakPrimary,
      shortStreakWarning: streak.activeStreakDayCount > 0 && streak.activeStreakDayCount < 3,
    },
    recentHistoryForClinicalReasoning: {
      sessionTimeline: agg.fullSessionTimeline.slice(-lim.sessionTimeline),
      painHistory: agg.fullPainHistory.slice(-lim.painHistory).map((r) => ({
        date: r.date,
        bodyArea: r.bodyArea,
        pain0to10: r.painLevel,
      })),
    },
    daySeriesActive: agg.daySeriesActive.slice(-lim.daySeries).map((d) => ({
      date: d.date,
      pain0to10: d.pain,
      effort1to5: d.effort1to5,
    })),
    exerciseCatalog: {
      currentPlanExercises: catalog.currentPlanExercises.map((ex) => ({
        id: ex.id,
        name: ex.name,
        reps: ex.patientReps,
        sets: ex.patientSets,
        holdSeconds: ex.holdSeconds,
        targetArea: ex.targetArea,
      })),
      availableCatalogExercises: catalog.availableCatalogExercises
        .slice(0, lim.catalogAvailable)
        .map((ex) => ({
          id: ex.id,
          name: ex.name,
          targetArea: ex.targetArea,
          level: ex.level,
        })),
    },
    systemRecommendation: {
      category: progressInsight.category,
      titleHe: clipText(progressInsight.titleHe, lim.insightText),
      summaryHe: clipText(progressInsight.summaryHe, lim.insightText),
      nextStepHe: clipText(progressInsight.nextStepHe, lim.insightText),
      avgPain7d: progressInsight.avgPain7d,
      currentPain: progressInsight.currentPain,
      compliance3d: progressInsight.compliance3d,
      activeStreakCompliance: progressInsight.activeStreakCompliance,
    },
  };
}

/**
 * Build de-identified / allowlisted prompt context for a Gemini call.
 */
export function buildClinicalPromptContext(
  input: BuildClinicalPromptContextInput
): ClinicalPromptContextResult {
  switch (input.mode) {
    case 'therapistConsult': {
      const text = buildTherapistConsultText(input);
      return { mode: input.mode, text, data: null };
    }
    case 'smart': {
      const data = buildSmartClinicalData(input);
      return { mode: input.mode, text: compactJson(data), data };
    }
    case 'comparative':
    case 'patientChat':
    case 'treatment':
    case 'intake': {
      return {
        mode: input.mode,
        text: compactJson(input.payload),
        data: input.payload,
      };
    }
    default: {
      const _exhaustive: never = input;
      return _exhaustive;
    }
  }
}

/** Limits exported for tests / callers shaping comparative diffs. */
export const CLINICAL_PROMPT_CONTEXT_LIMITS = LIMITS;
