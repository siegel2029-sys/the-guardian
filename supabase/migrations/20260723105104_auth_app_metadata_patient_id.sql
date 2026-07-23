-- =============================================================================
-- Phase 6: Promote clinic invite patient_id into auth.users.app_metadata
-- =============================================================================
-- before-user-created can only allow/reject (cannot mutate metadata). Clinic
-- invites still arrive as user_metadata.patient_id / invite_code (client-writable
-- claim for signup). Immediately after insert, this SECURITY DEFINER trigger
-- copies a *validated* patient id into raw_app_meta_data (Auth Admin equivalent),
-- which clients cannot edit. Store / freemium signups omit the claim → patient_id
-- stays absent/null in app_metadata.
-- =============================================================================

-- ── Update before-user-created: accept patient_id or invite_code ─────────────

CREATE OR REPLACE FUNCTION public.hook_before_user_created_guardian(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id text;
  v_auth_user_id uuid;
  v_um jsonb;
BEGIN
  v_um := coalesce(event -> 'user' -> 'user_metadata', '{}'::jsonb);
  -- Clinic invite claim (invite_code is an alias for the patients.id string).
  v_patient_id := btrim(coalesce(
    v_um ->> 'patient_id',
    v_um ->> 'invite_code',
    ''
  ));

  -- App Store / freemium / therapist signups — no clinic invite; allow.
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
  'Auth hook (before-user-created): clinic invite (patient_id/invite_code) requires an unlinked patients row; freemium signups (no claim) are allowed.';

REVOKE ALL ON FUNCTION public.hook_before_user_created_guardian(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.hook_before_user_created_guardian(jsonb) TO supabase_auth_admin;

-- ── AFTER INSERT on auth.users: promote validated invite → app_metadata ──────

CREATE OR REPLACE FUNCTION public.tg_auth_users_promote_clinic_patient_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_patient_id text;
  v_auth_user_id uuid;
  v_um jsonb := coalesce(NEW.raw_user_meta_data, '{}'::jsonb);
  v_am jsonb := coalesce(NEW.raw_app_meta_data, '{}'::jsonb);
BEGIN
  v_patient_id := btrim(coalesce(
    v_um ->> 'patient_id',
    v_um ->> 'invite_code',
    v_am ->> 'patient_id',
    ''
  ));

  -- Freemium / therapist: leave app_metadata.patient_id unset (null/absent).
  IF v_patient_id = '' THEN
    -- Explicitly ensure no stale patient_id key if somehow present without claim.
    IF v_am ? 'patient_id' AND (v_am ->> 'patient_id') IS DISTINCT FROM NULL
       AND btrim(coalesce(v_am ->> 'patient_id', '')) = '' THEN
      NEW.raw_app_meta_data := v_am - 'patient_id';
    END IF;
    RETURN NEW;
  END IF;

  SELECT p.auth_user_id
  INTO v_auth_user_id
  FROM public.patients p
  WHERE p.id = v_patient_id;

  -- Only promote when the invite is still a valid unlinked (or self-linked) clinic row.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'auth: clinic invite patient_id is not authorized'
      USING ERRCODE = '42501';
  END IF;

  IF v_auth_user_id IS NOT NULL AND v_auth_user_id IS DISTINCT FROM NEW.id THEN
    RAISE EXCEPTION 'auth: clinic invite already linked to another account'
      USING ERRCODE = '42501';
  END IF;

  NEW.raw_app_meta_data := v_am
    || jsonb_build_object(
      'patient_id', v_patient_id,
      'role', 'patient',
      'tier', 'pro'
    );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_auth_users_promote_clinic_patient_id() IS
  'Promotes validated clinic invite patient_id into raw_app_meta_data (tier=pro). Freemium signups leave patient_id unset.';

DROP TRIGGER IF EXISTS trg_auth_users_promote_clinic_patient_id ON auth.users;
CREATE TRIGGER trg_auth_users_promote_clinic_patient_id
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_auth_users_promote_clinic_patient_id();

REVOKE ALL ON FUNCTION public.tg_auth_users_promote_clinic_patient_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_auth_users_promote_clinic_patient_id() FROM anon, authenticated;

-- ── link_patient_auth_user: prefer app_metadata (already phase5); keep in sync ─

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
  IF mid IS NULL THEN
    mid := NULLIF(btrim(coalesce(jwt -> 'user_metadata' ->> 'patient_id', '')), '');
  END IF;

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
  'Portal first sign-in: prefers app_metadata.patient_id (clinic pro); falls back to user_metadata for legacy JWTs.';
