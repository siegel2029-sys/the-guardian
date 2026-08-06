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
  /** Full Hebrew clinical sentence — why this change is suggested. */
  rationale?: string;
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

/** Pull clinical rationale from raw JSON — Gemini may use alternate key names. */
function extractClinicalModificationRationale(o: Record<string, unknown>): string {
  const candidates = [
    o.rationale,
    o.rationaleHe,
    o.rationale_he,
    o.clinicalRationale,
    o.clinicalRationaleHebrew,
    o.reason,
    o.reasonHebrew,
    o.clinicalReason,
  ];
  for (const value of candidates) {
    const text = trimStr(value, 500);
    if (text) return text;
  }
  return '';
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
      rationale: mod.rationale?.trim() ?? '',
      label: labelDisplayToPlainText(resolveModificationLabelDisplay(mod, catalog)),
    }))
  );
}

/** True when LOAD_ADJUST increases reps/sets vs the current plan (unsafe after a long gap). */
function isLoadProgression(
  mod: ClinicalModification,
  catalog: ClinicalExerciseCatalog
): boolean {
  if (mod.type !== 'LOAD_ADJUST' || !mod.currentExerciseId) return false;
  const planEx = findPlanCatalogExercise(catalog, mod.currentExerciseId);
  if (!planEx) return false;
  if (mod.reps != null && mod.reps > planEx.patientReps) return true;
  if (mod.sets != null && mod.sets > planEx.patientSets) return true;
  return false;
}

function isRegressionModification(
  mod: ClinicalModification,
  catalog: ClinicalExerciseCatalog
): boolean {
  if (mod.type === 'REMOVE' || mod.type === 'REPLACE') return true;
  if (mod.type !== 'LOAD_ADJUST' || !mod.currentExerciseId) return false;
  const planEx = findPlanCatalogExercise(catalog, mod.currentExerciseId);
  if (!planEx) return false;
  if (mod.reps != null && mod.reps < planEx.patientReps) return true;
  if (mod.sets != null && mod.sets < planEx.patientSets) return true;
  return false;
}

function buildFallbackRegressionModification(
  catalog: ClinicalExerciseCatalog,
  longestGapDays: number
): ClinicalModification | null {
  const planEx = catalog.currentPlanExercises[0];
  if (!planEx) return null;

  const reducedReps = Math.max(1, Math.floor(planEx.patientReps * 0.7));
  const reducedSets =
    planEx.patientSets > 1 ? Math.max(1, planEx.patientSets - 1) : planEx.patientSets;
  const useReps = reducedReps < planEx.patientReps;
  const suggestedReps = useReps ? reducedReps : planEx.patientReps;
  const suggestedSets = useReps ? planEx.patientSets : reducedSets;

  const draft: ClinicalModification = {
    type: 'LOAD_ADJUST',
    currentExerciseId: planEx.id,
    newExerciseChainId: null,
    reps: suggestedReps,
    sets: suggestedSets !== planEx.patientSets ? suggestedSets : null,
    label: '',
    rationale: `רגרסיה קלינית לאחר הפסקה של ${longestGapDays} ימים — הפחתת נפח לחזרה בטוחה לפעילות.`,
  };
  draft.label = labelDisplayToPlainText(resolveModificationLabelDisplay(draft, catalog));
  return draft;
}

/**
 * After a critical inactivity gap, strip progressions and guarantee at least one
 * actionable regression recommendation (never leave modifications empty).
 */
export function ensureCriticalGapRegressionModifications(
  modifications: ClinicalModification[],
  catalog: ClinicalExerciseCatalog,
  longestGapDays: number
): ClinicalModification[] {
  const withoutProgression = modifications.filter((mod) => !isLoadProgression(mod, catalog));
  if (withoutProgression.some((mod) => isRegressionModification(mod, catalog))) {
    return withoutProgression.slice(0, 4);
  }
  const fallback = buildFallbackRegressionModification(catalog, longestGapDays);
  if (!fallback) return withoutProgression.slice(0, 4);
  return [fallback, ...withoutProgression].slice(0, 4);
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
  const label = trimStr(o.label, 120) || type;
  const rationale = extractClinicalModificationRationale(o);
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
  const o =
    raw && typeof raw === 'object' && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};

  const summaryRaw =
    o.summary && typeof o.summary === 'object' && !Array.isArray(o.summary)
      ? (o.summary as Record<string, unknown>)
      : {};

  const actionItems = Array.isArray(o.actionItems)
    ? o.actionItems
        .map((x) => trimStr(x, 180))
        .filter(Boolean)
        .slice(0, 6)
    : [];

  const modifications = Array.isArray(o.modifications)
    ? filterModificationConflicts(
        o.modifications
          .map(normalizeClinicalModification)
          .filter((x): x is ClinicalModification => x != null)
          .slice(0, 6)
      )
    : [];

  return {
    summary: {
      consistency: trimStr(summaryRaw.consistency, 280),
      painLoad: trimStr(summaryRaw.painLoad, 280),
    },
    actionItems,
    modifications,
    prognosis: trimStr(o.prognosis, 400),
  };
}

export function buildUnifiedClinicalNarrative(
  agg: ClinicalInsightsAggregated,
  _patientDisplayName: string,
  progressInsight: ClinicalProgressInsight | null,
  _catalog?: ClinicalExerciseCatalog
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
  } else if (agg.hasCriticalGaps) {
    consistency = `אזהרה: פער תרגול ארוך (${agg.longestGapDays} ימים) · עמידה מול יעד ${agg.targetWorkoutsPerWeek}/שבוע: ${adherencePct ?? '—'}%.`;
  } else if (agg.hasRecentGap && shortStreak) {
    consistency = `חזרה לאחר הפסקה של ${streak.lastGapDays} ימים — מסלול קצר.`;
  } else if (agg.hasRecentGap) {
    consistency = `חזרה לתרגול לאחר הפסקה · עמידה מול יעד ${agg.targetWorkoutsPerWeek}/שבוע: ${adherencePct ?? '—'}%.`;
  } else {
    consistency = `עמידה מול יעד ${agg.targetWorkoutsPerWeek} אימונים/שבוע: ${adherencePct ?? '—'}%.`;
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
  if (agg.hasCriticalGaps) {
    actionItems.push('בדיקת דפוס binge/cram — פערים ארוכים מול יעד שבועי');
  }

  if (progressInsight?.category === 'load_increase' && !shortStreak) {
    actionItems.push('שקלו התקדמות זהירה — ניתן לייצר המלצות Gemini לאישור ידני.');
  } else if (
    progressInsight?.category === 'load_decrease' ||
    progressInsight?.category === 'escalate_care'
  ) {
    actionItems.push('שקלו הפחתת עומס / בדיקת טכניקה — ניתן לייצר המלצות Gemini לאישור ידני.');
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
      modifications: [],
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
