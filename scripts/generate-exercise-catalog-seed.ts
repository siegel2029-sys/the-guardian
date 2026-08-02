/**
 * One-time generator: emits supabase/migrations/*_seed_exercise_catalog.sql
 * from EXERCISE_LIBRARY. Does NOT connect to the database.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXERCISE_LIBRARY } from '../src/data/mockData';

function sqlStr(v: string | null | undefined): string {
  if (v == null) return 'NULL';
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function sqlNum(v: number | null | undefined): string {
  return v == null || Number.isNaN(v) ? 'NULL' : String(v);
}

const outPath = resolve(
  'supabase/migrations/20260802142027_seed_exercise_catalog.sql'
);

const rows = EXERCISE_LIBRARY.map((ex, i) => {
  const vals = [
    sqlStr(ex.id),
    sqlStr(ex.name),
    sqlStr(ex.muscleGroup),
    sqlStr(ex.targetArea),
    sqlNum(ex.sets),
    sqlNum(ex.reps ?? null),
    sqlNum(ex.holdSeconds ?? null),
    sqlNum(ex.difficulty),
    sqlStr(ex.type),
    sqlStr(ex.instructions ?? ''),
    sqlNum(ex.xpReward),
    sqlStr(ex.videoPlaceholder ?? null),
    sqlStr(ex.videoUrl ?? ''),
    sqlStr(ex.clinicalRegressionHint ?? null),
    sqlStr(ex.clinicalProgressionHint ?? null),
    'true',
    sqlNum(i + 1),
  ].join(', ');
  return `  (${vals})`;
});

const sql = `-- Deterministic seed of exercise_catalog from former static EXERCISE_LIBRARY.
-- Review default_video_url values before applying.
-- Idempotent: ON CONFLICT (id) DO UPDATE.

INSERT INTO public.exercise_catalog (
  id,
  name,
  muscle_group,
  target_area,
  sets,
  reps,
  hold_seconds,
  difficulty,
  type,
  instructions,
  xp_reward,
  video_placeholder,
  default_video_url,
  clinical_regression_hint,
  clinical_progression_hint,
  is_active,
  sort_order
)
VALUES
${rows.join(',\n')}
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  muscle_group = EXCLUDED.muscle_group,
  target_area = EXCLUDED.target_area,
  sets = EXCLUDED.sets,
  reps = EXCLUDED.reps,
  hold_seconds = EXCLUDED.hold_seconds,
  difficulty = EXCLUDED.difficulty,
  type = EXCLUDED.type,
  instructions = EXCLUDED.instructions,
  xp_reward = EXCLUDED.xp_reward,
  video_placeholder = EXCLUDED.video_placeholder,
  default_video_url = EXCLUDED.default_video_url,
  clinical_regression_hint = EXCLUDED.clinical_regression_hint,
  clinical_progression_hint = EXCLUDED.clinical_progression_hint,
  is_active = EXCLUDED.is_active,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- Expected row count: ${EXERCISE_LIBRARY.length}
`;

writeFileSync(outPath, sql, 'utf8');
console.log(`Wrote ${EXERCISE_LIBRARY.length} rows → ${outPath}`);
const hosted = EXERCISE_LIBRARY.filter((e) =>
  (e.videoUrl || '').includes('supabase.co')
);
console.log(`Hosted supabase video URLs: ${hosted.length}`);
for (const e of hosted) {
  console.log(`${e.id}: ${e.videoUrl}`);
}
