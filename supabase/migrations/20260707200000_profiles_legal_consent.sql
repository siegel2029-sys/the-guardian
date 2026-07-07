-- PHYSIOSHIELD — Legal & compliance consent tracking on therapist profiles.
--
-- Adds the four columns the Legal Onboarding Gate (<LegalOnboardingModal />) writes when an
-- authenticated user accepts the Terms of Use, Privacy Policy and Medical Disclaimer.
-- Existing rows default to "not accepted" so every current user sees the gate exactly once.
--
-- Writes are covered by the existing RLS policies on public.profiles
-- (profiles_update_own: id = auth.uid()::text) — no new policies needed.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS privacy_accepted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS medical_disclaimer_accepted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS legal_accepted_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.terms_accepted IS
  'User accepted the Terms of Use (checkbox 2 of the legal onboarding gate).';
COMMENT ON COLUMN public.profiles.privacy_accepted IS
  'User accepted the Privacy Policy (checkbox 2 of the legal onboarding gate).';
COMMENT ON COLUMN public.profiles.medical_disclaimer_accepted IS
  'User confirmed reading the Medical Disclaimer and safe-practice terms (checkbox 3 of the legal onboarding gate).';
COMMENT ON COLUMN public.profiles.legal_accepted_at IS
  'Client timestamp (ISO string) of the moment all legal terms were accepted; NULL until accepted.';
