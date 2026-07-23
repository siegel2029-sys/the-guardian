-- =============================================================================
-- Drop user_metadata fallback on link_patient_auth_user (account-takeover fix)
-- =============================================================================
-- Clinic invite patient_id is promoted into app_metadata at signup. Accepting
-- editable user_metadata.patient_id let any authenticated user claim an unlinked
-- clinic row. Require app_metadata.patient_id only.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.link_patient_auth_user(p_patient_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mid text;
  jwt jsonb := (SELECT auth.jwt());
BEGIN
  mid := NULLIF(btrim(coalesce(jwt -> 'app_metadata' ->> 'patient_id', '')), '');

  IF mid IS NULL OR mid <> p_patient_id THEN
    RAISE EXCEPTION 'not allowed' USING ERRCODE = '42501';
  END IF;

  UPDATE public.patients
  SET auth_user_id = auth.uid()
  WHERE id = p_patient_id
    AND (auth_user_id IS NULL OR auth_user_id = auth.uid());

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_match');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.link_patient_auth_user(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_patient_auth_user(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_patient_auth_user(text) TO service_role;

COMMENT ON FUNCTION public.link_patient_auth_user(text) IS
  'Portal first sign-in: binds auth.users to patients.auth_user_id when JWT app_metadata.patient_id matches (no user_metadata fallback).';
