/**
 * Stream 2 — Gemini clinical narrative (v3 strict JSON). Stream 1 facts are read-only in payload.
 */

import type { ClinicalInsightsAggregated } from '../services/clinicalInsightsAggregation';
import type { Patient } from '../types';
import { bodyAreaLabels } from '../types';
import { geminiGenerateText, getGeminiApiKey } from './geminiClient';
import { parseJsonObject } from './geminiClinicalIntake';
import type { ClinicalProgressInsight } from './clinicalCommandInsight';
import {
  formatAdherenceStatus,
  injectServerClinicalFacts,
  normalizeUnifiedClinicalNarrative,
  type UnifiedClinicalNarrative,
} from './clinicalInsightsNarrative';
import type { ClinicalExerciseCatalog } from '../utils/clinicalExerciseCatalog';
import { clinicalDaysBetween } from '../utils/patientProgressChartData';

export { getGeminiApiKey, GeminiRateLimitedError } from './geminiClient';

const LOG_PREFIX = '[GeminiSmartClinicalCenter]';

const CLINICAL_ENGINE_PROMPT = `You are a machine-readable Clinical Engine. Output ONLY a single raw JSON object.

STRICT RULES — NO EXCEPTIONS:
1. Return ONLY raw JSON. NO markdown. NO code fences. NO explanations. NO conversational filler before or after the JSON.
2. If status is 'Modify', you MUST return a populated 'modifications' array with all required fields.
3. If 'modifications' is empty, status is considered 'Keep'.
4. All clinical labels, summaries, actionItems, and prognosis MUST be in HEBREW.
5. DATA INTEGRITY: activePhaseStats.adherencePercent and activePhaseStats.hasRecentGap are server-computed. DO NOT recalculate. Echo adherencePercent as adherenceStatus (e.g. "82%").
6. Exercise IDs in modifications MUST come from exerciseCatalog in the payload only.
7. Do NOT suggest modifications, tests, or actions that contradict continuationProtocol or intakePrognosis.

SCHEMA (output exactly this shape):
{
  "adherenceStatus": "X%",
  "summary": { "consistency": "Short string", "painLoad": "Short string" },
  "actionItems": ["Short bullet"],
  "modifications": [
    { "type": "REPLACE" | "REMOVE" | "ADD" | "LOAD_ADJUST", "id": "...", "newId": "...", "label": "...", "reps": null, "sets": null }
  ],
  "prognosis": "One short sentence."
}`;

function logInfo(message: string, detail?: Record<string, unknown>): void {
  if (detail) console.info(`${LOG_PREFIX} ${message}`, detail);
  else console.info(`${LOG_PREFIX} ${message}`);
}

/** Strip markdown code fences and other non-JSON wrappers from model output. */
export function stripMarkdownCodeFences(text: string): string {
  return text.replace(/```json|```/g, '').trim();
}

function aggregatedPayloadForPrompt(
  agg: ClinicalInsightsAggregated,
  patient: Patient,
  catalog: ClinicalExerciseCatalog,
  continuationProtocol: string,
  prognosis: string
): Record<string, unknown> {
  const streak = agg.activeStreak;
  const joinDate = patient.joinDate?.slice(0, 10) ?? null;
  const daysSinceJoin =
    joinDate != null ? clinicalDaysBetween(joinDate, agg.clinicalToday) : null;

  return {
    clinicalToday: agg.clinicalToday,
    primaryBodyArea: agg.primaryBodyArea,
    primaryBodyAreaLabel: bodyAreaLabels[agg.primaryBodyArea],
    accountJoinDate: joinDate,
    daysSinceJoin,
    actualStartDate: agg.actualStartDate,
    continuationProtocol: continuationProtocol || null,
    intakePrognosis: prognosis || null,
    trainingPhaseHistory: agg.trainingPhaseHistory,
    activeStreak: {
      activeStreakStart: streak.activeStreakStart,
      activeStreakDayCount: streak.activeStreakDayCount,
      lastGapDays: streak.lastGapDays,
      priorStreak: streak.priorStreak,
    },
    priorStreakStats: agg.priorStreakStats,
    activePhaseStats: {
      adherencePercent: agg.adherencePercent,
      adherenceStatus: formatAdherenceStatus(agg.adherencePercent),
      hasRecentGap: agg.hasRecentGap,
      adherenceCountableDays: agg.adherenceCountableDays,
      adherenceCompletedSum: agg.adherenceCompletedSum,
      adherencePlannedSum: agg.adherencePlannedSum,
      painTrendPercent: agg.painTrendPercent,
      avgPainPrimary: agg.avgPainActiveStreakPrimary,
      avgEffort1to5: agg.avgEffort1to5,
      shortStreakWarning: streak.activeStreakDayCount > 0 && streak.activeStreakDayCount < 3,
    },
    fullHistoryForClinicalReasoning: {
      fullSessionTimeline: agg.fullSessionTimeline,
      fullPainHistory: agg.fullPainHistory.map((r) => ({
        date: r.date,
        bodyArea: r.bodyArea,
        pain0to10: r.painLevel,
      })),
      trainingPhaseHistory: agg.trainingPhaseHistory,
      priorStreakStats: agg.priorStreakStats,
    },
    daySeriesActive: agg.daySeriesActive.map((d) => ({
      date: d.date,
      pain0to10: d.pain,
      effort1to5: d.effort1to5,
    })),
    selfSelectedZoneLabels: agg.selfSelectedZones.map((a) => bodyAreaLabels[a]),
    exerciseCatalog: catalog,
  };
}

export async function analyzeSmartClinicalCenterWithGemini(params: {
  aggregated: ClinicalInsightsAggregated;
  patient: Patient;
  progressInsight: ClinicalProgressInsight;
  catalog: ClinicalExerciseCatalog;
  continuationProtocol: string;
  prognosis: string;
}): Promise<UnifiedClinicalNarrative> {
  if (!getGeminiApiKey()) {
    throw new Error('Missing Supabase / gemini-proxy AI setup');
  }

  const streakDays = params.aggregated.activeStreak.activeStreakDayCount;
  const shortStreakRule =
    streakDays > 0 && streakDays < 3
      ? `\nAdditional: Active streak is short (${streakDays} days). Do not praise perfect adherence; acknowledge recent restart if hasRecentGap is true.`
      : '';

  const systemInstruction = `${CLINICAL_ENGINE_PROMPT}${shortStreakRule}`;

  const userText = `Patient data (JSON):
${JSON.stringify(
  aggregatedPayloadForPrompt(
    params.aggregated,
    params.patient,
    params.catalog,
    params.continuationProtocol,
    params.prognosis
  ),
  null,
  2
)}

System recommendation:
${JSON.stringify(params.progressInsight, null, 2)}`;

  logInfo('Starting smart clinical center analysis', {
    patientId: params.aggregated.patientId,
    adherencePercent: params.aggregated.adherencePercent,
    hasRecentGap: params.aggregated.hasRecentGap,
  });

  const responseText = await geminiGenerateText({
    systemInstruction,
    userText,
    temperature: 0.22,
    responseMimeType: 'application/json',
    logPrefix: LOG_PREFIX,
    logDetail: { patientId: params.aggregated.patientId },
  });

  const parsed = parseJsonObject(stripMarkdownCodeFences(responseText));
  const normalized = normalizeUnifiedClinicalNarrative(parsed);
  return injectServerClinicalFacts(normalized, {
    adherencePercent: params.aggregated.adherencePercent,
    hasRecentGap: params.aggregated.hasRecentGap,
  });
}
