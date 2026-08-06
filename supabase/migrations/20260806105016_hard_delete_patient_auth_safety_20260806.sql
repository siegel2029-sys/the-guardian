-- =============================================================================
-- hard_delete_patient: free email via auth.users delete + therapist safety lock
-- =============================================================================
-- Explicitly deletes the linked auth.users row (after refusing therapist accounts),
-- then deletes public.patients. Also harden AFTER DELETE trigger so therapist
-- auth rows are never cascaded away from other delete paths.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.hard_delete_patient(p_patient_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid text := (SELECT auth.uid())::text;
  v_role text := COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '');
  v_pid text := nullif(btrim(coalesce(p_patient_id, '')), '');
  v_tid text;
  v_auth_uid uuid;
  v_target_role text;
  v_is_profile boolean;
BEGIN
  IF v_uid IS NULL OR v_role <> 'therapist' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;
  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_patient_id');
  END IF;

  SELECT therapist_id, auth_user_id
  INTO v_tid, v_auth_uid
  FROM public.patients
  WHERE id = v_pid
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF v_tid IS DISTINCT FROM v_uid THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden');
  END IF;

  -- Never delete the caller's own auth account (admin / therapist self-lock).
  IF v_auth_uid IS NOT NULL AND v_auth_uid::text = v_uid THEN
    RAISE EXCEPTION 'Cannot hard-delete a therapist account.';
  END IF;

  IF v_auth_uid IS NOT NULL THEN
    SELECT
      COALESCE(u.raw_app_meta_data ->> 'role', ''),
      EXISTS (
        SELECT 1
        FROM public.profiles pr
        WHERE pr.id = v_auth_uid::text
      )
    INTO v_target_role, v_is_profile
    FROM auth.users u
    WHERE u.id = v_auth_uid;

    IF FOUND AND (v_target_role = 'therapist' OR v_is_profile IS TRUE) THEN
      RAISE EXCEPTION 'Cannot hard-delete a therapist account.';
    END IF;

    -- Free the email address for re-registration.
    DELETE FROM auth.users WHERE id = v_auth_uid;
  END IF;

  DELETE FROM public.patients WHERE id = v_pid AND therapist_id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'delete_failed');
  END IF;

  RETURN jsonb_build_object('ok', true, 'patientId', v_pid);
END;
$$;

COMMENT ON FUNCTION public.hard_delete_patient(text) IS
  'Therapist-only hard delete of owned patient. Deletes linked auth.users (email free) after refusing therapist accounts; then deletes patients (clinical FKs cascade).';

REVOKE ALL ON FUNCTION public.hard_delete_patient(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hard_delete_patient(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hard_delete_patient(text) TO authenticated, service_role;

-- Defense in depth: patient DELETE trigger must never wipe a therapist auth row.
CREATE OR REPLACE FUNCTION public.handle_deleted_patient_auth()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_target_role text;
  v_is_profile boolean;
BEGIN
  IF OLD.auth_user_id IS NULL THEN
    RETURN OLD;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM auth.users u WHERE u.id = OLD.auth_user_id
  ) THEN
    RETURN OLD;
  END IF;

  SELECT
    COALESCE(u.raw_app_meta_data ->> 'role', ''),
    EXISTS (
      SELECT 1 FROM public.profiles pr WHERE pr.id = OLD.auth_user_id::text
    )
  INTO v_target_role, v_is_profile
  FROM auth.users u
  WHERE u.id = OLD.auth_user_id;

  IF v_target_role = 'therapist' OR v_is_profile IS TRUE THEN
    RAISE EXCEPTION 'Cannot hard-delete a therapist account.';
  END IF;

  DELETE FROM auth.users WHERE id = OLD.auth_user_id;
  RETURN OLD;
END;
$$;

COMMENT ON FUNCTION public.handle_deleted_patient_auth() IS
  'AFTER DELETE on patients: removes linked auth.users unless the account is a therapist (role or profiles row).';
