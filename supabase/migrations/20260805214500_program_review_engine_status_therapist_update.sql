-- Therapists may update the non-PHI engine phase singleton (debug force-run + live badges).

DROP POLICY IF EXISTS "program_review_engine_status_update_therapist"
  ON public.program_review_engine_status;

CREATE POLICY "program_review_engine_status_update_therapist"
  ON public.program_review_engine_status
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  );

GRANT UPDATE ON public.program_review_engine_status TO authenticated;
