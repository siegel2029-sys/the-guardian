-- Patient portal legal consent (mirrors public.profiles legal columns).
-- Stored on patients because portal users have no profiles row (RLS blocks them).

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS privacy_accepted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS medical_disclaimer_accepted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.patients.terms_accepted IS
  'Portal patient accepted Terms of Use.';
COMMENT ON COLUMN public.patients.privacy_accepted IS
  'Portal patient accepted Privacy Policy.';
COMMENT ON COLUMN public.patients.medical_disclaimer_accepted IS
  'Portal patient accepted Medical Disclaimer.';
COMMENT ON COLUMN public.patients.legal_accepted_at IS
  'Timestamp when the portal patient accepted all mandatory legal terms.';
