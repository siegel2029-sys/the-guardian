-- =============================================================================
-- HOTFIX: portal patient progress save (Pain/RPE → patients UPDATE)
-- =============================================================================
-- After clearing patients_update_patient recursion, production still failed with:
--   1) "new row violates row-level security policy for table patients"
--      → client .upsert() requires INSERT; portal patients only have UPDATE.
--      (Client will switch portal path to UPDATE; this migration hardens DB.)
--   2) "not allowed" (42501) from tg_patients_lock_patient_controlled_columns
--      when payload accountFrozen/status keys differ in representation from OLD
--      (e.g. missing vs false), often after tg_patients_sync_account_control.
--
-- Fix: for patient self-updates, FORCE-restore immutable control columns + payload
-- keys instead of raising — gamification/XP saves must not be blocked by freeze
-- key shape. Therapists still mutate control via patients_update_therapist.
-- =============================================================================

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

  -- Force-lock control columns (do not raise — portal XP/session saves must succeed).
  NEW.therapist_id := OLD.therapist_id;
  NEW.auth_user_id := OLD.auth_user_id;
  NEW.account_frozen := OLD.account_frozen;
  NEW.status := OLD.status;

  -- Restore exact payload account-control keys from OLD so sync/merge shape
  -- differences cannot unfreeze or trip privilege errors.
  IF NEW.payload IS NOT NULL AND jsonb_typeof(NEW.payload) = 'object'
     AND OLD.payload IS NOT NULL AND jsonb_typeof(OLD.payload) = 'object'
  THEN
    NEW.payload := (NEW.payload - 'accountFrozen' - 'account_frozen' - 'status');

    IF OLD.payload ? 'accountFrozen' THEN
      NEW.payload := jsonb_set(NEW.payload, '{accountFrozen}', OLD.payload -> 'accountFrozen', true);
    END IF;
    IF OLD.payload ? 'account_frozen' THEN
      NEW.payload := jsonb_set(NEW.payload, '{account_frozen}', OLD.payload -> 'account_frozen', true);
    END IF;
    IF OLD.payload ? 'status' THEN
      NEW.payload := jsonb_set(NEW.payload, '{status}', OLD.payload -> 'status', true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_patients_lock_patient_controlled_columns() IS
  'Portal self-update: silently restores therapist_id, auth_user_id, account_frozen, status (columns + payload keys). Does not raise — allows XP/session payload saves.';

-- Keep trigger attached (idempotent).
DROP TRIGGER IF EXISTS trg_patients_zz_lock_patient_controlled_columns ON public.patients;
CREATE TRIGGER trg_patients_zz_lock_patient_controlled_columns
  BEFORE UPDATE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_patients_lock_patient_controlled_columns();

REVOKE ALL ON FUNCTION public.tg_patients_lock_patient_controlled_columns() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_patients_lock_patient_controlled_columns() FROM anon, authenticated;
