-- Denormalised patient demographics (snake_case) for SQL / Table Editor visibility.
-- Canonical data remains in patients.payload (JSONB).
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS contact_email TEXT NOT NULL DEFAULT '';

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS age INTEGER,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS birth_date DATE,
  ADD COLUMN IF NOT EXISTS occupation TEXT;

COMMENT ON COLUMN public.patients.contact_email IS 'Synthetic email for portal Auth (from portalUsername); not PHI mailbox';
COMMENT ON COLUMN public.patients.first_name IS 'Display / legal name (mirrored from payload.name)';
COMMENT ON COLUMN public.patients.age IS 'Age in years (mirrored from payload.age)';
COMMENT ON COLUMN public.patients.gender IS 'Clinical sex / gender label (mirrored from payload.clinicalSex)';
COMMENT ON COLUMN public.patients.birth_date IS 'Optional DOB when captured in-app';
COMMENT ON COLUMN public.patients.occupation IS 'Optional occupation when captured in payload.occupation';

-- Optional denormalised therapist on session rows (RLS still uses patients.therapist_id).
ALTER TABLE public.session_history
  ADD COLUMN IF NOT EXISTS therapist_id TEXT;

CREATE INDEX IF NOT EXISTS idx_session_history_therapist
  ON public.session_history (therapist_id)
  WHERE therapist_id IS NOT NULL;

COMMENT ON COLUMN public.session_history.therapist_id IS 'Therapist owning the patient at write time (mirrored from patients.therapist_id)';
