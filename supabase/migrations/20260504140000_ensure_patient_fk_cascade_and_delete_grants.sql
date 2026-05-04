-- Ensure FKs to public.patients(id) use ON DELETE CASCADE so deleting a patient removes:
--   exercise plans (תרגילים), session_history (יומני סשן / תיעוד יומי), clinical_audit_logs.
-- Extra clinical text often lives in patients.payload and is removed with that row.
--
-- Table-level DELETE for authenticated; RLS still restricts rows.

DO $$
DECLARE
  con RECORD;
BEGIN
  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.exercise_plans'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.patients'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.exercise_plans DROP CONSTRAINT %I', con.conname);
  END LOOP;

  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.session_history'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.patients'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.session_history DROP CONSTRAINT %I', con.conname);
  END LOOP;

  FOR con IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.clinical_audit_logs'::regclass
      AND c.contype = 'f'
      AND c.confrelid = 'public.patients'::regclass
  LOOP
    EXECUTE format('ALTER TABLE public.clinical_audit_logs DROP CONSTRAINT %I', con.conname);
  END LOOP;
END $$;

ALTER TABLE public.exercise_plans
  ADD CONSTRAINT exercise_plans_patient_id_fkey
  FOREIGN KEY (patient_id)
  REFERENCES public.patients (id)
  ON DELETE CASCADE;

ALTER TABLE public.session_history
  ADD CONSTRAINT session_history_patient_id_fkey
  FOREIGN KEY (patient_id)
  REFERENCES public.patients (id)
  ON DELETE CASCADE;

ALTER TABLE public.clinical_audit_logs
  ADD CONSTRAINT clinical_audit_logs_patient_id_fkey
  FOREIGN KEY (patient_id)
  REFERENCES public.patients (id)
  ON DELETE CASCADE;

-- Therapist: DELETE on own patient rows (multi-tenant safe).
DROP POLICY IF EXISTS "patients_delete_therapist" ON public.patients;
CREATE POLICY "patients_delete_therapist"
  ON public.patients
  FOR DELETE
  TO authenticated
  USING (therapist_id = (SELECT auth.uid())::text);

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

GRANT DELETE ON TABLE public.patients TO authenticated;
GRANT DELETE ON TABLE public.exercise_plans TO authenticated;
GRANT DELETE ON TABLE public.session_history TO authenticated;
GRANT DELETE ON TABLE public.clinical_audit_logs TO authenticated;
