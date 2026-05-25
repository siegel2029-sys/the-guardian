import type { AiSuggestion } from '../types';
import { addClinicalDays } from './clinicalCalendar';

const CLINICAL_ENGINE_SOURCES = new Set<AiSuggestion['source']>([
  'clinical_recommendation_engine',
  undefined,
]);

/** Default lookback for therapist-reviewed recommendations injected into the AI prompt. */
export const THERAPIST_REVIEW_HISTORY_DAYS = 14;

const TERMINAL_THERAPIST_STATUSES = new Set<AiSuggestion['status']>(['approved', 'dismissed']);

export function isTerminalTherapistAiSuggestionStatus(status: AiSuggestion['status']): boolean {
  return TERMINAL_THERAPIST_STATUSES.has(status);
}

export function isUnhandledAiQueueItem(s: AiSuggestion): boolean {
  return s.status === 'pending' || s.status === 'awaiting_therapist';
}

/** Same exercise + adjustment category — safe to refresh in-place. */
export function clinicalRecommendationCategoryKey(s: AiSuggestion): string {
  return `${s.exerciseId}|${s.type}|${s.field}`;
}

export type TherapistReviewedSuggestion = {
  categoryKey: string;
  status: 'approved' | 'dismissed';
  type: AiSuggestion['type'];
  field: AiSuggestion['field'];
  exerciseName: string;
  reason: string;
  reviewedAt: string;
};

function reviewTimestamp(s: AiSuggestion): string {
  return s.reviewedAt?.trim() || s.createdAt;
}

function isWithinReviewWindow(isoTimestamp: string, clinicalToday: string, windowDays: number): boolean {
  const cutoff = addClinicalDays(clinicalToday, -windowDays);
  return isoTimestamp.slice(0, 10) >= cutoff;
}

/** Recently therapist-approved or -dismissed recommendations for AI exclusion context. */
export function collectRecentTherapistReviewedSuggestions(
  suggestions: AiSuggestion[],
  patientId: string,
  clinicalToday: string,
  windowDays: number = THERAPIST_REVIEW_HISTORY_DAYS
): TherapistReviewedSuggestion[] {
  return suggestions
    .filter(
      (s) =>
        s.patientId === patientId &&
        isTerminalTherapistAiSuggestionStatus(s.status) &&
        isWithinReviewWindow(reviewTimestamp(s), clinicalToday, windowDays)
    )
    .map((s) => ({
      categoryKey: clinicalRecommendationCategoryKey(s),
      status: s.status as 'approved' | 'dismissed',
      type: s.type,
      field: s.field,
      exerciseName: s.exerciseName,
      reason: s.reason,
      reviewedAt: reviewTimestamp(s),
    }))
    .sort((a, b) => b.reviewedAt.localeCompare(a.reviewedAt));
}

export function therapistReviewedCategoryKeySet(
  reviewed: TherapistReviewedSuggestion[]
): Set<string> {
  return new Set(reviewed.map((r) => r.categoryKey));
}

export function buildTherapistReviewHistoryPromptSection(
  reviewed: TherapistReviewedSuggestion[]
): string {
  if (reviewed.length === 0) return '';

  const dismissed = reviewed.filter((r) => r.status === 'dismissed');
  const approved = reviewed.filter((r) => r.status === 'approved');

  const lines: string[] = [];

  if (dismissed.length > 0) {
    const items = dismissed
      .map(
        (r) =>
          `- ${r.type} on "${r.exerciseName}" (${r.field}): ${r.reason.slice(0, 160)}`
      )
      .join('\n');
    lines.push(
      `The therapist has already reviewed and DISMISSED the following recommendations for this patient recently:\n${items}\nDo NOT regenerate or suggest these same clinical adjustments again; instead, find alternative strategies or maintain the current plan unless an acute change occurred.`
    );
  }

  if (approved.length > 0) {
    const items = approved
      .map(
        (r) =>
          `- ${r.type} on "${r.exerciseName}" (${r.field}): ${r.reason.slice(0, 120)}`
      )
      .join('\n');
    lines.push(
      `The therapist has already APPROVED and applied these adjustments recently — do not re-propose the same change unless clinical data shows a new acute need:\n${items}`
    );
  }

  return lines.join('\n\n');
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

export type MergeClinicalRecommendationOptions = {
  /** Category keys blocked because therapist recently approved/dismissed them. */
  excludedCategoryKeys?: Set<string>;
};

/**
 * Append or upsert a clinical-engine recommendation without removing existing unhandled items.
 * Same exercise/type/field → update in-place (stable id). Different category → append.
 * Skips incoming items whose category matches a recently therapist-reviewed recommendation.
 */
export function mergeClinicalRecommendationIntoQueue(
  prev: AiSuggestion[],
  patientId: string,
  incoming: AiSuggestion | null,
  options?: MergeClinicalRecommendationOptions
): MergeClinicalRecommendationResult {
  if (!incoming) {
    return { next: prev, changed: false };
  }

  const categoryKey = clinicalRecommendationCategoryKey(incoming);
  if (options?.excludedCategoryKeys?.has(categoryKey)) {
    return { next: prev, changed: false };
  }

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
