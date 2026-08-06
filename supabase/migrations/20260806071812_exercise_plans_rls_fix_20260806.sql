-- =============================================================================
-- exercise_plans RLS repair (2026-08-06)
-- =============================================================================
-- Nested RLS on patients inside exercise_plans policies can yield empty results
-- for legitimate therapists/patients. Use a SECURITY DEFINER ownership helper
-- (auth.uid()-scoped) so SELECT/INSERT/UPDATE/DELETE policies evaluate reliably.
-- Patients: SELECT only (writes go through complete_exercise_safe RPC).
-- Therapists: SELECT/INSERT/UPDATE/DELETE for assigned patients.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.exercise_plan_row_accessible(p_patient_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND (
        p.therapist_id = (SELECT auth.uid())::text
        OR p.auth_user_id = (SELECT auth.uid())
      )
  );
$$;

COMMENT ON FUNCTION public.exercise_plan_row_accessible(text) IS
  'True when the caller is the assigned therapist or linked portal patient for p_patient_id.';

CREATE OR REPLACE FUNCTION public.exercise_plan_row_therapist_owned(p_patient_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = p_patient_id
      AND p.therapist_id = (SELECT auth.uid())::text
  );
$$;

COMMENT ON FUNCTION public.exercise_plan_row_therapist_owned(text) IS
  'True when auth.uid() matches patients.therapist_id for p_patient_id.';

REVOKE ALL ON FUNCTION public.exercise_plan_row_accessible(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.exercise_plan_row_therapist_owned(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exercise_plan_row_accessible(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.exercise_plan_row_therapist_owned(text) TO authenticated;

ALTER TABLE public.exercise_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_plans FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "exercise_plans_select_therapist" ON public.exercise_plans;
DROP POLICY IF EXISTS "exercise_plans_select_patient" ON public.exercise_plans;
DROP POLICY IF EXISTS "exercise_plans_insert_therapist" ON public.exercise_plans;
DROP POLICY IF EXISTS "exercise_plans_update_therapist" ON public.exercise_plans;
DROP POLICY IF EXISTS "exercise_plans_update_patient" ON public.exercise_plans;
DROP POLICY IF EXISTS "exercise_plans_delete_therapist" ON public.exercise_plans;
DROP POLICY IF EXISTS "therapist_full_access" ON public.exercise_plans;

CREATE POLICY "exercise_plans_select_accessible"
  ON public.exercise_plans
  FOR SELECT
  TO authenticated
  USING (public.exercise_plan_row_accessible(patient_id));

CREATE POLICY "exercise_plans_insert_therapist"
  ON public.exercise_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (public.exercise_plan_row_therapist_owned(patient_id));

CREATE POLICY "exercise_plans_update_therapist"
  ON public.exercise_plans
  FOR UPDATE
  TO authenticated
  USING (public.exercise_plan_row_therapist_owned(patient_id))
  WITH CHECK (public.exercise_plan_row_therapist_owned(patient_id));

CREATE POLICY "exercise_plans_delete_therapist"
  ON public.exercise_plans
  FOR DELETE
  TO authenticated
  USING (public.exercise_plan_row_therapist_owned(patient_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.exercise_plans TO authenticated;
REVOKE ALL ON TABLE public.exercise_plans FROM anon;
