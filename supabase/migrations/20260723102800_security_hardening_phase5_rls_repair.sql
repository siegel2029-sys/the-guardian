-- =============================================================================
-- SECURITY HARDENING PHASE 5 — repair live RLS drift + patient control locks
-- =============================================================================
-- Live remote policies drifted from phase 1 intent after phase 4 consolidation:
--   * patients_update_patient lost therapist_id immutability (C1)
--   * app_knowledge_base writes were any-profile-holder (C5)
--   * profiles_insert_own reopened for portal patients (phase 4 regression)
-- Also harden link_patient_auth_user to prefer app_metadata and lock freeze columns
-- for patient self-updates (defense in depth beyond RLS WITH CHECK).
-- =============================================================================

-- ── 1a. Re-lock patients_update_patient (C1 + freeze / auth linkage) ─────────

DROP POLICY IF EXISTS "patients_update_patient" ON public.patients;
CREATE POLICY "patients_update_patient"
  ON public.patients
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()))
  WITH CHECK (
    auth_user_id = (SELECT auth.uid())
    AND therapist_id IS NOT DISTINCT FROM (
      SELECT p.therapist_id
      FROM public.patients p
      WHERE p.id = patients.id
    )
    AND account_frozen IS NOT DISTINCT FROM (
      SELECT p.account_frozen
      FROM public.patients p
      WHERE p.id = patients.id
    )
    AND status IS NOT DISTINCT FROM (
      SELECT p.status
      FROM public.patients p
      WHERE p.id = patients.id
    )
    AND auth_user_id IS NOT DISTINCT FROM (
      SELECT p.auth_user_id
      FROM public.patients p
      WHERE p.id = patients.id
    )
  );

COMMENT ON POLICY "patients_update_patient" ON public.patients IS
  'Phase5: patients may update own row only; therapist_id, auth_user_id, account_frozen, status immutable.';

-- Defense in depth: AFTER sync trigger, force-lock patient-controlled columns
-- and restore freeze keys in payload if the caller is the linked patient.
CREATE OR REPLACE FUNCTION public.tg_patients_lock_patient_controlled_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  caller uuid := (SELECT auth.uid());
  is_patient_self boolean;
BEGIN
  is_patient_self := (
    caller IS NOT NULL
    AND OLD.auth_user_id IS NOT NULL
    AND OLD.auth_user_id = caller
  );

  IF NOT is_patient_self THEN
    RETURN NEW;
  END IF;

  IF NEW.therapist_id IS DISTINCT FROM OLD.therapist_id
     OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
     OR NEW.account_frozen IS DISTINCT FROM OLD.account_frozen
     OR NEW.status IS DISTINCT FROM OLD.status
  THEN
    RAISE EXCEPTION 'patients: therapist_id, auth_user_id, account_frozen, and status are immutable for patient self-updates'
      USING ERRCODE = '42501';
  END IF;

  -- Prevent payload-driven freeze bypass (sync trigger reads these keys).
  IF NEW.payload IS NOT NULL AND jsonb_typeof(NEW.payload) = 'object'
     AND OLD.payload IS NOT NULL AND jsonb_typeof(OLD.payload) = 'object'
  THEN
    IF (NEW.payload -> 'accountFrozen') IS DISTINCT FROM (OLD.payload -> 'accountFrozen')
       OR (NEW.payload -> 'account_frozen') IS DISTINCT FROM (OLD.payload -> 'account_frozen')
       OR (NEW.payload -> 'status') IS DISTINCT FROM (OLD.payload -> 'status')
    THEN
      RAISE EXCEPTION 'patients: account control fields in payload are immutable for patient self-updates'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_patients_lock_patient_controlled_columns() IS
  'Phase5: blocks portal patients from mutating therapist_id, auth linkage, or freeze/status (columns + payload keys).';

DROP TRIGGER IF EXISTS trg_patients_zz_lock_patient_controlled_columns ON public.patients;
CREATE TRIGGER trg_patients_zz_lock_patient_controlled_columns
  BEFORE UPDATE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_patients_lock_patient_controlled_columns();

REVOKE ALL ON FUNCTION public.tg_patients_lock_patient_controlled_columns() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_patients_lock_patient_controlled_columns() FROM anon, authenticated;

-- ── 1b. Scope app_knowledge_base writes to owning therapist row only ────────
-- Do NOT authorize via editable user_metadata (Supabase security rule).

DROP POLICY IF EXISTS "app_knowledge_base_insert_therapist" ON public.app_knowledge_base;
CREATE POLICY "app_knowledge_base_insert_therapist"
  ON public.app_knowledge_base
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "app_knowledge_base_update_therapist" ON public.app_knowledge_base;
CREATE POLICY "app_knowledge_base_update_therapist"
  ON public.app_knowledge_base
  FOR UPDATE
  TO authenticated
  USING (
    id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  );

-- ── 1c. Fix profiles_insert_own (phase 4 regression) ────────────────────────
-- Therapists may insert their own profile; linked portal patients may not.
-- app_metadata.role + user_metadata.patient_id are defense-in-depth only.

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = (SELECT auth.uid())::text
    AND NOT EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.auth_user_id = (SELECT auth.uid())
    )
    AND COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '')
        IS DISTINCT FROM 'patient'
    AND ((SELECT auth.jwt()) -> 'user_metadata' ->> 'patient_id') IS NULL
  );

COMMENT ON POLICY "profiles_insert_own" ON public.profiles IS
  'Phase5: own-row insert for therapists only; blocks linked patients and patient-role JWTs.';

-- ── 1d. Harden link_patient_auth_user ───────────────────────────────────────
-- Prefer app_metadata.patient_id (not client-editable); fall back to user_metadata
-- for compatibility with existing portal signup flow until app_metadata is set at signup.

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
  'Phase5: bind auth.users to patients.auth_user_id; prefers app_metadata.patient_id, falls back to user_metadata.';
