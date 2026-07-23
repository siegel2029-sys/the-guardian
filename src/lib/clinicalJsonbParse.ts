/**
 * Lightweight runtime guards for JSONB crossing the Supabase boundary.
 * Prefer these over bare `as Patient` / `as PatientExercise[]` at service edges.
 */

import type { Patient, PatientExercise } from '../types';
import { normalizeCachedPatientExercises } from '../utils/exercisePlanCanonical';

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Accepts a patients.payload-shaped object when it has a non-empty string `id`.
 * Does not deep-validate the full Patient schema (too large / evolving).
 */
export function tryParsePatientPayload(raw: unknown): Patient | null {
  if (!isPlainObject(raw)) return null;
  const id = raw.id;
  if (typeof id !== 'string' || id.trim().length === 0) return null;
  return raw as unknown as Patient;
}

/**
 * Filters JSONB exercise arrays to objects with a string `id`, then normalizes
 * display/set/rep fields used by portal + therapist UI.
 */
export function tryParsePatientExerciseArray(raw: unknown): PatientExercise[] {
  if (!Array.isArray(raw)) return [];
  const candidates: PatientExercise[] = [];
  for (const item of raw) {
    if (!isPlainObject(item)) continue;
    if (typeof item.id !== 'string' || item.id.trim().length === 0) continue;
    candidates.push(item as unknown as PatientExercise);
  }
  return normalizeCachedPatientExercises(candidates);
}

/** True when `raw` looks like a Patient payload (string id present). */
export function isPatientPayloadShape(raw: unknown): raw is Patient {
  return tryParsePatientPayload(raw) !== null;
}
