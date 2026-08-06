-- =============================================================================
-- Self-guided / unassisted plan: allow_chat gate (Iron Rule 3)
-- =============================================================================
-- Clinic patients on the Paybox self-guided track must not open therapist chat.
-- Mirror account_frozen: first-class column + payload.allowChat sync + portal lock.
-- =============================================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS allow_chat boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.patients.allow_chat IS
  'When false, patient portal direct chat is locked (self-guided / unassisted plan). Synced from payload.allowChat.';

-- Backfill from existing JSONB payload (camelCase + snake_case).
UPDATE public.patients p
SET allow_chat = COALESCE(
  CASE
    WHEN (p.payload ->> 'allowChat') ILIKE 'false' THEN false
    WHEN (p.payload ->> 'allow_chat') ILIKE 'false' THEN false
    WHEN (p.payload ->> 'allowChat') = 'f' THEN false
    WHEN (p.payload ->> 'allow_chat') = 'f' THEN false
    WHEN (p.payload -> 'allowChat') = 'false'::jsonb THEN false
    WHEN (p.payload -> 'allow_chat') = 'false'::jsonb THEN false
    ELSE true
  END,
  true
);

CREATE INDEX IF NOT EXISTS idx_patients_allow_chat_false
  ON public.patients (allow_chat)
  WHERE allow_chat = false;

CREATE OR REPLACE FUNCTION public.tg_patients_sync_allow_chat()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.payload IS NULL OR jsonb_typeof(NEW.payload) <> 'object' THEN
    NEW.allow_chat := COALESCE(NEW.allow_chat, true);
    RETURN NEW;
  END IF;

  IF NEW.payload ? 'allowChat' OR NEW.payload ? 'allow_chat' THEN
    NEW.allow_chat := NOT (
      (NEW.payload ->> 'allowChat') ILIKE 'false'
      OR (NEW.payload ->> 'allow_chat') ILIKE 'false'
      OR (NEW.payload ->> 'allowChat') = 'f'
      OR (NEW.payload ->> 'allow_chat') = 'f'
      OR (NEW.payload -> 'allowChat') = 'false'::jsonb
      OR (NEW.payload -> 'allow_chat') = 'false'::jsonb
    );
  ELSE
    NEW.allow_chat := COALESCE(NEW.allow_chat, true);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patients_sync_allow_chat ON public.patients;
CREATE TRIGGER trg_patients_sync_allow_chat
  BEFORE INSERT OR UPDATE OF payload, allow_chat
  ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_patients_sync_allow_chat();

COMMENT ON FUNCTION public.tg_patients_sync_allow_chat() IS
  'Keeps patients.allow_chat aligned with payload.allowChat / allow_chat.';

REVOKE ALL ON FUNCTION public.tg_patients_sync_allow_chat() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_patients_sync_allow_chat() FROM anon, authenticated;

-- Portal self-update: patients must not flip allow_chat / payload.allowChat.
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

  NEW.therapist_id := OLD.therapist_id;
  NEW.auth_user_id := OLD.auth_user_id;
  NEW.account_frozen := OLD.account_frozen;
  NEW.status := OLD.status;
  NEW.allow_chat := OLD.allow_chat;

  IF NEW.payload IS NOT NULL AND jsonb_typeof(NEW.payload) = 'object'
     AND OLD.payload IS NOT NULL AND jsonb_typeof(OLD.payload) = 'object'
  THEN
    NEW.payload := (
      NEW.payload
      - 'accountFrozen' - 'account_frozen' - 'status'
      - 'allowChat' - 'allow_chat'
    );

    IF OLD.payload ? 'accountFrozen' THEN
      NEW.payload := jsonb_set(NEW.payload, '{accountFrozen}', OLD.payload -> 'accountFrozen', true);
    END IF;
    IF OLD.payload ? 'account_frozen' THEN
      NEW.payload := jsonb_set(NEW.payload, '{account_frozen}', OLD.payload -> 'account_frozen', true);
    END IF;
    IF OLD.payload ? 'status' THEN
      NEW.payload := jsonb_set(NEW.payload, '{status}', OLD.payload -> 'status', true);
    END IF;
    IF OLD.payload ? 'allowChat' THEN
      NEW.payload := jsonb_set(NEW.payload, '{allowChat}', OLD.payload -> 'allowChat', true);
    END IF;
    IF OLD.payload ? 'allow_chat' THEN
      NEW.payload := jsonb_set(NEW.payload, '{allow_chat}', OLD.payload -> 'allow_chat', true);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_patients_lock_patient_controlled_columns() IS
  'Portal self-update: restores therapist_id, auth_user_id, account_frozen, status, allow_chat (columns + payload keys).';
