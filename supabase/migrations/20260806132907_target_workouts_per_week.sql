-- Flexible weekly workout target for exercise plans (1–7 days/week).
-- Default 7 preserves legacy "every day" expectation.

ALTER TABLE public.exercise_plans
  ADD COLUMN IF NOT EXISTS target_workouts_per_week integer NOT NULL DEFAULT 7;

ALTER TABLE public.exercise_plans
  DROP CONSTRAINT IF EXISTS exercise_plans_target_workouts_per_week_check;

ALTER TABLE public.exercise_plans
  ADD CONSTRAINT exercise_plans_target_workouts_per_week_check
  CHECK (target_workouts_per_week >= 1 AND target_workouts_per_week <= 7);

COMMENT ON COLUMN public.exercise_plans.target_workouts_per_week IS
  'Therapist-set weekly session target (1–7). Used by gap-aware adherence; excess sessions do not roll over.';
