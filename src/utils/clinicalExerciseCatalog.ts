/**
 * Compact exercise catalog for Clinical AI Insights — filtered by plan target areas.
 */

import { EXERCISE_LIBRARY } from '../data/mockData';
import {
  STRENGTH_EXERCISE_CHAINS,
  type StrengthExerciseLevelDef,
} from '../data/strengthExerciseDatabase';
import type { BodyArea, Exercise, Patient, PatientExercise } from '../types';
import { bodyAreaLabels } from '../types';

export type CatalogExerciseEntry = {
  id: string;
  name: string;
  targetArea: BodyArea;
  targetAreaLabel: string;
  level?: 1 | 2 | 3;
  source: 'library' | 'strength_chain';
  sets?: number;
  reps?: number;
  holdSeconds?: number;
};

export type ClinicalExerciseCatalog = {
  currentPlanExercises: {
    id: string;
    name: string;
    targetArea: BodyArea;
    targetAreaLabel: string;
    patientReps: number;
    patientSets: number;
    holdSeconds: number | null;
    patientWeightKg: number | null;
  }[];
  availableCatalogExercises: CatalogExerciseEntry[];
};

function collectRelevantBodyAreas(
  patient: Patient,
  planExercises: PatientExercise[]
): Set<BodyArea> {
  const areas = new Set<BodyArea>();
  areas.add(patient.primaryBodyArea);
  for (const ex of planExercises) {
    areas.add(ex.targetArea);
    for (const a of ex.targetAreas ?? []) areas.add(a);
  }
  return areas;
}

/** Extract base library / chain id embedded in a patient-scoped plan exercise id. */
export function extractBaseExerciseId(planExerciseId: string): string {
  const libMatch = planExerciseId.match(/(lib-[a-z0-9-]+)/i);
  if (libMatch) return libMatch[1];
  const strMatch = planExerciseId.match(/(str-[a-z0-9-]+)/i);
  if (strMatch) return strMatch[1];
  return planExerciseId;
}

function planAlreadyContainsCatalogId(
  planExercises: PatientExercise[],
  catalogId: string
): boolean {
  return planExercises.some(
    (ex) =>
      ex.id === catalogId ||
      ex.id.includes(catalogId) ||
      extractBaseExerciseId(ex.id) === catalogId
  );
}

function strengthLevelToCatalogEntry(
  level: StrengthExerciseLevelDef,
  bodyArea: BodyArea
): CatalogExerciseEntry {
  return {
    id: level.id,
    name: level.name,
    targetArea: bodyArea,
    targetAreaLabel: bodyAreaLabels[bodyArea],
    level: level.level,
    source: 'strength_chain',
    sets: level.sets,
    reps: level.repsAreSeconds ? undefined : level.reps,
    holdSeconds: level.repsAreSeconds ? level.reps : undefined,
  };
}

function libraryToCatalogEntry(ex: Exercise): CatalogExerciseEntry {
  return {
    id: ex.id,
    name: ex.name,
    targetArea: ex.targetArea,
    targetAreaLabel: bodyAreaLabels[ex.targetArea],
    source: 'library',
    sets: ex.sets,
    reps: ex.reps,
    holdSeconds: ex.holdSeconds,
  };
}

/**
 * Builds a token-efficient catalog: current plan + available exercises filtered
 * strictly to plan target areas and primary body area (never the full DB).
 */
export function buildClinicalExerciseCatalog(
  patient: Patient,
  planExercises: PatientExercise[]
): ClinicalExerciseCatalog {
  const relevantAreas = collectRelevantBodyAreas(patient, planExercises);

  const currentPlanExercises = planExercises.map((ex) => ({
    id: ex.id,
    name: ex.name,
    targetArea: ex.targetArea,
    targetAreaLabel: bodyAreaLabels[ex.targetArea],
    patientReps: ex.patientReps ?? ex.reps ?? 0,
    patientSets: ex.patientSets ?? ex.sets ?? 0,
    holdSeconds: ex.holdSeconds ?? null,
    patientWeightKg: ex.patientWeightKg ?? null,
  }));

  const available: CatalogExerciseEntry[] = [];
  const seen = new Set<string>();

  for (const chain of STRENGTH_EXERCISE_CHAINS) {
    if (!relevantAreas.has(chain.bodyArea)) continue;
    for (const level of chain.levels) {
      if (seen.has(level.id) || planAlreadyContainsCatalogId(planExercises, level.id)) continue;
      seen.add(level.id);
      available.push(strengthLevelToCatalogEntry(level, chain.bodyArea));
    }
  }

  for (const lib of EXERCISE_LIBRARY) {
    if (!relevantAreas.has(lib.targetArea)) continue;
    if (seen.has(lib.id) || planAlreadyContainsCatalogId(planExercises, lib.id)) continue;
    seen.add(lib.id);
    available.push(libraryToCatalogEntry(lib));
  }

  available.sort((a, b) => a.name.localeCompare(b.name, 'he'));

  return { currentPlanExercises, availableCatalogExercises: available };
}

export function findCatalogExerciseById(
  catalogId: string
): {
  exercise: Exercise | StrengthExerciseLevelDef;
  bodyArea: BodyArea;
  source: 'library' | 'strength_chain';
} | null {
  const lib = EXERCISE_LIBRARY.find((e) => e.id === catalogId);
  if (lib) return { exercise: lib, bodyArea: lib.targetArea, source: 'library' };

  for (const chain of STRENGTH_EXERCISE_CHAINS) {
    const level = chain.levels.find((l) => l.id === catalogId);
    if (level) return { exercise: level, bodyArea: chain.bodyArea, source: 'strength_chain' };
  }
  return null;
}
