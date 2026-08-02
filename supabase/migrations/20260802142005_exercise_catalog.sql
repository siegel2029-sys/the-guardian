-- Global exercise catalog (replaces static EXERCISE_LIBRARY in the client).
-- Non-PHI reference data: authenticated SELECT; therapist-only writes via app_metadata.role.

CREATE TABLE IF NOT EXISTS public.exercise_catalog (
  id text PRIMARY KEY,
  name text NOT NULL,
  muscle_group text NOT NULL,
  target_area text NOT NULL,
  sets integer NOT NULL DEFAULT 3,
  reps integer NULL,
  hold_seconds integer NULL,
  difficulty smallint NOT NULL,
  type text NOT NULL,
  instructions text NOT NULL DEFAULT '',
  xp_reward integer NOT NULL DEFAULT 20,
  video_placeholder text NULL,
  default_video_url text NOT NULL DEFAULT '',
  clinical_regression_hint text NULL,
  clinical_progression_hint text NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT exercise_catalog_difficulty_check CHECK (difficulty BETWEEN 1 AND 5),
  CONSTRAINT exercise_catalog_type_check CHECK (type IN ('clinical', 'standard')),
  CONSTRAINT exercise_catalog_sets_check CHECK (sets > 0),
  CONSTRAINT exercise_catalog_reps_check CHECK (reps IS NULL OR reps >= 0),
  CONSTRAINT exercise_catalog_hold_check CHECK (hold_seconds IS NULL OR hold_seconds >= 0)
);

CREATE INDEX IF NOT EXISTS exercise_catalog_is_active_idx
  ON public.exercise_catalog (is_active);

CREATE INDEX IF NOT EXISTS exercise_catalog_target_area_idx
  ON public.exercise_catalog (target_area);

CREATE INDEX IF NOT EXISTS exercise_catalog_muscle_group_idx
  ON public.exercise_catalog (muscle_group);

CREATE OR REPLACE FUNCTION public.set_exercise_catalog_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exercise_catalog_updated_at ON public.exercise_catalog;
CREATE TRIGGER trg_exercise_catalog_updated_at
  BEFORE UPDATE ON public.exercise_catalog
  FOR EACH ROW
  EXECUTE FUNCTION public.set_exercise_catalog_updated_at();

ALTER TABLE public.exercise_catalog ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exercise_catalog_select_authenticated" ON public.exercise_catalog;
CREATE POLICY "exercise_catalog_select_authenticated"
  ON public.exercise_catalog
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "exercise_catalog_insert_therapist" ON public.exercise_catalog;
CREATE POLICY "exercise_catalog_insert_therapist"
  ON public.exercise_catalog
  FOR INSERT
  TO authenticated
  WITH CHECK (
    COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'therapist'
  );

DROP POLICY IF EXISTS "exercise_catalog_update_therapist" ON public.exercise_catalog;
CREATE POLICY "exercise_catalog_update_therapist"
  ON public.exercise_catalog
  FOR UPDATE
  TO authenticated
  USING (
    COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'therapist'
  )
  WITH CHECK (
    COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'therapist'
  );

DROP POLICY IF EXISTS "exercise_catalog_delete_therapist" ON public.exercise_catalog;
CREATE POLICY "exercise_catalog_delete_therapist"
  ON public.exercise_catalog
  FOR DELETE
  TO authenticated
  USING (
    COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'therapist'
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercise_catalog TO authenticated;
GRANT ALL ON public.exercise_catalog TO service_role;

COMMENT ON TABLE public.exercise_catalog IS
  'Global clinic exercise catalog. default_video_url copies into patient plans on add-from-library; catalog edits do not rewrite existing plans.';
