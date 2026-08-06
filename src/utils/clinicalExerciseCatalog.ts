/**
 * Compact exercise catalog for Clinical AI Insights — filtered by plan target areas.
 */

import { getCachedActiveExercises, getCachedExerciseById } from '../services/exerciseCatalogService';
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

  for (const lib of getCachedActiveExercises()) {
    if (!relevantAreas.has(lib.targetArea)) continue;
    if (seen.has(lib.id) || planAlreadyContainsCatalogId(planExercises, lib.id)) continue;
    seen.add(lib.id);
    available.push(libraryToCatalogEntry(lib));
  }

  available.sort((a, b) => a.name.localeCompare(b.name, 'he'));

  return { currentPlanExercises, availableCatalogExercises: available };
}

export type IntakeCatalogIdRow = {
  id: string;
  name: string;
  targetArea: string;
};

const DEFAULT_INTAKE_CATALOG_MAX = 60;

/**
 * Compact id/name/targetArea list for clinical-intake Gemini prompts.
 * Filters to hint body areas (Smart Clinical pattern); caps size to avoid full-bank dumps.
 */
export function buildIntakeCatalogIdListForPrompt(
  hintBodyAreas?: BodyArea[] | null,
  maxItems: number = DEFAULT_INTAKE_CATALOG_MAX
): IntakeCatalogIdRow[] {
  const areaFilter =
    hintBodyAreas && hintBodyAreas.length > 0 ? new Set<BodyArea>(hintBodyAreas) : null;

  const rows: IntakeCatalogIdRow[] = [];
  const seen = new Set<string>();

  const push = (id: string, name: string, targetArea: BodyArea) => {
    if (seen.has(id)) return;
    if (areaFilter && !areaFilter.has(targetArea)) return;
    seen.add(id);
    rows.push({ id, name, targetArea });
  };

  for (const chain of STRENGTH_EXERCISE_CHAINS) {
    for (const level of chain.levels) {
      push(level.id, level.name, chain.bodyArea);
    }
  }
  for (const lib of getCachedActiveExercises()) {
    push(lib.id, lib.name, lib.targetArea);
  }

  // If area filter yielded nothing (cache cold / odd areas), fall back to uncapped-by-area sample.
  if (rows.length === 0 && areaFilter) {
    for (const chain of STRENGTH_EXERCISE_CHAINS) {
      for (const level of chain.levels) {
        if (seen.has(level.id)) continue;
        seen.add(level.id);
        rows.push({ id: level.id, name: level.name, targetArea: chain.bodyArea });
      }
    }
    for (const lib of getCachedActiveExercises()) {
      if (seen.has(lib.id)) continue;
      seen.add(lib.id);
      rows.push({ id: lib.id, name: lib.name, targetArea: lib.targetArea });
    }
  }

  rows.sort((a, b) => a.name.localeCompare(b.name, 'he'));
  const cap = Math.max(5, maxItems);
  return rows.slice(0, cap);
}

export function findCatalogExerciseById(
  catalogId: string
): {
  exercise: Exercise | StrengthExerciseLevelDef;
  bodyArea: BodyArea;
  source: 'library' | 'strength_chain';
} | null {
  const lib = getCachedExerciseById(catalogId);
  if (lib) return { exercise: lib, bodyArea: lib.targetArea, source: 'library' };

  for (const chain of STRENGTH_EXERCISE_CHAINS) {
    const level = chain.levels.find((l) => l.id === catalogId);
    if (level) return { exercise: level, bodyArea: chain.bodyArea, source: 'strength_chain' };
  }
  return null;
}
