-- =============================================================================
-- Denormalize account_frozen / status for server-enforced freezes (Iron Rule 3/4)
-- =============================================================================
-- Clinical freezes historically lived only inside patients.payload JSONB. Cron
-- filters and RLS helpers then had to parse JSON on every scan. Promote sticky
-- account control onto first-class columns, backfill from payload, and keep
-- columns synchronized via BEFORE INSERT/UPDATE trigger.
-- =============================================================================

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS account_frozen boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

COMMENT ON COLUMN public.patients.account_frozen IS
  'Denormalized from payload.accountFrozen / account_frozen. Sticky freeze for reminders + server gates.';
COMMENT ON COLUMN public.patients.status IS
  'Denormalized from payload.status (active|frozen|paused|inactive|suspended|…). Canonical frozen when account_frozen.';

-- Backfill from existing JSONB payload (camelCase + snake_case).
UPDATE public.patients p
SET
  account_frozen = COALESCE(
    CASE
      WHEN (p.payload ->> 'accountFrozen') ILIKE 'true' THEN true
      WHEN (p.payload ->> 'account_frozen') ILIKE 'true' THEN true
      WHEN (p.payload ->> 'accountFrozen') = 't' THEN true
      WHEN (p.payload ->> 'account_frozen') = 't' THEN true
      WHEN (p.payload -> 'accountFrozen') = 'true'::jsonb THEN true
      WHEN (p.payload -> 'account_frozen') = 'true'::jsonb THEN true
      ELSE false
    END,
    false
  ),
  status = lower(
    trim(
      COALESCE(
        NULLIF(p.payload ->> 'status', ''),
        CASE
          WHEN COALESCE(
            CASE
              WHEN (p.payload ->> 'accountFrozen') ILIKE 'true' THEN true
              WHEN (p.payload ->> 'account_frozen') ILIKE 'true' THEN true
              WHEN (p.payload -> 'accountFrozen') = 'true'::jsonb THEN true
              WHEN (p.payload -> 'account_frozen') = 'true'::jsonb THEN true
              ELSE false
            END,
            false
          ) THEN 'frozen'
          ELSE 'active'
        END
      )
    )
  );

-- Sticky freeze: if frozen flag is set, status must be frozen.
UPDATE public.patients
SET status = 'frozen'
WHERE account_frozen = true
  AND status IS DISTINCT FROM 'frozen';

CREATE INDEX IF NOT EXISTS idx_patients_account_frozen
  ON public.patients (account_frozen)
  WHERE account_frozen = true;

CREATE INDEX IF NOT EXISTS idx_patients_status
  ON public.patients (status);

CREATE OR REPLACE FUNCTION public.tg_patients_sync_account_control()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  frozen_flag boolean := false;
  status_raw text;
BEGIN
  IF NEW.payload IS NULL OR jsonb_typeof(NEW.payload) <> 'object' THEN
    NEW.account_frozen := COALESCE(NEW.account_frozen, false);
    NEW.status := COALESCE(NULLIF(lower(trim(NEW.status)), ''), 'active');
    IF NEW.account_frozen THEN
      NEW.status := 'frozen';
    END IF;
    RETURN NEW;
  END IF;

  frozen_flag := COALESCE(
    CASE
      WHEN (NEW.payload ->> 'accountFrozen') ILIKE 'true' THEN true
      WHEN (NEW.payload ->> 'account_frozen') ILIKE 'true' THEN true
      WHEN (NEW.payload ->> 'accountFrozen') = 't' THEN true
      WHEN (NEW.payload ->> 'account_frozen') = 't' THEN true
      WHEN (NEW.payload -> 'accountFrozen') = 'true'::jsonb THEN true
      WHEN (NEW.payload -> 'account_frozen') = 'true'::jsonb THEN true
      ELSE false
    END,
    false
  );

  -- Prefer explicit column writes when payload did not set freeze keys, but
  -- payload remains the clinical source of truth when present.
  IF NEW.payload ? 'accountFrozen'
     OR NEW.payload ? 'account_frozen'
     OR NEW.payload ? 'status' THEN
    NEW.account_frozen := frozen_flag;
    status_raw := lower(trim(COALESCE(NEW.payload ->> 'status', '')));
    IF frozen_flag THEN
      NEW.status := 'frozen';
    ELSIF status_raw <> '' THEN
      NEW.status := status_raw;
    ELSE
      NEW.status := COALESCE(NULLIF(lower(trim(NEW.status)), ''), 'active');
    END IF;
  ELSE
    NEW.account_frozen := COALESCE(NEW.account_frozen, false);
    NEW.status := COALESCE(NULLIF(lower(trim(NEW.status)), ''), 'active');
    IF NEW.account_frozen THEN
      NEW.status := 'frozen';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_patients_sync_account_control ON public.patients;
CREATE TRIGGER trg_patients_sync_account_control
  BEFORE INSERT OR UPDATE OF payload, account_frozen, status
  ON public.patients
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_patients_sync_account_control();

COMMENT ON FUNCTION public.tg_patients_sync_account_control() IS
  'Keeps patients.account_frozen / patients.status aligned with payload account control (sticky freeze).';

REVOKE ALL ON FUNCTION public.tg_patients_sync_account_control() FROM PUBLIC;
-- Trigger functions need no client EXECUTE; revoke API surface.
REVOKE EXECUTE ON FUNCTION public.tg_patients_sync_account_control() FROM anon, authenticated;
