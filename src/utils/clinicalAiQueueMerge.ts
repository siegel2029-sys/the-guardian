import type { AiSuggestion } from '../types';

const CLINICAL_ENGINE_SOURCES = new Set<AiSuggestion['source']>([
  'clinical_recommendation_engine',
  undefined,
]);

export function isUnhandledAiQueueItem(s: AiSuggestion): boolean {
  return s.status === 'pending' || s.status === 'awaiting_therapist';
}

/** Same exercise + adjustment category — safe to refresh in-place. */
export function clinicalRecommendationCategoryKey(s: AiSuggestion): string {
  return `${s.exerciseId}|${s.type}|${s.field}`;
}

function isMergeableEngineSuggestion(s: AiSuggestion, patientId: string): boolean {
  return (
    s.patientId === patientId &&
    isUnhandledAiQueueItem(s) &&
    CLINICAL_ENGINE_SOURCES.has(s.source)
  );
}

function suggestionContentChanged(a: AiSuggestion, b: AiSuggestion): boolean {
  return (
    a.currentValue !== b.currentValue ||
    a.suggestedValue !== b.suggestedValue ||
    a.reason !== b.reason ||
    a.exerciseName !== b.exerciseName ||
    a.type !== b.type ||
    a.field !== b.field
  );
}

export type MergeClinicalRecommendationResult = {
  next: AiSuggestion[];
  changed: boolean;
};

/**
 * Append or upsert a clinical-engine recommendation without removing existing unhandled items.
 * Same exercise/type/field → update in-place (stable id). Different category → append.
 */
export function mergeClinicalRecommendationIntoQueue(
  prev: AiSuggestion[],
  patientId: string,
  incoming: AiSuggestion | null
): MergeClinicalRecommendationResult {
  if (!incoming) {
    return { next: prev, changed: false };
  }

  const categoryKey = clinicalRecommendationCategoryKey(incoming);
  const existingIdx = prev.findIndex(
    (s) =>
      isMergeableEngineSuggestion(s, patientId) &&
      clinicalRecommendationCategoryKey(s) === categoryKey
  );

  if (existingIdx >= 0) {
    const existing = prev[existingIdx];
    const updated: AiSuggestion = {
      ...incoming,
      id: existing.id,
      createdAt: existing.createdAt,
      status: existing.status,
      patientId,
      source: incoming.source ?? 'clinical_recommendation_engine',
    };

    if (!suggestionContentChanged(existing, updated)) {
      return { next: prev, changed: false };
    }

    const next = [...prev];
    next[existingIdx] = updated;
    return { next, changed: true };
  }

  return {
    next: [...prev, incoming],
    changed: true,
  };
}

export function newClinicalAssessmentSuggestionId(patientId: string): string {
  return `ai-assess-${patientId}-${Date.now()}`;
}

export function appendTherapistNoteToReason(reason: string, notes: string): string {
  const trimmed = notes.trim();
  if (trimmed.length === 0) return reason;
  return `${reason}\n\nהערת מטפל: «${trimmed.slice(0, 120)}${trimmed.length > 120 ? '…' : ''}»`;
}
