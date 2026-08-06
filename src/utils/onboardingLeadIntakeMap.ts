import type { BodyArea, InitialClinicalProfileExtras } from '../types';
import {
  hasAnyRedFlag,
  RED_FLAG_QUESTIONS,
  type RedFlagAnswers,
  type RedFlagId,
} from '../services/onboardingLeadService';
import { getCachedActiveExercises } from '../services/exerciseCatalogService';
import { analyzeClinicalNote } from './clinicalParser';
import { exerciseMatchesPrimary } from './clinicalBodyArea';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function asInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

function parseRedFlags(raw: unknown): RedFlagAnswers {
  const rec = asRecord(raw) ?? {};
  const out: RedFlagAnswers = {
    trauma: null,
    caudaEquina: null,
    systemic: null,
    motorWeakness: null,
    nightPain: null,
  };
  for (const id of Object.keys(out) as RedFlagId[]) {
    const v = rec[id];
    if (typeof v === 'boolean') out[id] = v;
  }
  return out;
}

/**
 * Map `onboarding_leads.questionnaire_data` into existing intake extras
 * (intakeStory / clinicalIntakeProfile / VAS / red flag) — no invented columns.
 */
export function mapQuestionnaireToInitialClinicalExtras(
  questionnaire: Record<string, unknown> | null | undefined,
  displayName: string,
  contact?: { phone?: string | null; email?: string | null }
): InitialClinicalProfileExtras {
  const q = questionnaire ?? {};
  const clinical = asRecord(q.clinical) ?? {};
  const redFlags = parseRedFlags(q.red_flags);

  const painLocation = asString(clinical.pain_location);
  const painLevel = asInt(clinical.pain_level);
  const aggravatingEasing = asString(clinical.aggravating_easing);
  const duration = asString(clinical.duration);
  const hardestActivities = asString(clinical.hardest_activities);
  const movementFear = asInt(clinical.movement_fear);
  const rehabGoal = asString(clinical.rehab_goal);

  const lines: string[] = ['=== אינטייק ממשפך הצטרפות (/join) ==='];
  if (displayName.trim()) lines.push(`שם: ${displayName.trim()}`);
  if (contact?.phone?.trim()) lines.push(`טלפון: ${contact.phone.trim()}`);
  if (contact?.email?.trim()) lines.push(`אימייל ליצירת קשר: ${contact.email.trim()}`);
  lines.push('', '--- תלונה קלינית ---');
  if (painLocation) lines.push(`מיקום כאב: ${painLocation}`);
  if (painLevel != null) lines.push(`עוצמת כאב (VAS): ${painLevel}/10`);
  if (duration) lines.push(`משך: ${duration}`);
  if (aggravatingEasing) lines.push(`מחמיר / מקל: ${aggravatingEasing}`);
  if (hardestActivities) lines.push(`פעילויות קשות: ${hardestActivities}`);
  if (movementFear != null) lines.push(`פחד מתנועה (1–5): ${movementFear}`);
  if (rehabGoal) lines.push(`מטרת שיקום: ${rehabGoal}`);
  lines.push('', '--- סינון דגלים אדומים ---');
  for (const { id, question } of RED_FLAG_QUESTIONS) {
    const answer = redFlags[id];
    const label = answer === true ? 'כן' : answer === false ? 'לא' : 'לא נענה';
    lines.push(`${label} — ${question}`);
  }

  return {
    displayName: displayName.trim() || undefined,
    intakeStory: lines.join('\n'),
    intakeVasScore: painLevel ?? undefined,
    intakeRedFlag: hasAnyRedFlag(redFlags) || undefined,
    clinicalDiagnosis: painLocation ? `תלונה עצמית: ${painLocation}` : undefined,
    clinicalIntakeProfile: rehabGoal ? { goals: [rehabGoal] } : undefined,
  };
}

/** Compact clinical text for {@link analyzeClinicalNote} (location, difficulty, goals, pain). */
export function buildProgramSeedTextFromQuestionnaire(
  questionnaire: Record<string, unknown> | null | undefined
): string {
  const clinical = asRecord(questionnaire?.clinical) ?? {};
  const parts = [
    asString(clinical.pain_location),
    asString(clinical.hardest_activities),
    asString(clinical.rehab_goal),
    asString(clinical.aggravating_easing),
    asString(clinical.duration),
  ].filter(Boolean);
  const pain = asInt(clinical.pain_level);
  if (pain != null) parts.push(`כאב ${pain}/10`);
  return parts.join('. ');
}

export type ProposedLeadProgram = {
  primaryBodyArea: BodyArea;
  libraryExerciseIds: string[];
  rationaleLinesHe: string[];
};

/**
 * Propose a preliminary exercise plan from onboarding questionnaire_data
 * using the existing clinical parser + exercise catalog (no invented schema).
 */
export function proposeProgramFromQuestionnaire(
  questionnaire: Record<string, unknown> | null | undefined,
  intakeStory?: string
): ProposedLeadProgram {
  const seed = [
    buildProgramSeedTextFromQuestionnaire(questionnaire),
    intakeStory?.trim() ?? '',
  ]
    .filter(Boolean)
    .join('\n');

  const analysis = analyzeClinicalNote(seed || 'גב תחתון שיקום');
  const primaryBodyArea = analysis.primaryBodyArea ?? 'back_lower';
  let libraryExerciseIds = analysis.proposedExercises.slice(0, 6).map((e) => e.id);

  if (libraryExerciseIds.length === 0) {
    libraryExerciseIds = getCachedActiveExercises()
      .filter((ex) => exerciseMatchesPrimary(ex, primaryBodyArea))
      .slice(0, 4)
      .map((e) => e.id);
  }

  return {
    primaryBodyArea,
    libraryExerciseIds,
    rationaleLinesHe: analysis.rationaleLinesHe,
  };
}
