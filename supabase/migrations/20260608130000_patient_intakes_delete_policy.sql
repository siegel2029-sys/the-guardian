-- Allow therapists to hard-delete non-initial intake version rows.
DROP POLICY IF EXISTS "patient_intakes_delete_therapist" ON public.patient_intakes;
CREATE POLICY "patient_intakes_delete_therapist"
  ON public.patient_intakes
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_intakes.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );
