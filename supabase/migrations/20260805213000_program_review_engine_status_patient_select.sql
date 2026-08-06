-- =============================================================================
-- Allow linked portal patients to SELECT the non-PHI engine phase singleton
-- (subtle background status indicator on the workout plan page).
-- =============================================================================

DROP POLICY IF EXISTS "program_review_engine_status_select_patient"
  ON public.program_review_engine_status;

CREATE POLICY "program_review_engine_status_select_patient"
  ON public.program_review_engine_status
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.auth_user_id IS NOT NULL
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

COMMENT ON POLICY "program_review_engine_status_select_patient"
  ON public.program_review_engine_status IS
  'Portal patients may read engine phase (idle/scanning/analyzing) — no PHI in this row.';
