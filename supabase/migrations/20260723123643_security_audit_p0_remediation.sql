-- Physio-Shield security audit P0 remediation (2026-07-23)
-- 1) Stop therapist self-claim via editable user_metadata.role
-- 2) Fix chat_messages_insert_patient therapist_id tautology
-- 3) Restore chat column-lock trigger (missing live)
-- 4) Gate patients INSERT on app_metadata.role=therapist
-- 5) treatment_reports UPDATE must re-check patient ownership
-- 6) Collapse dual patient→auth delete triggers; drop leftover delete_auth_* RPCs

-- ── 1) Auth promote: never trust user_metadata for therapist role ────────────
-- Therapist promotion is done only by register-therapist Edge Function
-- (service_role → app_metadata.role=therapist). This trigger handles:
--   clinic invite → patient + tier=pro
--   everything else → patient + tier=free

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
  -- Prefer app_metadata (server-set); still accept invite in user_metadata for
  -- client signUp portal flows that only write user_metadata at create time.
  v_patient_id := btrim(coalesce(
    v_am ->> 'patient_id',
    v_um ->> 'patient_id',
    v_um ->> 'invite_code',
    ''
  ));

  -- No clinic invite.
  IF v_patient_id = '' THEN
    -- Preserve therapist role only when already set on app_metadata (service_role /
    -- register-therapist Edge Function). Clients cannot write app_metadata on signUp.
    IF lower(btrim(coalesce(v_am ->> 'role', ''))) = 'therapist' THEN
      NEW.raw_app_meta_data := v_am || jsonb_build_object('role', 'therapist');
      IF (NEW.raw_app_meta_data ? 'tier') AND (NEW.raw_app_meta_data ->> 'tier') = 'free' THEN
        NEW.raw_app_meta_data := NEW.raw_app_meta_data - 'tier';
      END IF;
      IF NEW.raw_app_meta_data ? 'patient_id' THEN
        NEW.raw_app_meta_data := NEW.raw_app_meta_data - 'patient_id';
      END IF;
      RETURN NEW;
    END IF;

    NEW.raw_app_meta_data := v_am
      || jsonb_build_object(
        'role', 'patient',
        'tier', 'free'
      );
    IF NEW.raw_app_meta_data ? 'patient_id' THEN
      NEW.raw_app_meta_data := NEW.raw_app_meta_data - 'patient_id';
    END IF;
    RETURN NEW;
  END IF;

  SELECT p.auth_user_id
  INTO v_auth_user_id
  FROM public.patients p
  WHERE p.id = v_patient_id;

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
  'Clinic invite → app_metadata patient/pro. No invite → free patient. Therapist role is NEVER claimed from user_metadata (register-therapist Edge Function only).';

DROP TRIGGER IF EXISTS trg_auth_users_promote_clinic_patient_id ON auth.users;
CREATE TRIGGER trg_auth_users_promote_clinic_patient_id
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_auth_users_promote_clinic_patient_id();

REVOKE ALL ON FUNCTION public.tg_auth_users_promote_clinic_patient_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_auth_users_promote_clinic_patient_id() FROM anon, authenticated;

-- ── 2) Fix chat_messages_insert_patient tautology ────────────────────────────
-- Live bug: unqualified therapist_id inside FROM patients p resolved to
-- p.therapist_id, making `p.therapist_id = therapist_id` always true.

DROP POLICY IF EXISTS "chat_messages_insert_patient" ON public.chat_messages;
CREATE POLICY "chat_messages_insert_patient"
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    from_patient = true
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = chat_messages.patient_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND p.therapist_id = chat_messages.therapist_id
    )
  );

COMMENT ON POLICY "chat_messages_insert_patient" ON public.chat_messages IS
  'Linked patient may insert only when therapist_id matches their patients.therapist_id (qualified outer column).';

-- ── 3) Restore chat column-lock trigger ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.tg_chat_messages_restrict_update_columns()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.therapist_id IS DISTINCT FROM OLD.therapist_id
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.from_patient IS DISTINCT FROM OLD.from_patient
     OR NEW.ai_clinical_alert IS DISTINCT FROM OLD.ai_clinical_alert
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'chat_messages: only read_by_therapist and read_by_patient may be updated'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_chat_messages_restrict_update_columns() IS
  'Prevents tampering with chat message content or thread IDs; allows read-state toggles only.';

DROP TRIGGER IF EXISTS trg_chat_messages_restrict_update_columns ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_restrict_update_columns
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_chat_messages_restrict_update_columns();

-- ── 4) patients_insert_therapist — require app_metadata.role=therapist ────────
DROP POLICY IF EXISTS "patients_insert_therapist" ON public.patients;
CREATE POLICY "patients_insert_therapist"
  ON public.patients
  FOR INSERT
  TO authenticated
  WITH CHECK (
    therapist_id = (SELECT auth.uid())::text
    AND COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'therapist'
  );

COMMENT ON POLICY "patients_insert_therapist" ON public.patients IS
  'Therapists only: own therapist_id + app_metadata.role=therapist (no user_metadata).';

-- ── 5) treatment_reports UPDATE — re-check patient ownership ─────────────────
DROP POLICY IF EXISTS "treatment_reports_update_therapist" ON public.treatment_reports;
CREATE POLICY "treatment_reports_update_therapist"
  ON public.treatment_reports
  FOR UPDATE
  TO authenticated
  USING (therapist_id = (SELECT auth.uid()))
  WITH CHECK (
    therapist_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = treatment_reports.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

COMMENT ON POLICY "treatment_reports_update_therapist" ON public.treatment_reports IS
  'Therapist may update own reports only when patient_id remains owned by them.';

-- ── 6) Single patient→auth delete path; drop dual triggers + leftovers ───────
-- Prefer auth_user_id-based cleanup (safe). Drop email-based and experimental RPCs.

DROP TRIGGER IF EXISTS tr_cleanup_auth ON public.patients;
DROP TRIGGER IF EXISTS trg_patient_delete_auth_cleanup ON public.patients;
DROP TRIGGER IF EXISTS trg_patients_delete_auth_user ON public.patients;

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
  'AFTER DELETE on patients: removes auth.users row when patients.auth_user_id was set. No-op when null or already gone.';

REVOKE ALL ON FUNCTION public.handle_deleted_patient_auth() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_deleted_patient_auth() FROM anon, authenticated;

CREATE TRIGGER trg_patients_delete_auth_user
  AFTER DELETE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_deleted_patient_auth();

COMMENT ON TRIGGER trg_patients_delete_auth_user ON public.patients IS
  'Cascades patient deletion to auth.users via handle_deleted_patient_auth()';

-- Drop leftover experimental / email-based delete helpers (EXECUTE already revoked).
DROP FUNCTION IF EXISTS public.delete_auth_user_by_any_email();
DROP FUNCTION IF EXISTS public.delete_auth_user_by_contact_email();
DROP FUNCTION IF EXISTS public.delete_auth_user_by_email_final();
DROP FUNCTION IF EXISTS public.delete_auth_user_by_email_on_patient_delete();
DROP FUNCTION IF EXISTS public.delete_auth_user_by_id_on_patient_delete();
DROP FUNCTION IF EXISTS public.delete_auth_user_final_v3();
DROP FUNCTION IF EXISTS public.delete_auth_user_on_patient_delete();
DROP FUNCTION IF EXISTS public.handle_patient_delete_auth_cleanup();
