-- Clinical audit trail: therapist-visible history of patient record and plan changes.
-- therapist_id / patient_id use TEXT to match public.profiles.id and public.patients.id (app string IDs).

CREATE TABLE IF NOT EXISTS public.clinical_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  therapist_id TEXT NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  patient_id TEXT NOT NULL REFERENCES public.patients (id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clinical_audit_logs_patient_created
  ON public.clinical_audit_logs (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_clinical_audit_logs_therapist
  ON public.clinical_audit_logs (therapist_id);

COMMENT ON TABLE public.clinical_audit_logs IS 'Therapist-only audit trail; patients have no RLS access';

ALTER TABLE public.clinical_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clinical_audit_logs FORCE ROW LEVEL SECURITY;

-- Therapists: read own audit rows (by therapist_id = auth uid as text)
DROP POLICY IF EXISTS "clinical_audit_logs_select_therapist" ON public.clinical_audit_logs;
CREATE POLICY "clinical_audit_logs_select_therapist"
  ON public.clinical_audit_logs
  FOR SELECT
  TO authenticated
  USING (therapist_id = (SELECT auth.uid())::text);

-- Therapists: insert only for patients they own (no patient-role writes)
DROP POLICY IF EXISTS "clinical_audit_logs_insert_therapist" ON public.clinical_audit_logs;
CREATE POLICY "clinical_audit_logs_insert_therapist"
  ON public.clinical_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    therapist_id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = clinical_audit_logs.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

-- No UPDATE/DELETE policies — immutable log (service role bypasses RLS for admin tasks)
