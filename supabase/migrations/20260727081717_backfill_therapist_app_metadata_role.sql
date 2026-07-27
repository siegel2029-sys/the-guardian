-- =============================================================================
-- HOTFIX: backfill app_metadata.role=therapist for legacy clinic owners
-- =============================================================================
-- patients_insert_therapist requires:
--   therapist_id = auth.uid()::text
--   AND auth.jwt() -> app_metadata ->> role = 'therapist'
--
-- After security_audit_p0, therapist role is only set by register-therapist
-- (service_role). Legacy clinic accounts created earlier have a public.profiles
-- row (and own patients) but raw_app_meta_data.role is missing → UI treats them
-- as therapists via profiles fail-open, while INSERT RLS rejects new patients
-- with: "new row violates row-level security policy for table patients".
--
-- Scope: users who own a profiles row OR own patients.therapist_id, and are not
-- clinic/freemium patients (no patient_id / free / patient role claims).
-- Clients must refreshSession / re-login for the JWT to pick up the claim.
-- =============================================================================

UPDATE auth.users u
SET raw_app_meta_data =
  coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('role', 'therapist')
WHERE btrim(coalesce(u.raw_app_meta_data ->> 'role', '')) IS DISTINCT FROM 'therapist'
  AND btrim(coalesce(u.raw_app_meta_data ->> 'patient_id', '')) = ''
  AND btrim(coalesce(u.raw_user_meta_data ->> 'patient_id', '')) = ''
  AND btrim(coalesce(u.raw_app_meta_data ->> 'tier', '')) IS DISTINCT FROM 'free'
  AND btrim(coalesce(u.raw_app_meta_data ->> 'role', '')) IS DISTINCT FROM 'patient'
  AND (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = u.id::text
    )
    OR EXISTS (
      SELECT 1
      FROM public.patients pt
      WHERE pt.therapist_id = u.id::text
    )
  );
