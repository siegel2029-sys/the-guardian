/**
 * Stream 2 — Physio-Shield Clinical Narrative Engine (Gemini).
 */

import type { ClinicalInsightsAggregated } from '../services/clinicalInsightsAggregation';
import type { Patient } from '../types';
import { bodyAreaLabels } from '../types';
import { geminiGenerateText, getGeminiApiKey } from './geminiClient';
import { parseJsonObject } from './geminiClinicalIntake';
import type { ClinicalProgressInsight } from './clinicalCommandInsight';
import {
  formatAdherenceStatus,
  finalizeClinicalModifications,
  injectServerClinicalFacts,
  normalizeUnifiedClinicalNarrative,
  type UnifiedClinicalNarrative,
} from './clinicalInsightsNarrative';
import type { ClinicalExerciseCatalog } from '../utils/clinicalExerciseCatalog';
import { clinicalDaysBetween } from '../utils/patientProgressChartData';

export { getGeminiApiKey, GeminiRateLimitedError } from './geminiClient';

const LOG_PREFIX = '[GeminiSmartClinicalCenter]';

const CLINICAL_NARRATIVE_ENGINE_PROMPT = `You are the Physio-Shield Clinical Narrative Engine.
Output ONLY a single raw JSON object — NO markdown, NO code fences, NO prefixes, NO extra keys.

RULES:
1. Return EXACTLY this structure and NOTHING else.
2. All label and rationale text MUST be in Hebrew.
3. Use id/newId from exerciseCatalog: id from currentPlanExercises, newId from availableCatalogExercises.
4. If no plan changes needed, return { "modifications": [] }.
5. EXPLICIT NAMING: For EVERY modification (REPLACE, REMOVE, ADD, LOAD_ADJUST), the label and rationale MUST explicitly state the name of the target exercise. Never use generic terms like "הפחתת עומס". Instead write explicitly: "הפחתת עומס בתרגיל פנדולום". If multiple exercises are involved, specify them clearly.
6. PROTOCOL ALIGNMENT: You are provided with currentProtocolName and currentProtocolWeek. ALL proposed modifications MUST strictly adhere to the physiological healing timeframes for this specific week. Do not suggest aggressive progressions that violate the protocol.
7. CONTRADICTION GUARD: If you output a REPLACE or REMOVE action for a specific exercise ID, you MUST NOT include a LOAD_ADJUST action for that same ID in the same response.
8. REPLACE GUARD: If type is REPLACE, you MUST select a valid newId from exerciseCatalog.availableCatalogExercises.
9. LOAD_ADJUST GUARD: Include raw reps and/or sets numbers in the JSON fields. Do NOT write "increase", "decrease", "הגברה", or "הפחתה" in the label — the system calculates direction dynamically.
10. RATIONALE REQUIRED: You MUST provide a rationale field for EVERY modification. The rationale MUST be extremely concise, limited to a MAXIMUM of 1 to 2 short sentences. Use sharp, professional clinical Hebrew. Do not write long paragraphs or over-explain. (Example of acceptable length: "המטופל מציג עמידה מלאה ביעדים ללא כאב. לכן נעלה את העומס כדי לאתגר את השריר"). Never omit rationale.
11. Do NOT contradict continuationProtocol or intakePrognosis in the payload.

JSON OUTPUT SCHEMA:
{
  "modifications": [
    {
      "type": "REPLACE" | "REMOVE" | "ADD" | "LOAD_ADJUST",
      "id": string | null,
      "newId": string | null,
      "reps": number | null,
      "sets": number | null,
      "label": string,
      "rationale": "1–2 short sentences in Hebrew (concise clinical WHY)"
    }
  ]
}

Every modification object MUST include rationale (non-empty; max 1–2 short Hebrew sentences).`;

/** Strip markdown code fences and other non-JSON wrappers from model output. */
export function stripMarkdownCodeFences(text: string): string {
  return text.replace(/```json|```/g, '').trim();
}

function logInfo(message: string, detail?: Record<string, unknown>): void {
  if (detail) console.info(`${LOG_PREFIX} ${message}`, detail);
  else console.info(`${LOG_PREFIX} ${message}`);
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
    daysSinceProtocolStart: agg.daysSinceProtocolStart,
    currentProtocolName: agg.currentProtocolName,
    currentProtocolWeek: agg.currentProtocolWeek,
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
      painTrendPercent: agg.painTrendPercent,
      avgPainPrimary: agg.avgPainActiveStreakPrimary,
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
    },
    daySeriesActive: agg.daySeriesActive.map((d) => ({
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
      availableCatalogExercises: catalog.availableCatalogExercises.map((ex) => ({
        id: ex.id,
        name: ex.name,
        targetArea: ex.targetArea,
        level: ex.level,
      })),
    },
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
      ? `\nNote: Active streak is short (${streakDays} days). Prefer empty modifications unless clinically necessary.`
      : '';

  const systemInstruction = `${CLINICAL_NARRATIVE_ENGINE_PROMPT}${shortStreakRule}`;

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

System recommendation (reference only — output modifications JSON only):
${JSON.stringify(params.progressInsight, null, 2)}`;

  logInfo('Starting smart clinical center analysis', {
    patientId: params.aggregated.patientId,
    adherencePercent: params.aggregated.adherencePercent,
    hasRecentGap: params.aggregated.hasRecentGap,
  });

  const responseText = await geminiGenerateText({
    systemInstruction,
    userText,
    temperature: 0.2,
    responseMimeType: 'application/json',
    logPrefix: LOG_PREFIX,
    logDetail: { patientId: params.aggregated.patientId },
  });

  const parsed = parseJsonObject(stripMarkdownCodeFences(responseText));
  const normalized = normalizeUnifiedClinicalNarrative(parsed);
  const finalized = {
    ...normalized,
    modifications: finalizeClinicalModifications(normalized.modifications, params.catalog),
  };
  return injectServerClinicalFacts(finalized, {
    adherencePercent: params.aggregated.adherencePercent,
    hasRecentGap: params.aggregated.hasRecentGap,
  });
}
