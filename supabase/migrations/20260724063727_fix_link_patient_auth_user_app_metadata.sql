-- =============================================================================
-- HOTFIX: link_patient_auth_user 403 on portal load
-- =============================================================================
-- Live state (2026-07-24):
--   * Function already SECURITY DEFINER + EXECUTE for authenticated
--   * ALL portal auth users had patient_id ONLY in raw_user_meta_data
--   * NONE had raw_app_meta_data.patient_id
--   * RPC raised EXCEPTION 'not allowed' (42501) → PostgREST 403 Forbidden
--
-- Fix:
--   1) Backfill app_metadata.patient_id from user_metadata (validated vs patients)
--   2) link_patient_auth_user: idempotent when already linked; read claims from
--      auth.users (not only JWT); promote user→app metadata; soft-fail JSON
--      instead of RAISE (avoids noisy 403 on every portal load)
--   3) Reaffirm SECURITY DEFINER + GRANT EXECUTE to authenticated/service_role
-- =============================================================================

-- ── 1. Backfill app_metadata for existing clinic portal users ────────────────

UPDATE auth.users u
SET raw_app_meta_data =
  coalesce(u.raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object(
    'patient_id', btrim(coalesce(u.raw_user_meta_data ->> 'patient_id', '')),
    'role', 'patient',
    'tier', 'pro'
  )
WHERE btrim(coalesce(u.raw_app_meta_data ->> 'patient_id', '')) = ''
  AND btrim(coalesce(u.raw_user_meta_data ->> 'patient_id', '')) <> ''
  AND EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = btrim(u.raw_user_meta_data ->> 'patient_id')
      AND (p.auth_user_id IS NULL OR p.auth_user_id = u.id)
  );

-- ── 2. Harden / soften link_patient_auth_user ────────────────────────────────

CREATE OR REPLACE FUNCTION public.link_patient_auth_user(p_patient_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := (SELECT auth.uid());
  v_pid text := nullif(btrim(coalesce(p_patient_id, '')), '');
  v_claim text;
  v_am jsonb;
  v_um jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  END IF;

  IF v_pid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_patient_id');
  END IF;

  -- Already linked to this auth user — success (no metadata gate needed).
  IF EXISTS (
    SELECT 1
    FROM public.patients p
    WHERE p.id = v_pid
      AND p.auth_user_id IS NOT NULL
      AND p.auth_user_id = v_uid
  ) THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'already_linked');
  END IF;

  -- Prefer durable auth.users metadata over possibly-stale JWT claims.
  SELECT coalesce(u.raw_app_meta_data, '{}'::jsonb),
         coalesce(u.raw_user_meta_data, '{}'::jsonb)
  INTO v_am, v_um
  FROM auth.users u
  WHERE u.id = v_uid;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'auth_user_missing');
  END IF;

  v_claim := nullif(btrim(coalesce(v_am ->> 'patient_id', '')), '');
  IF v_claim IS NULL THEN
    v_claim := nullif(btrim(coalesce(v_um ->> 'patient_id', v_um ->> 'invite_code', '')), '');
  END IF;

  IF v_claim IS NULL OR v_claim <> v_pid THEN
    -- Soft fail — do NOT RAISE 42501 (that surfaces as HTTP 403 on every load).
    RETURN jsonb_build_object('ok', false, 'reason', 'claim_mismatch');
  END IF;

  -- Promote validated claim into app_metadata so future JWTs / RLS helpers work.
  IF nullif(btrim(coalesce(v_am ->> 'patient_id', '')), '') IS NULL THEN
    UPDATE auth.users
    SET raw_app_meta_data =
      coalesce(raw_app_meta_data, '{}'::jsonb)
      || jsonb_build_object(
        'patient_id', v_pid,
        'role', 'patient',
        'tier', 'pro'
      )
    WHERE id = v_uid;
  END IF;

  UPDATE public.patients
  SET auth_user_id = v_uid
  WHERE id = v_pid
    AND (auth_user_id IS NULL OR auth_user_id = v_uid);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_match');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

COMMENT ON FUNCTION public.link_patient_auth_user(text) IS
  'Portal link: SECURITY DEFINER. Idempotent when already linked. Reads claim from auth.users app_metadata (promotes from user_metadata). Soft-fails with JSON — never RAISE 42501.';

REVOKE ALL ON FUNCTION public.link_patient_auth_user(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_patient_auth_user(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.link_patient_auth_user(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.link_patient_auth_user(text) TO service_role;
