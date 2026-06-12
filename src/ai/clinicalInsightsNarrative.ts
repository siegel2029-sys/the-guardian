/**
 * Unified clinical narrative v3 — machine-readable Clinical Engine output.
 * adherencePercent / hasRecentGap injected server-side (Stream 1 hard facts).
 */

import type { ClinicalInsightsAggregated, ClinicalDayPoint } from '../services/clinicalInsightsAggregation';
import type { ClinicalProgressInsight } from './clinicalCommandInsight';
import { bodyAreaLabels } from '../types';
import type { ClinicalExerciseCatalog } from '../utils/clinicalExerciseCatalog';

export type ClinicalModification = {
  type: 'REPLACE' | 'REMOVE' | 'ADD' | 'LOAD_ADJUST';
  id: string | null;
  newId: string | null;
  label: string;
  reps: number | null;
  sets: number | null;
};

export type UnifiedClinicalNarrative = {
  adherencePercent: number | null;
  adherenceStatus: string;
  hasRecentGap: boolean;
  summary: { consistency: string; painLoad: string };
  actionItems: string[];
  modifications: ClinicalModification[];
  prognosis: string;
};

export type SuggestedExerciseChange = {
  action: 'REMOVE' | 'REPLACE' | 'ADD';
  currentExerciseId?: string;
  newExerciseChainId?: string;
  label: string;
};

export type LoadAdjustment = {
  exerciseId: string;
  suggestedReps?: number;
  suggestedSets?: number;
  label: string;
};

/** @deprecated v1 — use ApprovablePlanRow */
export type PlanModificationActionType = 'REPLACE' | 'ADD' | 'MODIFY_PARAMS' | 'REMOVE';

export type ApprovablePlanRow =
  | { kind: 'exercise'; item: SuggestedExerciseChange; index: number }
  | { kind: 'load'; item: LoadAdjustment; index: number };

export type PlanModificationSuggestion = {
  actionType: PlanModificationActionType;
  currentExerciseId?: string;
  newExerciseChainId?: string;
  suggestedReps?: string | number;
  suggestedSets?: string | number;
  clinicalReason?: string;
};

export type LlmClinicalNarrative = Omit<
  UnifiedClinicalNarrative,
  'adherencePercent' | 'adherenceStatus' | 'hasRecentGap'
>;

function fmtPct(n: number): string {
  return `${Math.round(Math.abs(n))}%`;
}

function trimStr(value: unknown, maxLen: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLen) : '';
}

function nullableId(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

function nullableInt(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === 'number' && Number.isFinite(value)) return Math.round(value);
  return null;
}

function fullHistoryPainTrend(agg: ClinicalInsightsAggregated): 'down' | 'up' | 'flat' | 'unknown' {
  const primary = agg.primaryBodyArea;
  const records = agg.fullPainHistory.filter((r) => r.bodyArea === primary);
  if (records.length < 2) return 'unknown';
  const sorted = [...records].sort((a, b) => a.date.localeCompare(b.date));
  const mid = Math.floor(sorted.length / 2) || 1;
  const early = sorted.slice(0, mid);
  const late = sorted.slice(mid);
  const avgEarly = early.reduce((s, r) => s + r.painLevel, 0) / early.length;
  const avgLate = late.reduce((s, r) => s + r.painLevel, 0) / late.length;
  if (avgLate < avgEarly - 0.45) return 'down';
  if (avgLate > avgEarly + 0.45) return 'up';
  return 'flat';
}

function painVisualTrendActive(series: ClinicalDayPoint[]): 'down' | 'up' | 'flat' | 'unknown' {
  const mid = Math.max(1, Math.floor(series.length / 2));
  const early = series.slice(0, mid).filter((d) => d.pain != null).map((d) => d.pain!);
  const late = series.slice(mid).filter((d) => d.pain != null).map((d) => d.pain!);
  if (early.length === 0 || late.length === 0) return 'unknown';
  const ae = early.reduce((a, b) => a + b, 0) / early.length;
  const al = late.reduce((a, b) => a + b, 0) / late.length;
  if (al < ae - 0.45) return 'down';
  if (al > ae + 0.45) return 'up';
  return 'flat';
}

function pickProgressionCatalogId(catalog: ClinicalExerciseCatalog | undefined): string | null {
  return catalog?.availableCatalogExercises[0]?.id ?? null;
}

export function formatAdherenceStatus(adherencePercent: number | null): string {
  return adherencePercent != null ? `${adherencePercent}%` : '—';
}

export function injectServerClinicalFacts(
  narrative: LlmClinicalNarrative,
  facts: { adherencePercent: number | null; hasRecentGap: boolean }
): UnifiedClinicalNarrative {
  return {
    ...narrative,
    adherencePercent: facts.adherencePercent,
    adherenceStatus: formatAdherenceStatus(facts.adherencePercent),
    hasRecentGap: facts.hasRecentGap,
  };
}

/** @deprecated use injectServerClinicalFacts */
export function injectAdherencePercent(
  narrative: LlmClinicalNarrative,
  adherencePercent: number | null
): UnifiedClinicalNarrative {
  return injectServerClinicalFacts(narrative, { adherencePercent, hasRecentGap: false });
}

export function modificationToExerciseChange(mod: ClinicalModification): SuggestedExerciseChange | null {
  if (mod.type === 'LOAD_ADJUST') return null;
  return {
    action: mod.type,
    currentExerciseId: mod.id ?? undefined,
    newExerciseChainId: mod.newId ?? undefined,
    label: mod.label,
  };
}

export function modificationToLoadAdjustment(mod: ClinicalModification): LoadAdjustment | null {
  if (mod.type !== 'LOAD_ADJUST') return null;
  if (!mod.id) return null;
  return {
    exerciseId: mod.id,
    suggestedReps: mod.reps ?? undefined,
    suggestedSets: mod.sets ?? undefined,
    label: mod.label,
  };
}

export function normalizeClinicalModification(raw: unknown): ClinicalModification | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = o.type;
  if (type !== 'REPLACE' && type !== 'REMOVE' && type !== 'ADD' && type !== 'LOAD_ADJUST') {
    return null;
  }
  const label = trimStr(o.label, 120);
  if (!label) return null;

  const id = nullableId(o.id);
  const newId = nullableId(o.newId);
  const reps = nullableInt(o.reps);
  const sets = nullableInt(o.sets);

  if (type === 'REPLACE') {
    if (!id || !newId) return null;
    return { type, id, newId, label, reps: null, sets: null };
  }
  if (type === 'REMOVE') {
    if (!id) return null;
    return { type, id, newId: null, label, reps: null, sets: null };
  }
  if (type === 'ADD') {
    if (!newId) return null;
    return { type, id, newId, label, reps: null, sets: null };
  }
  if (!id) return null;
  if (reps == null && sets == null) return null;
  return { type, id, newId: null, label, reps, sets };
}

export function normalizeUnifiedClinicalNarrative(raw: unknown): LlmClinicalNarrative {
  const o = raw as Record<string, unknown>;
  const summaryRaw = o.summary as Record<string, unknown> | undefined;
  const consistency = trimStr(summaryRaw?.consistency, 120);
  const painLoad = trimStr(summaryRaw?.painLoad, 120);

  if (!consistency || !painLoad) {
    throw new Error('Invalid AI response: summary incomplete');
  }

  const actionItems = Array.isArray(o.actionItems)
    ? o.actionItems
        .filter((x): x is string => typeof x === 'string')
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const modifications = Array.isArray(o.modifications)
    ? o.modifications
        .map(normalizeClinicalModification)
        .filter((x): x is ClinicalModification => x != null)
        .slice(0, 6)
    : [];

  const prognosis = trimStr(o.prognosis, 200);
  if (!prognosis) {
    throw new Error('Invalid AI response: empty prognosis');
  }

  if (actionItems.length === 0) {
    throw new Error('Invalid AI response: actionItems empty');
  }

  return {
    summary: { consistency, painLoad },
    actionItems,
    modifications,
    prognosis,
  };
}

export function buildUnifiedClinicalNarrative(
  agg: ClinicalInsightsAggregated,
  _patientDisplayName: string,
  progressInsight: ClinicalProgressInsight | null,
  catalog?: ClinicalExerciseCatalog
): UnifiedClinicalNarrative {
  const areaLabel = bodyAreaLabels[agg.primaryBodyArea];
  const streak = agg.activeStreak;
  const adherencePct = agg.adherencePercent;
  const fullTrend = fullHistoryPainTrend(agg);
  const activeTrend = painVisualTrendActive(agg.daySeriesActive);
  const pt = agg.painTrendPercent;
  const shortStreak = streak.activeStreakDayCount > 0 && streak.activeStreakDayCount < 3;

  let consistency: string;
  if (streak.actualStartDate == null) {
    consistency = '• אין סשנים מתועדים עדיין';
  } else if (agg.hasRecentGap && shortStreak) {
    consistency = `• חזרה לאחר הפסקה של ${streak.lastGapDays} ימים · מסלול קצר (${streak.activeStreakDayCount} ימ')`;
  } else if (agg.hasRecentGap) {
    consistency = `• חזרה לתרגול לאחר הפסקה · עמידה ${adherencePct ?? '—'}%`;
  } else if (agg.trainingPhaseHistory.length > 1) {
    consistency = `• ${agg.trainingPhaseHistory.length} מסלולים · פעיל מ-${streak.activeStreakStart}`;
  } else {
    consistency = `• תרגול רציף · עמידה ${adherencePct ?? '—'}%`;
  }

  let painLoad: string;
  if (fullTrend === 'down') {
    painLoad = `• כאב יורד ב${areaLabel}${pt != null ? ` (~${fmtPct(pt)})` : ''}`;
  } else if (fullTrend === 'up') {
    painLoad = `• כאב עולה · בדיקת עומס${agg.avgEffort1to5 != null && agg.avgEffort1to5 >= 4 ? ' (מאמץ גבוה)' : ''}`;
  } else if (activeTrend === 'down') {
    painLoad = '• כאב משתפר במסלול הפעיל';
  } else {
    painLoad = '• כאב ועומס יציבים — מעקב';
  }

  const actionItems: string[] = [];
  if (agg.avgPainActiveStreakPrimary != null && agg.avgPainActiveStreakPrimary >= 5) {
    actionItems.push(`בדיקת ROM/כוח — ${areaLabel}`);
    actionItems.push('השוואת כאב לפני/אחרי אימון');
  } else {
    actionItems.push(`מדידת VAS — ${areaLabel}`);
  }
  if (progressInsight?.nextStepHe) actionItems.push(progressInsight.nextStepHe.slice(0, 120));
  if (agg.highPainWithStrongCompliance) {
    actionItems.push('בדיקת טכניקה — עומס מול סובלנות');
  }

  const modifications: ClinicalModification[] = [];
  const firstPlanEx = catalog?.currentPlanExercises[0];
  const catalogId = pickProgressionCatalogId(catalog);

  if (
    progressInsight?.category === 'load_increase' &&
    !shortStreak &&
    firstPlanEx &&
    catalogId
  ) {
    modifications.push({
      type: 'REPLACE',
      id: firstPlanEx.id,
      newId: catalogId,
      label: `החלפת ${firstPlanEx.name} — התקדמות`,
      reps: null,
      sets: null,
    });
  } else if (
    (progressInsight?.category === 'load_decrease' ||
      progressInsight?.category === 'escalate_care') &&
    firstPlanEx
  ) {
    const reps = Math.max(1, Math.floor(firstPlanEx.patientReps * 0.75));
    modifications.push({
      type: 'LOAD_ADJUST',
      id: firstPlanEx.id,
      newId: null,
      label: `${firstPlanEx.name}: ${firstPlanEx.patientSets}×${reps}`,
      reps,
      sets: firstPlanEx.patientSets,
    });
  }

  let prognosis = 'מעקב שבועי — תלוי בעמידה ויציבות כאב';
  if (fullTrend === 'down' && adherencePct != null && adherencePct >= 70) {
    prognosis = 'מגמת שיפור — התקדמות זהירה לפי פרוטוקול';
  } else if (fullTrend === 'up') {
    prognosis = 'החמרה אפשרית — שמרו על עומס נמוך';
  }

  return injectServerClinicalFacts(
    {
      summary: { consistency, painLoad },
      actionItems: actionItems.slice(0, 5),
      modifications,
      prognosis,
    },
    { adherencePercent: adherencePct, hasRecentGap: agg.hasRecentGap }
  );
}

export function flattenApprovableRows(narrative: UnifiedClinicalNarrative): ApprovablePlanRow[] {
  const rows: ApprovablePlanRow[] = [];
  narrative.modifications.forEach((mod, index) => {
    if (mod.type === 'LOAD_ADJUST') {
      const item = modificationToLoadAdjustment(mod);
      if (item) rows.push({ kind: 'load', item, index });
    } else {
      const item = modificationToExerciseChange(mod);
      if (item) rows.push({ kind: 'exercise', item, index });
    }
  });
  return rows;
}

export function approvableRowKey(row: ApprovablePlanRow): string {
  if (row.kind === 'exercise') {
    const e = row.item;
    return `ex|${row.index}|${e.action}|${e.currentExerciseId ?? ''}|${e.newExerciseChainId ?? ''}`;
  }
  const l = row.item;
  return `ld|${row.index}|${l.exerciseId}|${l.suggestedReps ?? ''}|${l.suggestedSets ?? ''}`;
}

/** @deprecated v1 normalizer */
export function normalizePlanModification(_raw: unknown): PlanModificationSuggestion | null {
  return null;
}
