-- PHYSIOSHIELD — When a therapist deletes a patient row, remove the linked Supabase Auth user.
--
-- Column mapping: public.patients.auth_user_id → auth.users.id (see 20260415100000_enable_rls_clinical.sql).
-- Portal sign-up / link_patient_auth_user populate auth_user_id; therapists never store their own uid here.
--
-- Runs as SECURITY DEFINER (postgres owner) so the trigger can DELETE from auth.users despite RLS/API restrictions.
-- Failures (e.g. Storage object ownership) abort the transaction so the patient row is not removed without auth cleanup.

CREATE OR REPLACE FUNCTION public.handle_deleted_patient_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF OLD.auth_user_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM auth.users u
       WHERE u.id = OLD.auth_user_id
     )
  THEN
    DELETE FROM auth.users
    WHERE id = OLD.auth_user_id;
  END IF;

  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.handle_deleted_patient_auth() IS
  'AFTER DELETE on patients: removes auth.users row when patients.auth_user_id was set. No-op when auth_user_id is null or user already gone.';

REVOKE ALL ON FUNCTION public.handle_deleted_patient_auth() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_patients_delete_auth_user ON public.patients;

CREATE TRIGGER trg_patients_delete_auth_user
  AFTER DELETE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_deleted_patient_auth();

COMMENT ON TRIGGER trg_patients_delete_auth_user ON public.patients IS
  'Cascades patient deletion to auth.users via handle_deleted_patient_auth()';
