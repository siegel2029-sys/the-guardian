/**
 * Merge AI plan modifications + therapist pending approvals with strict deduplication.
 *
 * Rule 1 — One action per exercise (priority: AI REPLACE/REMOVE > AI LOAD_ADJUST > Pending).
 * Rule 2 — No contradicting load adjustments on the same exercise + field.
 */

import type {
  ApprovablePlanRow,
  ClinicalModification,
  UnifiedClinicalNarrative,
} from '../ai/clinicalInsightsNarrative';
import {
  approvableRowKey,
  flattenApprovableRows,
  labelDisplayToPlainText,
  resolveModificationLabelDisplay,
  type ClinicalActionLabelDisplay,
} from '../ai/clinicalInsightsNarrative';
import type { ClinicalExerciseCatalog } from './clinicalExerciseCatalog';
import type { AiSuggestion, AiSuggestionField } from '../types';

export type UnifiedActionSourceTag = 'המלצת AI' | 'בקשת מטופל' | 'המלצת מערכת';

export type { ClinicalActionLabelDisplay };

export type UnifiedClinicalAction =
  | {
      id: string;
      sourceTag: UnifiedActionSourceTag;
      label: string;
      labelDisplay: ClinicalActionLabelDisplay;
      rationale: string;
      kind: 'ai_modification';
      exerciseId: string | null;
      actionType: ClinicalModification['type'];
      loadField: AiSuggestionField | null;
      loadDirection: LoadDirection | null;
      row: ApprovablePlanRow;
    }
  | {
      id: string;
      sourceTag: UnifiedActionSourceTag;
      label: string;
      labelDisplay: ClinicalActionLabelDisplay;
      rationale: string;
      kind: 'pending_approval';
      exerciseId: string;
      actionType: 'LOAD_ADJUST' | 'ADD';
      loadField: AiSuggestionField | null;
      loadDirection: LoadDirection | null;
      suggestionId: string;
    };

type LoadDirection = 'increase' | 'decrease' | 'neutral';

function fieldLabelHe(field: AiSuggestionField): string {
  if (field === 'reps') return 'חזרות';
  if (field === 'sets') return 'סטים';
  if (field === 'holdSeconds') return 'זמן החזקה (שנ׳)';
  return 'משקל (ק״ג)';
}

function pendingSourceTag(source: AiSuggestion['source'] | undefined): UnifiedActionSourceTag {
  if (source === 'guardian_patient' || source === 'gemini_portal') return 'בקשת מטופל';
  return 'המלצת מערכת';
}

function pendingActionType(type: AiSuggestion['type']): 'LOAD_ADJUST' | 'ADD' {
  return type === 'add_exercise' ? 'ADD' : 'LOAD_ADJUST';
}

function pendingLoadLabelDisplay(s: AiSuggestion): ClinicalActionLabelDisplay {
  if (s.type === 'add_exercise') {
    return { kind: 'plain', text: `הוסף ${s.exerciseName}` };
  }
  const prefix =
    s.suggestedValue > s.currentValue
      ? 'העלאת עומס'
      : 'הפחתת עומס';
  return {
    kind: 'load_adjust',
    prefix,
    exerciseName: s.exerciseName,
    fieldLabel: fieldLabelHe(s.field),
    currentValue: s.currentValue,
    suggestedValue: s.suggestedValue,
  };
}

/** Normalize plan-scoped ids for conflict matching. */
export function normalizeExerciseIdForConflict(id: string | null | undefined): string | null {
  if (!id?.trim()) return null;
  return id.trim();
}

function inferAiLoadField(mod: ClinicalModification): AiSuggestionField | null {
  if (mod.type !== 'LOAD_ADJUST') return null;
  if (mod.reps != null && mod.sets == null) return 'reps';
  if (mod.sets != null && mod.reps == null) return 'sets';
  if (mod.reps != null) return 'reps';
  return 'reps';
}

function actionExerciseId(action: UnifiedClinicalAction): string | null {
  if (action.kind === 'ai_modification') {
    if (action.actionType === 'ADD') {
      return normalizeExerciseIdForConflict(
        action.row.kind === 'exercise' ? action.row.item.newExerciseChainId : action.exerciseId
      );
    }
    return normalizeExerciseIdForConflict(action.exerciseId);
  }
  return normalizeExerciseIdForConflict(action.exerciseId);
}

function actionGroupKey(action: UnifiedClinicalAction): string {
  const exId = actionExerciseId(action);
  if (exId) return `ex:${exId}`;
  if (action.kind === 'ai_modification' && action.actionType === 'ADD') {
    const newId =
      action.row.kind === 'exercise' ? action.row.item.newExerciseChainId : null;
    if (newId) return `add:${newId}`;
  }
  return action.id;
}

/** Lower score = higher priority. */
export function actionPriorityScore(action: UnifiedClinicalAction): number {
  if (action.kind === 'ai_modification') {
    if (action.actionType === 'REPLACE' || action.actionType === 'REMOVE') return 0;
    return 1;
  }
  return 2;
}

function pendingLoadDirection(s: AiSuggestion): LoadDirection {
  if (s.suggestedValue > s.currentValue) return 'increase';
  if (s.suggestedValue < s.currentValue) return 'decrease';
  return 'neutral';
}

function actionLoadAdjustKey(action: UnifiedClinicalAction): string | null {
  const type = action.kind === 'ai_modification' ? action.actionType : action.actionType;
  if (type !== 'LOAD_ADJUST') return null;
  const exId = actionExerciseId(action);
  if (!exId || !action.loadField) return null;
  return `${exId}|${action.loadField}`;
}

function actionLoadDirection(action: UnifiedClinicalAction): LoadDirection {
  return action.loadDirection ?? 'neutral';
}

/** Rule 2 — drop opposing load adjustments on the same exercise + field. */
export function filterContradictingLoadAdjustments(
  actions: UnifiedClinicalAction[]
): UnifiedClinicalAction[] {
  const byKey = new Map<string, UnifiedClinicalAction[]>();
  for (const action of actions) {
    const key = actionLoadAdjustKey(action);
    if (!key) continue;
    const list = byKey.get(key) ?? [];
    list.push(action);
    byKey.set(key, list);
  }

  const dropIds = new Set<string>();
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const directions = new Set(group.map(actionLoadDirection).filter((d) => d !== 'neutral'));
    if (directions.size < 2) continue;
    const sorted = [...group].sort(
      (a, b) => actionPriorityScore(a) - actionPriorityScore(b) || a.id.localeCompare(b.id)
    );
    for (const action of sorted.slice(1)) dropIds.add(action.id);
  }

  return actions.filter((a) => !dropIds.has(a.id));
}

/** Rule 1 — one winning action per exercise group. */
export function dedupeOneActionPerExercise(
  actions: UnifiedClinicalAction[]
): UnifiedClinicalAction[] {
  const byGroup = new Map<string, UnifiedClinicalAction>();
  for (const action of actions) {
    const key = actionGroupKey(action);
    const existing = byGroup.get(key);
    if (!existing) {
      byGroup.set(key, action);
      continue;
    }
    const existingScore = actionPriorityScore(existing);
    const nextScore = actionPriorityScore(action);
    if (nextScore < existingScore) {
      byGroup.set(key, action);
    }
  }
  return [...byGroup.values()];
}

export function filterModificationConflicts(
  modifications: ClinicalModification[]
): ClinicalModification[] {
  const replaceOrRemoveIds = new Set<string>();
  for (const mod of modifications) {
    if (mod.type !== 'REPLACE' && mod.type !== 'REMOVE') continue;
    const id = normalizeExerciseIdForConflict(mod.currentExerciseId);
    if (id) replaceOrRemoveIds.add(id);
  }
  return modifications.filter((mod) => {
    if (mod.type !== 'LOAD_ADJUST') return true;
    const id = normalizeExerciseIdForConflict(mod.currentExerciseId);
    if (!id) return true;
    return !replaceOrRemoveIds.has(id);
  });
}

export function resolveUnifiedClinicalActions(
  actions: UnifiedClinicalAction[]
): UnifiedClinicalAction[] {
  return dedupeOneActionPerExercise(filterContradictingLoadAdjustments(actions));
}

export function buildUnifiedClinicalActions(params: {
  narrative: UnifiedClinicalNarrative | null;
  pendingSuggestions: AiSuggestion[];
  dismissedAiRowKeys: Set<string>;
  dismissedPendingIds: Set<string>;
  catalog?: ClinicalExerciseCatalog | null;
}): UnifiedClinicalAction[] {
  const raw: UnifiedClinicalAction[] = [];

  if (params.narrative) {
    const filteredMods = filterModificationConflicts(params.narrative.modifications);
    const narrativeWithFiltered: UnifiedClinicalNarrative = {
      ...params.narrative,
      modifications: filteredMods,
    };
    for (const row of flattenApprovableRows(narrativeWithFiltered)) {
      const key = approvableRowKey(row);
      if (params.dismissedAiRowKeys.has(key)) continue;
      const mod = filteredMods[row.index];
      if (!mod) continue;
      const labelDisplay = resolveModificationLabelDisplay(mod, params.catalog ?? undefined);
      raw.push({
        id: key,
        sourceTag: 'המלצת AI',
        label: labelDisplayToPlainText(labelDisplay),
        labelDisplay,
        rationale: mod.rationale?.trim() ?? '',
        kind: 'ai_modification',
        exerciseId: mod.currentExerciseId,
        actionType: mod.type,
        loadField: inferAiLoadField(mod),
        loadDirection: null,
        row,
      });
    }
  }

  for (const s of params.pendingSuggestions) {
    if (params.dismissedPendingIds.has(s.id)) continue;
    const labelDisplay = pendingLoadLabelDisplay(s);
    raw.push({
      id: `pending|${s.id}`,
      sourceTag: pendingSourceTag(s.source),
      label: labelDisplayToPlainText(labelDisplay),
      labelDisplay,
      rationale: s.reason.trim(),
      kind: 'pending_approval',
      exerciseId: s.exerciseId,
      actionType: pendingActionType(s.type),
      loadField: s.type === 'add_exercise' ? null : s.field,
      loadDirection: s.type === 'add_exercise' ? null : pendingLoadDirection(s),
      suggestionId: s.id,
    });
  }

  return resolveUnifiedClinicalActions(raw);
}
