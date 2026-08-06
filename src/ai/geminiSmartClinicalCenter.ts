/**
 * Physio-Shield Clinical Narrative Engine (Gemini).
 * Returns Hebrew narrative + optional structured plan recommendations.
 * Recommendations apply only after explicit therapist Approve in the UI.
 */

import type { ClinicalInsightsAggregated } from '../services/clinicalInsightsAggregation';
import type { Patient } from '../types';
import {
  collectPatientPhiTokens,
  patientInitialsFromName,
} from './clinicalConsultantContext';
import { buildClinicalPromptContext } from './buildClinicalPromptContext';
import { geminiGenerateText, getGeminiApiKey } from './geminiClient';
import { parseModelJson, stripMarkdownCodeFences } from './parseModelJson';
import type { ClinicalProgressInsight } from './clinicalCommandInsight';
import {
  ensureCriticalGapRegressionModifications,
  finalizeClinicalModifications,
  injectServerClinicalFacts,
  normalizeUnifiedClinicalNarrative,
  type UnifiedClinicalNarrative,
} from './clinicalInsightsNarrative';
import type { ClinicalExerciseCatalog } from '../utils/clinicalExerciseCatalog';

export { getGeminiApiKey, GeminiRateLimitedError } from './geminiClient';
/** @deprecated Prefer `stripMarkdownCodeFences` from `./parseModelJson`. */
export { stripMarkdownCodeFences } from './parseModelJson';

const LOG_PREFIX = '[GeminiSmartClinicalCenter]';

/** Gaps longer than this force mandatory regression recommendations (rule 14). */
const FORCE_REGRESSION_GAP_DAYS = 7;

const CLINICAL_NARRATIVE_ENGINE_PROMPT = `You are the Physio-Shield Clinical Narrative Engine.
Output ONLY a single raw JSON object — NO markdown, NO code fences, NO prefixes, NO extra keys.

ROLE:
- Provide clinical narrative for a licensed physiotherapist.
- Optionally propose structured, actionable exercise-plan recommendations.
- Recommendations are reviewed manually — never auto-applied.

RULES:
1. Return EXACTLY this structure and NOTHING else.
2. All label / rationale / narrative text MUST be in Hebrew.
3. Use id/newId from exerciseCatalog: id from currentPlanExercises, newId from availableCatalogExercises.
4. If no plan changes are warranted, return "modifications": [].
5. EXPLICIT NAMING: For EVERY modification (REPLACE, REMOVE, ADD, LOAD_ADJUST), label and rationale MUST name the target exercise explicitly.
6. PROTOCOL ALIGNMENT: Respect currentProtocolName / currentProtocolWeek / continuationProtocol / intakePrognosis.
7. CONTRADICTION GUARD: If you output REPLACE or REMOVE for an exercise id, do NOT also LOAD_ADJUST that same id.
8. REPLACE GUARD: type REPLACE requires a valid newId from availableCatalogExercises.
9. LOAD_ADJUST GUARD: include raw reps and/or sets numbers. Do NOT write "increase"/"decrease"/"הגברה"/"הפחתה" in the label — the UI derives direction.
10. RATIONALE REQUIRED: every modification needs rationale (max 1–2 short Hebrew sentences).
11. Prefer 0–4 modifications. Be conservative on short streaks.
12. WEEKLY TARGET COMPLIANCE: Evaluate adherence STRICTLY against activePhaseStats.targetWorkoutsPerWeek (not assumed daily). The server adherencePercent already applies weekly caps (excess sessions do NOT inflate other weeks) and may include a gap penalty.
13. BINGE / GAP WARNINGS: If activePhaseStats.hasCriticalGaps is true OR longestGapDays > 4, you MUST explicitly critique/warn the therapist in summary.consistency and/or actionItems about binge/cram patterns or long inactivity gaps. Do not soft-pedal critical gaps.
14. CRITICAL GAP — FORCE REGRESSION: When activePhaseStats.hasCriticalGaps is true OR longestGapDays > 7, you MUST output at least one actionable modification focused on REGRESSION (reduce reps, reduce sets/weight, easier REPLACE toward baseline, or safe re-onboarding). It is FORBIDDEN to return "modifications": [] in this state. It is FORBIDDEN to suggest minor progressions or arbitrary load increases (e.g. LOAD_ADJUST reps 10→12). Treat the patient as deconditioned.
15. PROTOCOL FREEZE: If protocolProgressionFrozen is true, the displayed currentProtocolWeek is adherence-aware (not pure calendar time). Do not assume the patient completed intermediate protocol stages they skipped due to inactivity.

JSON OUTPUT SCHEMA:
{
  "summary": {
    "consistency": "1 short Hebrew sentence on adherence vs weekly target / streak / gaps",
    "painLoad": "1 short Hebrew sentence on pain vs load"
  },
  "actionItems": ["advisory Hebrew bullet 1", "advisory Hebrew bullet 2"],
  "prognosis": "1–2 short Hebrew sentences",
  "modifications": [
    {
      "type": "REPLACE" | "REMOVE" | "ADD" | "LOAD_ADJUST",
      "id": string | null,
      "newId": string | null,
      "reps": number | null,
      "sets": number | null,
      "label": string,
      "rationale": "1–2 short sentences in Hebrew"
    }
  ]
}`;

function logInfo(message: string, detail?: Record<string, unknown>): void {
  if (detail) console.info(`${LOG_PREFIX} ${message}`, detail);
  else console.info(`${LOG_PREFIX} ${message}`);
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
  const forceRegression =
    params.aggregated.hasCriticalGaps ||
    params.aggregated.longestGapDays > FORCE_REGRESSION_GAP_DAYS;

  const shortStreakRule =
    !forceRegression && streakDays > 0 && streakDays < 3
      ? `\nNote: Active streak is short (${streakDays} days). Prefer empty modifications unless clinically necessary.`
      : '';

  const gapRule = forceRegression
    ? `\nNote: Critical inactivity gap (longestGapDays=${params.aggregated.longestGapDays}). You MUST include ≥1 regression modification (reduce reps/sets/weight or easier baseline). NEVER return modifications: []. NEVER increase load.`
    : `\nNote: Weekly target is ${params.aggregated.targetWorkoutsPerWeek} workouts/week. Judge compliance against that target only.`;

  const freezeRule = params.aggregated.protocolProgressionFrozen
    ? `\nNote: Protocol progression is FROZEN (effective week ${params.aggregated.currentProtocolWeek}; chronological would be ${params.aggregated.chronologicalProtocolWeek}). Do not treat skipped calendar weeks as completed.`
    : '';

  const systemInstruction = `${CLINICAL_NARRATIVE_ENGINE_PROMPT}${shortStreakRule}${gapRule}${freezeRule}`;

  const context = buildClinicalPromptContext({
    mode: 'smart',
    aggregated: params.aggregated,
    patient: params.patient,
    progressInsight: params.progressInsight,
    catalog: params.catalog,
    continuationProtocol: params.continuationProtocol,
    prognosis: params.prognosis,
  });

  const userText = `Patient data (JSON):
${context.text}`;

  logInfo('Starting smart clinical center analysis', {
    adherencePercent: params.aggregated.adherencePercent,
    targetWorkoutsPerWeek: params.aggregated.targetWorkoutsPerWeek,
    hasRecentGap: params.aggregated.hasRecentGap,
    hasCriticalGaps: params.aggregated.hasCriticalGaps,
    longestGapDays: params.aggregated.longestGapDays,
  });

  const responseText = await geminiGenerateText({
    systemInstruction,
    userText,
    temperature: 0.2,
    responseMimeType: 'application/json',
    logPrefix: LOG_PREFIX,
    logDetail: { mode: 'smart_clinical_center' },
    patientInitials: patientInitialsFromName(params.patient.name),
    nameTokens: collectPatientPhiTokens(params.patient),
  });

  const parsed = parseModelJson(stripMarkdownCodeFences(responseText), {
    logPrefix: LOG_PREFIX,
  });
  const normalized = normalizeUnifiedClinicalNarrative(parsed);
  let modifications = finalizeClinicalModifications(normalized.modifications, params.catalog);
  if (forceRegression) {
    modifications = ensureCriticalGapRegressionModifications(
      modifications,
      params.catalog,
      params.aggregated.longestGapDays
    );
  }
  const finalized = {
    ...normalized,
    modifications,
  };
  return injectServerClinicalFacts(finalized, {
    adherencePercent: params.aggregated.adherencePercent,
    hasRecentGap: params.aggregated.hasRecentGap,
  });
}
