-- One-time link: set patients.auth_user_id = auth.uid() when JWT user_metadata.patient_id matches.
-- Required because RLS patient UPDATE policies require auth_user_id = auth.uid() after link.

CREATE OR REPLACE FUNCTION public.link_patient_auth_user(p_patient_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  mid text;
BEGIN
  mid := (SELECT auth.jwt()) -> 'user_metadata' ->> 'patient_id';
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

COMMENT ON FUNCTION public.link_patient_auth_user(text) IS 'Portal first sign-in: binds auth.users to patients.auth_user_id when JWT user_metadata.patient_id matches';
