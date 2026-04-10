/**
 * ניתוח מרכז ניתוח קליני חכם דרך Gemini — מבוסס סדרת 7 ימים ומדדי עמידה.
 */

import type { ClinicalInsightsAggregated } from '../services/clinicalInsightsAggregation';
import { bodyAreaLabels } from '../types';
import { geminiGenerateText, getGeminiApiKey } from './geminiClient';
import { parseJsonObject } from './geminiClinicalIntake';
import type { ClinicalProgressInsight } from './clinicalCommandInsight';
import type { UnifiedClinicalNarrative } from './clinicalInsightsNarrative';

export { getGeminiApiKey, GeminiRateLimitedError } from './geminiClient';

const LOG_PREFIX = '[GeminiSmartClinicalCenter]';

function logInfo(message: string, detail?: Record<string, unknown>): void {
  if (detail) console.info(`${LOG_PREFIX} ${message}`, detail);
  else console.info(`${LOG_PREFIX} ${message}`);
}

function aggregatedPayloadForPrompt(agg: ClinicalInsightsAggregated): Record<string, unknown> {
  return {
    clinicalToday: agg.clinicalToday,
    primaryBodyArea: agg.primaryBodyArea,
    primaryBodyAreaLabel: bodyAreaLabels[agg.primaryBodyArea],
    painTrendPercent: agg.painTrendPercent,
    avgPain7dPrimary: agg.avgPain7dPrimary,
    avgEffort1to5: agg.avgEffort1to5,
    compliance: agg.compliance,
    selfSelectedZoneLabels: agg.selfSelectedZones.map((a) => bodyAreaLabels[a]),
    offPlanSelfCareZoneLabels: agg.offPlanSelfCareZones.map((a) => bodyAreaLabels[a]),
    daySeries7: agg.daySeries7.map((d) => ({
      date: d.date,
      label: d.label,
      weekdayHe: d.weekdayHe,
      pain0to10: d.pain,
      effort1to5: d.effort1to5,
    })),
    highPainWithStrongCompliance: agg.highPainWithStrongCompliance,
    highPainLowCompletionDays: agg.highPainLowCompletionDays,
    selfCareSessionsLast7d: agg.selfCareReportsLast7d.length,
    offPlanSelfCareSessionsLast7d: agg.offPlanSelfCareReportsLast7d.length,
  };
}

function normalizeNarrative(raw: unknown): UnifiedClinicalNarrative {
  const o = raw as {
    graphAnchoredSummary?: unknown;
    recommendedActions?: unknown;
  };
  const graphAnchoredSummary =
    typeof o.graphAnchoredSummary === 'string' ? o.graphAnchoredSummary.trim() : '';
  const recommendedActions = Array.isArray(o.recommendedActions)
    ? o.recommendedActions
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10)
    : [];

  if (!graphAnchoredSummary) {
    throw new Error('Invalid AI response: empty graphAnchoredSummary');
  }
  if (recommendedActions.length === 0) {
    throw new Error('Invalid AI response: recommendedActions empty');
  }

  return { graphAnchoredSummary, recommendedActions };
}

/**
 * מפיק סיכום קליני ופעולות מומלצות בעברית, מבוסס אך ורק על ה-JSON שסופק (כולל נקודות הגרף).
 */
export async function analyzeSmartClinicalCenterWithGemini(params: {
  patientDisplayName: string;
  aggregated: ClinicalInsightsAggregated;
  progressInsight: ClinicalProgressInsight;
}): Promise<UnifiedClinicalNarrative> {
  if (!getGeminiApiKey()) {
    throw new Error('Missing VITE_GEMINI_API_KEY');
  }

  const systemInstruction = `אתה עוזר קליני לפיזיותרפיסט במערכת ניהול תרגולי בית.
המשימה: נתח את נתוני המעקב (7 ימים קליניים אחרונים) והמלצת המערכת, והפק סיכום מקצועי בעברית.

כללים קשיחים:
- התבסס אך ורק על ה-JSON שסופק; אל תמציא מטופלים, תאריכים או מספרים שלא הופיעו.
- הזכר במפורש את שני צירי הגרף כשזה רלוונטי: כאב 0–10 באזור המוקד, ומאמץ מדווח 1–5.
- אל תקבע אבחנה רפואית סופית; הצע רק הערכה, מגמות והמלצות להמשך מעקב/טיפול.
- טון: מקצועי, תמציתי, מכבד.
- הפלט חייב להיות אך ורק JSON תקף, ללא טקסט לפני או אחרי, ללא Markdown.

מבנה JSON נדרש (שמות שדות בדיוק):
{
  "graphAnchoredSummary": "<2–5 פסקאות קצרות בעברית, כולל התייחסות לגרף כאב/מאמץ כשיש נקודות>",
  "recommendedActions": ["<פעולה 1>", "<פעולה 2>", "... עד 6 פריטים"]
}`;

  const userText = `שם תצוגה של המטופל (לניסוח בלבד): ${params.patientDisplayName.trim()}

נתונים מאוגדים (JSON):
${JSON.stringify(aggregatedPayloadForPrompt(params.aggregated), null, 2)}

המלצת מערכת (דטרמיניסטית, לשילוב בהקשר):
${JSON.stringify(params.progressInsight, null, 2)}`;

  logInfo('Starting smart clinical center analysis', {
    patientId: params.aggregated.patientId,
    days: params.aggregated.daySeries7.length,
  });

  const responseText = await geminiGenerateText({
    systemInstruction,
    userText,
    temperature: 0.22,
    responseMimeType: 'application/json',
    logPrefix: LOG_PREFIX,
    logDetail: { patientId: params.aggregated.patientId },
  });

  const parsed = parseJsonObject(responseText);
  return normalizeNarrative(parsed);
}
