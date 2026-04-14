-- Exercise plan versioning: multiple rows per patient, one active at a time.
-- Existing single-row-per-patient data becomes version 1 (active).

ALTER TABLE public.exercise_plans DROP CONSTRAINT IF EXISTS exercise_plans_pkey;

ALTER TABLE public.exercise_plans
  ADD COLUMN IF NOT EXISTS id UUID NOT NULL DEFAULT gen_random_uuid();

ALTER TABLE public.exercise_plans ADD PRIMARY KEY (id);

ALTER TABLE public.exercise_plans
  ADD COLUMN IF NOT EXISTS version_number INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS parent_plan_id UUID REFERENCES public.exercise_plans (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS change_summary TEXT;

COMMENT ON COLUMN public.exercise_plans.version_number IS 'Monotonic per patient lineage; increments when plan content changes.';
COMMENT ON COLUMN public.exercise_plans.is_active IS 'Only one row per patient_id may be true.';
COMMENT ON COLUMN public.exercise_plans.parent_plan_id IS 'Previous plan row when this version replaced an active plan.';
COMMENT ON COLUMN public.exercise_plans.change_summary IS 'Optional therapist note for this version (e.g. load change).';

CREATE UNIQUE INDEX IF NOT EXISTS exercise_plans_one_active_per_patient
  ON public.exercise_plans (patient_id)
  WHERE is_active;

CREATE INDEX IF NOT EXISTS exercise_plans_patient_version
  ON public.exercise_plans (patient_id, version_number DESC);

CREATE INDEX IF NOT EXISTS exercise_plans_patient_inactive
  ON public.exercise_plans (patient_id)
  WHERE NOT is_active;
