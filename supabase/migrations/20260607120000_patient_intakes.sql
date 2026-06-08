-- Versioned clinical intake records — one row per intake version (INSERT-only for new analyses).
CREATE TABLE IF NOT EXISTS public.patient_intakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT NOT NULL REFERENCES public.patients (id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  archived BOOLEAN NOT NULL DEFAULT false,
  intake_data JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_patient_intakes_patient
  ON public.patient_intakes (patient_id);

CREATE INDEX IF NOT EXISTS idx_patient_intakes_patient_created
  ON public.patient_intakes (patient_id, created_at);

COMMENT ON TABLE public.patient_intakes IS 'Historical intake versions per patient; intake_data holds structured fields snapshot';
COMMENT ON COLUMN public.patient_intakes.intake_data IS 'JSON: kind, fields, medicalSchema, comparativeMeta, immutable, label';

ALTER TABLE public.patient_intakes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patient_intakes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "patient_intakes_select_therapist" ON public.patient_intakes;
CREATE POLICY "patient_intakes_select_therapist"
  ON public.patient_intakes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_intakes.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "patient_intakes_select_patient" ON public.patient_intakes;
CREATE POLICY "patient_intakes_select_patient"
  ON public.patient_intakes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_intakes.patient_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "patient_intakes_insert_therapist" ON public.patient_intakes;
CREATE POLICY "patient_intakes_insert_therapist"
  ON public.patient_intakes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_intakes.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "patient_intakes_update_therapist" ON public.patient_intakes;
CREATE POLICY "patient_intakes_update_therapist"
  ON public.patient_intakes
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_intakes.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.patients p
      WHERE p.id = patient_intakes.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );
