-- Allow therapists to delete patient rows they own (dashboard «מחק לצמיתות»).
-- Cascades remove exercise_plans / session_history rows referencing patients.id.

DROP POLICY IF EXISTS "patients_delete_therapist" ON public.patients;

CREATE POLICY "patients_delete_therapist"
  ON public.patients
  FOR DELETE
  TO authenticated
  USING (therapist_id = (SELECT auth.uid())::text);

-- FK cascades issue DELETE on children — grant therapist-scoped DELETE where RLS applies.

DROP POLICY IF EXISTS "exercise_plans_delete_therapist" ON public.exercise_plans;
CREATE POLICY "exercise_plans_delete_therapist"
  ON public.exercise_plans
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = exercise_plans.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "session_history_delete_therapist" ON public.session_history;
CREATE POLICY "session_history_delete_therapist"
  ON public.session_history
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = session_history.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "clinical_audit_logs_delete_therapist" ON public.clinical_audit_logs;
CREATE POLICY "clinical_audit_logs_delete_therapist"
  ON public.clinical_audit_logs
  FOR DELETE
  TO authenticated
  USING (therapist_id = (SELECT auth.uid())::text);
