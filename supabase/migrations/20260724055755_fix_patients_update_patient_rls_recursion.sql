-- =============================================================================
-- HOTFIX: patients_update_patient RLS infinite recursion (portal exercise save)
-- =============================================================================
-- Phase 5 WITH CHECK subselected public.patients to "prove" therapist_id /
-- account_frozen / status / auth_user_id were unchanged. Those subqueries
-- re-enter RLS on the same relation →
--   ERROR: infinite recursion detected in policy for relation "patients"
-- which surfaces in the portal as:
--   "שמירת התקדמות לענן נכשלה: שגיאת שרת בגישה לנתונים."
--
-- RLS cannot see OLD row values in WITH CHECK. Immutability of control columns
-- (and payload freeze keys) is already enforced by
-- tg_patients_lock_patient_controlled_columns (BEFORE UPDATE). Keep that trigger
-- and simplify the policy to a non-recursive auth_user_id ownership check.
-- =============================================================================

DROP POLICY IF EXISTS "patients_update_patient" ON public.patients;
CREATE POLICY "patients_update_patient"
  ON public.patients
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()))
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

COMMENT ON POLICY "patients_update_patient" ON public.patients IS
  'Portal patient may UPDATE own row (auth_user_id = auth.uid()). Control-column immutability is enforced by trg_patients_zz_lock_patient_controlled_columns — do not subquery patients here (RLS recursion).';

-- Ensure the Phase 5 lock trigger is present (idempotent re-apply).
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
  'Blocks portal patients from mutating therapist_id, auth linkage, or freeze/status (columns + payload keys).';

DROP TRIGGER IF EXISTS trg_patients_zz_lock_patient_controlled_columns ON public.patients;
CREATE TRIGGER trg_patients_zz_lock_patient_controlled_columns
  BEFORE UPDATE ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_patients_lock_patient_controlled_columns();

REVOKE ALL ON FUNCTION public.tg_patients_lock_patient_controlled_columns() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_patients_lock_patient_controlled_columns() FROM anon, authenticated;
