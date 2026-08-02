import type { BodyArea, Exercise, ExerciseDifficulty, ExerciseType } from '../types';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { DEFAULT_EXERCISE_DEMO_VIDEO_URL } from '../data/exerciseVideoDefaults';

/** DB row shape for public.exercise_catalog (matches migrations). */
export type ExerciseCatalogRow = {
  id: string;
  name: string;
  muscle_group: string;
  target_area: string;
  sets: number;
  reps: number | null;
  hold_seconds: number | null;
  difficulty: number;
  type: string;
  instructions: string;
  xp_reward: number;
  video_placeholder: string | null;
  default_video_url: string;
  clinical_regression_hint: string | null;
  clinical_progression_hint: string | null;
  is_active: boolean;
  sort_order: number | null;
  created_at?: string;
  updated_at?: string;
};

export type ExerciseCatalogInput = {
  id?: string;
  name: string;
  muscleGroup: string;
  targetArea: BodyArea;
  sets: number;
  reps?: number | null;
  holdSeconds?: number | null;
  difficulty: ExerciseDifficulty;
  type: ExerciseType;
  instructions: string;
  xpReward?: number;
  videoPlaceholder?: string | null;
  defaultVideoUrl?: string;
  clinicalRegressionHint?: string | null;
  clinicalProgressionHint?: string | null;
  isActive?: boolean;
  sortOrder?: number | null;
};

export type ExerciseCatalogPatch = Partial<ExerciseCatalogInput>;

// ── In-memory cache (AI / sync consumers) ─────────────────────────

let cachedRows: ExerciseCatalogRow[] = [];
let cachedAt = 0;
let prefetchPromise: Promise<ExerciseCatalogRow[]> | null = null;

function setCache(rows: ExerciseCatalogRow[]): void {
  cachedRows = rows;
  cachedAt = Date.now();
}

function upsertCacheRow(row: ExerciseCatalogRow): void {
  const idx = cachedRows.findIndex((r) => r.id === row.id);
  if (idx >= 0) {
    const next = cachedRows.slice();
    next[idx] = row;
    cachedRows = next;
  } else {
    cachedRows = [...cachedRows, row].sort(
      (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id.localeCompare(b.id)
    );
  }
  cachedAt = Date.now();
}

/** Sync: full cache (may include inactive if last fetch requested them). */
export function getCachedExerciseCatalog(): ExerciseCatalogRow[] {
  return cachedRows;
}

/** Sync: active catalog mapped to Exercise (empty array if not yet prefetched). */
export function getCachedActiveExercises(): Exercise[] {
  return cachedRows.filter((r) => r.is_active).map(catalogRowToExercise);
}

export function getCachedExerciseById(id: string): Exercise | undefined {
  const row = cachedRows.find((r) => r.id === id);
  return row ? catalogRowToExercise(row) : undefined;
}

export function getCachedCatalogByIdMap(): Map<string, { videoUrl: string }> {
  const map = new Map<string, { videoUrl: string }>();
  for (const row of cachedRows) {
    map.set(row.id, { videoUrl: row.default_video_url ?? '' });
  }
  return map;
}

export function getCachedCatalogIdList(): {
  id: string;
  name: string;
  targetArea: string;
}[] {
  return cachedRows
    .filter((r) => r.is_active)
    .map((r) => ({
      id: r.id,
      name: r.name,
      targetArea: r.target_area,
    }));
}

export function isExerciseCatalogCacheReady(): boolean {
  return cachedAt > 0 && cachedRows.length > 0;
}

export function catalogRowToExercise(row: ExerciseCatalogRow): Exercise {
  const difficulty = (Math.min(5, Math.max(1, row.difficulty || 1)) ||
    1) as ExerciseDifficulty;
  const type: ExerciseType = row.type === 'standard' ? 'standard' : 'clinical';
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    targetArea: row.target_area as BodyArea,
    sets: row.sets,
    ...(row.reps != null ? { reps: row.reps } : {}),
    ...(row.hold_seconds != null ? { holdSeconds: row.hold_seconds } : {}),
    difficulty,
    type,
    instructions: row.instructions ?? '',
    xpReward: row.xp_reward ?? 20,
    ...(row.video_placeholder ? { videoPlaceholder: row.video_placeholder } : {}),
    videoUrl: row.default_video_url ?? '',
    ...(row.clinical_regression_hint
      ? { clinicalRegressionHint: row.clinical_regression_hint }
      : {}),
    ...(row.clinical_progression_hint
      ? { clinicalProgressionHint: row.clinical_progression_hint }
      : {}),
  };
}

function areaPrefix(targetArea: string): string {
  if (targetArea.startsWith('back')) return 'lb';
  if (targetArea.startsWith('knee')) return 'kn';
  if (targetArea.startsWith('hip')) return 'hp';
  if (targetArea.startsWith('shoulder')) return 'sh';
  if (targetArea.startsWith('ankle') || targetArea.startsWith('foot')) return 'ak';
  return 'ot';
}

/** Generate next lib-{prefix}-{nn} id from cache + optional existing ids. */
export function generateCatalogExerciseId(targetArea: BodyArea): string {
  const prefix = areaPrefix(targetArea);
  let max = 0;
  const re = new RegExp(`^lib-${prefix}-(\\d+)$`);
  for (const row of cachedRows) {
    const m = row.id.match(re);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `lib-${prefix}-${String(max + 1).padStart(2, '0')}`;
}

/**
 * Fetch catalog into the module cache.
 * Always loads active + inactive so soft-deleted rows stay available to the manager
 * and AI/active getters can filter client-side without shrinking the cache.
 */
export async function fetchExerciseCatalog(_options?: {
  includeInactive?: boolean;
}): Promise<ExerciseCatalogRow[]> {
  if (!isSupabaseConfigured || !supabase) {
    return cachedRows;
  }
  const { data, error } = await supabase
    .from('exercise_catalog')
    .select('*')
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true });

  if (error) {
    throw new Error(error.message || 'Failed to fetch exercise catalog');
  }
  const rows = (data ?? []) as ExerciseCatalogRow[];
  setCache(rows);
  return rows;
}

/** Single-flight prefetch for app boot / AI readiness. */
export function prefetchExerciseCatalog(_options?: {
  includeInactive?: boolean;
}): Promise<ExerciseCatalogRow[]> {
  if (prefetchPromise) return prefetchPromise;
  prefetchPromise = fetchExerciseCatalog()
    .catch((err) => {
      prefetchPromise = null;
      throw err;
    })
    .then((rows) => {
      prefetchPromise = null;
      return rows;
    });
  return prefetchPromise;
}

export async function createCatalogExercise(
  input: ExerciseCatalogInput
): Promise<ExerciseCatalogRow> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured');
  }
  const id = input.id?.trim() || generateCatalogExerciseId(input.targetArea);
  const row = {
    id,
    name: input.name.trim(),
    muscle_group: input.muscleGroup.trim(),
    target_area: input.targetArea,
    sets: input.sets,
    reps: input.reps ?? null,
    hold_seconds: input.holdSeconds ?? null,
    difficulty: input.difficulty,
    type: input.type,
    instructions: input.instructions.trim(),
    xp_reward: input.xpReward ?? 20,
    video_placeholder: input.videoPlaceholder?.trim() || null,
    default_video_url:
      input.defaultVideoUrl?.trim() || DEFAULT_EXERCISE_DEMO_VIDEO_URL,
    clinical_regression_hint: input.clinicalRegressionHint?.trim() || null,
    clinical_progression_hint: input.clinicalProgressionHint?.trim() || null,
    is_active: input.isActive ?? true,
    sort_order: input.sortOrder ?? null,
  };
  const { data, error } = await supabase
    .from('exercise_catalog')
    .insert(row)
    .select('*')
    .single();
  if (error) throw new Error(error.message || 'Failed to create catalog exercise');
  const created = data as ExerciseCatalogRow;
  upsertCacheRow(created);
  return created;
}

export async function updateCatalogExercise(
  id: string,
  patch: ExerciseCatalogPatch
): Promise<ExerciseCatalogRow> {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured');
  }
  const update: Record<string, unknown> = {};
  if (patch.name !== undefined) update.name = patch.name.trim();
  if (patch.muscleGroup !== undefined) update.muscle_group = patch.muscleGroup.trim();
  if (patch.targetArea !== undefined) update.target_area = patch.targetArea;
  if (patch.sets !== undefined) update.sets = patch.sets;
  if (patch.reps !== undefined) update.reps = patch.reps;
  if (patch.holdSeconds !== undefined) update.hold_seconds = patch.holdSeconds;
  if (patch.difficulty !== undefined) update.difficulty = patch.difficulty;
  if (patch.type !== undefined) update.type = patch.type;
  if (patch.instructions !== undefined) update.instructions = patch.instructions.trim();
  if (patch.xpReward !== undefined) update.xp_reward = patch.xpReward;
  if (patch.videoPlaceholder !== undefined) {
    update.video_placeholder = patch.videoPlaceholder?.trim() || null;
  }
  if (patch.defaultVideoUrl !== undefined) {
    update.default_video_url = patch.defaultVideoUrl.trim();
  }
  if (patch.clinicalRegressionHint !== undefined) {
    update.clinical_regression_hint = patch.clinicalRegressionHint?.trim() || null;
  }
  if (patch.clinicalProgressionHint !== undefined) {
    update.clinical_progression_hint = patch.clinicalProgressionHint?.trim() || null;
  }
  if (patch.isActive !== undefined) update.is_active = patch.isActive;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;

  const { data, error } = await supabase
    .from('exercise_catalog')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw new Error(error.message || 'Failed to update catalog exercise');
  const updated = data as ExerciseCatalogRow;
  upsertCacheRow(updated);
  return updated;
}

export async function setCatalogExerciseActive(
  id: string,
  isActive: boolean
): Promise<ExerciseCatalogRow> {
  return updateCatalogExercise(id, { isActive });
}
