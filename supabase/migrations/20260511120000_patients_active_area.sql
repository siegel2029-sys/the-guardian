-- Primary clinical focus (אזור פעיל) — mirrored from patients.payload.primaryBodyArea for SQL / reporting.
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS active_area TEXT;

COMMENT ON COLUMN public.patients.active_area IS 'Active clinical body area key (mirrored from payload.primaryBodyArea)';
