-- Phase 6 (performance): roster-ordering index + Realtime on patients.
--
-- 1. fetchPatientPayloadsForTherapist orders by updated_at DESC filtered by
--    therapist_id; the existing idx_patients_therapist only covers the filter.
-- 2. Realtime UPDATE events on patients let the therapist dashboard refresh the
--    clinical queue on change instead of polling full payloads every 3 minutes.
--    RLS still applies to postgres_changes — therapists only receive their rows.

CREATE INDEX IF NOT EXISTS idx_patients_therapist_updated
  ON public.patients (therapist_id, updated_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'patients'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.patients;
  END IF;
END $$;
