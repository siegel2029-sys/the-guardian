-- Mirrors Patient.demographicsFreeText for Table Editor / reporting (overview “מגדר, גיל, עבודה…”).
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS demographics_free_text TEXT;

COMMENT ON COLUMN public.patients.demographics_free_text IS 'Free-text demographics line (mirrored from payload.demographicsFreeText)';
