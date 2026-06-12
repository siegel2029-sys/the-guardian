/**
 * Unified clinical narrative v3 — machine-readable Clinical Engine output.
 * adherencePercent / hasRecentGap injected server-side (Stream 1 hard facts).
 */

import type { ClinicalInsightsAggregated, ClinicalDayPoint } from '../services/clinicalInsightsAggregation';
import type { ClinicalProgressInsight } from './clinicalCommandInsight';
import { bodyAreaLabels } from '../types';
import type { ClinicalExerciseCatalog } from '../utils/clinicalExerciseCatalog';
import { findCatalogExerciseById } from '../utils/clinicalExerciseCatalog';
import { filterModificationConflicts } from '../utils/clinicalUnifiedActions';

export type ClinicalModification = {
  type: 'REPLACE' | 'REMOVE' | 'ADD' | 'LOAD_ADJUST';
  currentExerciseId: string | null;
  newExerciseChainId: string | null;
  label: string;
  rationale: string;
  reps?: number | null;
  sets?: number | null;
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
    currentExerciseId: mod.currentExerciseId ?? undefined,
    newExerciseChainId: mod.newExerciseChainId ?? undefined,
    label: mod.label,
  };
}

export function modificationToLoadAdjustment(mod: ClinicalModification): LoadAdjustment | null {
  if (mod.type !== 'LOAD_ADJUST') return null;
  if (!mod.currentExerciseId) return null;
  return {
    exerciseId: mod.currentExerciseId,
    suggestedReps: mod.reps ?? undefined,
    suggestedSets: mod.sets ?? undefined,
    label: mod.label,
  };
}

function resolvePlanExerciseName(
  exerciseId: string | null | undefined,
  catalog?: ClinicalExerciseCatalog
): string | null {
  if (!exerciseId || !catalog) return null;
  const planEx = catalog.currentPlanExercises.find(
    (ex) => ex.id === exerciseId || ex.id.includes(exerciseId)
  );
  return planEx?.name ?? null;
}

function resolveCatalogExerciseName(catalogId: string | null | undefined): string | null {
  if (!catalogId) return null;
  const found = findCatalogExerciseById(catalogId);
  if (!found) return null;
  if (found.source === 'library') return (found.exercise as { name: string }).name;
  return (found.exercise as { name: string }).name;
}

export type ClinicalActionLabelDisplay =
  | { kind: 'plain'; text: string }
  | {
      kind: 'load_adjust';
      prefix: 'העלאת עומס' | 'הפחתת עומס';
      exerciseName: string;
      fieldLabel: string;
      currentValue: number;
      suggestedValue: number;
    };

function findPlanCatalogExercise(
  catalog: ClinicalExerciseCatalog,
  exerciseId: string
): ClinicalExerciseCatalog['currentPlanExercises'][number] | undefined {
  return catalog.currentPlanExercises.find(
    (ex) => ex.id === exerciseId || ex.id.includes(exerciseId)
  );
}

function loadAdjustPrefix(
  current: number,
  suggested: number
): 'העלאת עומס' | 'הפחתת עומס' {
  return suggested > current ? 'העלאת עומס' : 'הפחתת עומס';
}

function parseNumericPairFromLabel(label: string): { current: number; suggested: number } | null {
  const match = label.match(/(\d+)\s*(?:→|➔|->|—|-)\s*(\d+)/);
  if (!match) return null;
  return { current: Number(match[1]), suggested: Number(match[2]) };
}

/** Drop REPLACE actions missing newId or with an unknown catalog id. */
export function filterInvalidReplacements(
  modifications: ClinicalModification[],
  catalog?: ClinicalExerciseCatalog
): ClinicalModification[] {
  const validCatalogIds = catalog
    ? new Set(catalog.availableCatalogExercises.map((ex) => ex.id))
    : null;

  return modifications.filter((mod) => {
    if (mod.type !== 'REPLACE') return true;
    if (!mod.newExerciseChainId) return false;
    if (validCatalogIds && !validCatalogIds.has(mod.newExerciseChainId)) return false;
    return true;
  });
}

export function buildLoadAdjustLabelDisplay(
  mod: ClinicalModification,
  catalog?: ClinicalExerciseCatalog
): ClinicalActionLabelDisplay {
  const planEx =
    mod.currentExerciseId && catalog
      ? findPlanCatalogExercise(catalog, mod.currentExerciseId)
      : undefined;
  const exerciseName =
    planEx?.name ??
    resolvePlanExerciseName(mod.currentExerciseId, catalog) ??
    mod.currentExerciseId ??
    'תרגיל';

  if (mod.reps != null && planEx) {
    return {
      kind: 'load_adjust',
      prefix: loadAdjustPrefix(planEx.patientReps, mod.reps),
      exerciseName,
      fieldLabel: 'חזרות',
      currentValue: planEx.patientReps,
      suggestedValue: mod.reps,
    };
  }
  if (mod.sets != null && planEx) {
    return {
      kind: 'load_adjust',
      prefix: loadAdjustPrefix(planEx.patientSets, mod.sets),
      exerciseName,
      fieldLabel: 'סטים',
      currentValue: planEx.patientSets,
      suggestedValue: mod.sets,
    };
  }

  const parsed = parseNumericPairFromLabel(mod.label);
  if (parsed) {
    return {
      kind: 'load_adjust',
      prefix: loadAdjustPrefix(parsed.current, parsed.suggested),
      exerciseName,
      fieldLabel: 'חזרות',
      currentValue: parsed.current,
      suggestedValue: parsed.suggested,
    };
  }

  return { kind: 'plain', text: mod.label.trim() || `עדכון עומס בתרגיל ${exerciseName}` };
}

export function resolveModificationLabelDisplay(
  mod: ClinicalModification,
  catalog?: ClinicalExerciseCatalog
): ClinicalActionLabelDisplay {
  if (mod.type === 'LOAD_ADJUST') {
    return buildLoadAdjustLabelDisplay(mod, catalog);
  }
  return { kind: 'plain', text: formatModificationDisplayHe(mod, catalog) };
}

export function labelDisplayToPlainText(display: ClinicalActionLabelDisplay): string {
  if (display.kind === 'plain') return display.text;
  return `${display.prefix} בתרגיל ${display.exerciseName}: ${display.fieldLabel} ${display.currentValue} ➔ ${display.suggestedValue}`;
}

export function finalizeClinicalModifications(
  modifications: ClinicalModification[],
  catalog?: ClinicalExerciseCatalog
): ClinicalModification[] {
  return filterModificationConflicts(
    filterInvalidReplacements(modifications, catalog).map((mod) => ({
      ...mod,
      label: labelDisplayToPlainText(resolveModificationLabelDisplay(mod, catalog)),
    }))
  );
}

/** Deterministic Hebrew display — never uses long LLM label text for REPLACE/REMOVE. */
export function formatModificationDisplayHe(
  mod: ClinicalModification,
  catalog?: ClinicalExerciseCatalog
): string {
  const currentName =
    resolvePlanExerciseName(mod.currentExerciseId, catalog) ??
    mod.currentExerciseId ??
    'תרגיל';
  const newName =
    resolveCatalogExerciseName(mod.newExerciseChainId) ??
    resolvePlanExerciseName(mod.newExerciseChainId, catalog) ??
    mod.newExerciseChainId ??
    'תרגיל';

  switch (mod.type) {
    case 'REPLACE':
      return `החלף ${currentName} ב-${newName}`;
    case 'REMOVE':
      return `הסר את ${currentName}`;
    case 'ADD':
      return `הוסף ${newName}`;
    case 'LOAD_ADJUST':
      return labelDisplayToPlainText(buildLoadAdjustLabelDisplay(mod, catalog));
    default:
      return mod.label;
  }
}

export function normalizeClinicalModification(raw: unknown): ClinicalModification | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const type = o.type;
  if (type !== 'REPLACE' && type !== 'REMOVE' && type !== 'ADD' && type !== 'LOAD_ADJUST') {
    return null;
  }

  const currentExerciseId =
    nullableId(o.currentExerciseId) ?? nullableId(o.id);
  const newExerciseChainId =
    nullableId(o.newExerciseChainId) ?? nullableId(o.newId);
  const label = trimStr(o.label, 80) || type;
  const rationale = trimStr(o.rationale, 160);
  const reps = nullableInt(o.reps);
  const sets = nullableInt(o.sets);

  if (type === 'REPLACE') {
    if (!currentExerciseId || !newExerciseChainId || !rationale || !label) return null;
    return { type, currentExerciseId, newExerciseChainId, label, rationale, reps: null, sets: null };
  }
  if (type === 'REMOVE') {
    if (!currentExerciseId || !rationale || !label) return null;
    return {
      type,
      currentExerciseId,
      newExerciseChainId: null,
      label,
      rationale,
      reps: null,
      sets: null,
    };
  }
  if (type === 'ADD') {
    if (!newExerciseChainId || !rationale || !label) return null;
    return { type, currentExerciseId, newExerciseChainId, label, rationale, reps: null, sets: null };
  }
  if (!currentExerciseId || !rationale || !label) return null;
  return { type, currentExerciseId, newExerciseChainId: null, label, rationale, reps, sets };
}

export function normalizeUnifiedClinicalNarrative(raw: unknown): LlmClinicalNarrative {
  const o = raw as Record<string, unknown>;

  const modifications = Array.isArray(o.modifications)
    ? filterInvalidReplacements(
        filterModificationConflicts(
          o.modifications
            .map(normalizeClinicalModification)
            .filter((x): x is ClinicalModification => x != null)
            .slice(0, 6)
        )
      )
    : [];

  return {
    summary: { consistency: '', painLoad: '' },
    actionItems: [],
    modifications,
    prognosis: '',
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
  const shortStreak = streak.activeStreakDayCount > 0 && streak.activeStreakDayCount < 3;

  let consistency: string;
  if (streak.actualStartDate == null) {
    consistency = 'אין סשנים מתועדים עדיין.';
  } else if (agg.hasRecentGap && shortStreak) {
    consistency = `חזרה לאחר הפסקה של ${streak.lastGapDays} ימים — מסלול קצר.`;
  } else if (agg.hasRecentGap) {
    consistency = `חזרה לתרגול לאחר הפסקה · עמידה ${adherencePct ?? '—'}%.`;
  } else {
    consistency = `עמידה במסלול הפעיל ${adherencePct ?? '—'}%.`;
  }

  let painLoad: string;
  if (fullTrend === 'down') {
    painLoad = `מגמת כאב יורדת ב${areaLabel}.`;
  } else if (fullTrend === 'up') {
    painLoad = 'מגמת כאב עולה — בדיקת עומס נדרשת.';
  } else if (activeTrend === 'down') {
    painLoad = 'כאב משתפר במסלול הפעיל.';
  } else {
    painLoad = 'כאב ועומס יציבים.';
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
      currentExerciseId: firstPlanEx.id,
      newExerciseChainId: catalogId,
      label: firstPlanEx.name,
      rationale: 'עמידה טובה — התקדמות לתרגיל מאתגר יותר.',
    });
  } else if (
    (progressInsight?.category === 'load_decrease' ||
      progressInsight?.category === 'escalate_care') &&
    firstPlanEx
  ) {
    const reps = Math.max(1, Math.floor(firstPlanEx.patientReps * 0.75));
    modifications.push({
      type: 'LOAD_ADJUST',
      currentExerciseId: firstPlanEx.id,
      newExerciseChainId: null,
      label: `${firstPlanEx.name}: ${firstPlanEx.patientSets}×${reps}`,
      rationale: 'כאב/עומס גבוה — הפחתת נפח תרגיל.',
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
      modifications: finalizeClinicalModifications(
        filterModificationConflicts(modifications),
        catalog
      ),
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
