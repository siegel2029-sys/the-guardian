-- =============================================================================
-- HOTFIX: allow portal PostgREST upsert of OWN existing patients row
-- =============================================================================
-- Old/current clients call .upsert() on patients. Upsert requires INSERT RLS.
-- Portal previously had UPDATE only → "new row violates row-level security".
--
-- Policy: INSERT allowed only when the target id already exists AND is linked to
-- auth.uid(). Blocks creating new patient rows; enables ON CONFLICT DO UPDATE
-- for the caller's own row even when auth_user_id is omitted from the payload.
-- Ownership check uses SECURITY DEFINER helper to avoid RLS recursion.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.patient_row_owned_by_caller(p_patient_id text)
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
      AND p.auth_user_id IS NOT NULL
      AND p.auth_user_id = (SELECT auth.uid())
  );
$$;

COMMENT ON FUNCTION public.patient_row_owned_by_caller(text) IS
  'RLS helper: true when patients.id is linked to auth.uid(). SECURITY DEFINER avoids policy recursion.';

REVOKE ALL ON FUNCTION public.patient_row_owned_by_caller(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.patient_row_owned_by_caller(text) TO authenticated;

DROP POLICY IF EXISTS "patients_insert_patient_own_existing" ON public.patients;
CREATE POLICY "patients_insert_patient_own_existing"
  ON public.patients
  FOR INSERT
  TO authenticated
  WITH CHECK (public.patient_row_owned_by_caller(id));

COMMENT ON POLICY "patients_insert_patient_own_existing" ON public.patients IS
  'Portal upsert compat: INSERT only when row id already belongs to caller (ON CONFLICT update path).';
