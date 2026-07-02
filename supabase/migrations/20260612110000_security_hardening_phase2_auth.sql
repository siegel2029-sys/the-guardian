-- Phase 2: Auth hardening
-- Fixes: C4 (patient account hijack via signup metadata)
--
-- Portal patients use synthetic auth emails (not collected at intake). The hook
-- therefore does NOT match contact_email — it only gates on patient row existence
-- and whether auth_user_id is still unlinked.

-- ── before_user_created hook: reject unauthorized portal signups ─────────────
-- Called by Supabase Auth before persisting auth.users (see config.toml).
--
-- Portal signup rules (user_metadata.patient_id present):
--   1. A row with that id exists in public.patients
--   2. patients.auth_user_id is NULL (not already linked to another auth user)

CREATE OR REPLACE FUNCTION public.hook_before_user_created_guardian(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id text;
  v_auth_user_id uuid;
BEGIN
  v_patient_id := btrim(coalesce(event -> 'user' -> 'user_metadata' ->> 'patient_id', ''));

  -- Non-portal signups (therapists, etc.) — no patient_id in metadata; allow.
  IF v_patient_id = '' THEN
    RETURN '{}'::jsonb;
  END IF;

  SELECT p.auth_user_id
  INTO v_auth_user_id
  FROM public.patients p
  WHERE p.id = v_patient_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'Patient portal signup is not authorized for this account.',
        'http_code', 403
      )
    );
  END IF;

  IF v_auth_user_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'error', jsonb_build_object(
        'message', 'This patient portal account is already activated.',
        'http_code', 409
      )
    );
  END IF;

  RETURN '{}'::jsonb;
END;
$$;

COMMENT ON FUNCTION public.hook_before_user_created_guardian(jsonb) IS
  'Auth hook (before-user-created): portal signups require a pre-existing patients row with auth_user_id IS NULL.';

REVOKE ALL ON FUNCTION public.hook_before_user_created_guardian(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hook_before_user_created_guardian(jsonb) TO supabase_auth_admin;

-- ── link_patient_auth_user: JWT patient_id match only (no email gate) ────────
-- Restores original linking semantics; signup hook above is the primary gate.

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

COMMENT ON FUNCTION public.link_patient_auth_user(text) IS
  'Portal first sign-in: binds auth.users to patients.auth_user_id when JWT user_metadata.patient_id matches.';
