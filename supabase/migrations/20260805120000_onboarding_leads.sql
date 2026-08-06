-- Self-service onboarding & triage funnel: isolated leads table.
-- Fully separate from clinical tables (patients / chat_messages / reminders are untouched).
-- Anonymous visitors write ONLY through the hardened SECURITY DEFINER RPC below;
-- there are NO anon table policies (prevents enumeration and update-all attacks).
-- The unguessable lead UUID returned on insert acts as the client's capability token.

CREATE TABLE IF NOT EXISTS public.onboarding_leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  full_name text,
  phone text,
  email text,
  pain_level integer,
  status text NOT NULL DEFAULT 'abandoned',
  questionnaire_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT onboarding_leads_pain_level_check
    CHECK (pain_level IS NULL OR pain_level BETWEEN 0 AND 10),
  CONSTRAINT onboarding_leads_status_check
    CHECK (status IN ('abandoned', 'pending_paybox', 'pending_zoom', 'converted')),
  CONSTRAINT onboarding_leads_full_name_len CHECK (char_length(full_name) <= 120),
  CONSTRAINT onboarding_leads_phone_len CHECK (char_length(phone) <= 32),
  CONSTRAINT onboarding_leads_email_len CHECK (char_length(email) <= 254)
);

COMMENT ON TABLE public.onboarding_leads IS
  'Self-service onboarding funnel leads. Conversion into public.patients is a separate, manual/therapist-driven step AFTER payment or approval.';

-- Admin lead management: "open leads" queries (status != converted, newest first).
CREATE INDEX IF NOT EXISTS onboarding_leads_status_created_idx
  ON public.onboarding_leads (status, created_at DESC);

-- updated_at auto-touch (same pattern as exercise_catalog).
CREATE OR REPLACE FUNCTION public.set_onboarding_leads_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_onboarding_leads_updated_at ON public.onboarding_leads;
CREATE TRIGGER trg_onboarding_leads_updated_at
  BEFORE UPDATE ON public.onboarding_leads
  FOR EACH ROW
  EXECUTE FUNCTION public.set_onboarding_leads_updated_at();

ALTER TABLE public.onboarding_leads ENABLE ROW LEVEL SECURITY;

-- Therapist (staff) read/update for lead management and future conversion tooling.
DROP POLICY IF EXISTS "onboarding_leads_select_therapist" ON public.onboarding_leads;
CREATE POLICY "onboarding_leads_select_therapist"
  ON public.onboarding_leads
  FOR SELECT
  TO authenticated
  USING (
    COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'therapist'
  );

DROP POLICY IF EXISTS "onboarding_leads_update_therapist" ON public.onboarding_leads;
CREATE POLICY "onboarding_leads_update_therapist"
  ON public.onboarding_leads
  FOR UPDATE
  TO authenticated
  USING (
    COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'therapist'
  )
  WITH CHECK (
    COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'therapist'
  );

-- Least privilege: anon gets NO direct table access at all.
REVOKE ALL ON public.onboarding_leads FROM anon;
GRANT SELECT, UPDATE ON public.onboarding_leads TO authenticated;
GRANT ALL ON public.onboarding_leads TO service_role;

-- ---------------------------------------------------------------------------
-- save_onboarding_lead: the ONLY write path for anonymous funnel visitors.
--
--  * p_lead_id IS NULL  -> INSERT a new lead (status forced to 'abandoned').
--  * p_lead_id NOT NULL -> UPDATE that exact row; knowing the random UUID is
--    the caller's capability. No SELECT surface exists for anon, so IDs
--    cannot be enumerated through PostgREST.
--
--  Status rules enforced server-side (anon can never set 'converted'):
--    abandoned      -> abandoned | pending_paybox | pending_zoom
--    pending_paybox -> pending_paybox | pending_zoom
--    pending_zoom   -> pending_paybox | pending_zoom
--    converted      -> frozen (no changes via this RPC)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.save_onboarding_lead(
  p_lead_id uuid,
  p_full_name text,
  p_phone text,
  p_email text,
  p_pain_level integer,
  p_status text,
  p_questionnaire jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_full_name text := NULLIF(btrim(COALESCE(p_full_name, '')), '');
  v_phone text := NULLIF(btrim(COALESCE(p_phone, '')), '');
  v_email text := NULLIF(btrim(COALESCE(p_email, '')), '');
  v_status text := COALESCE(NULLIF(btrim(COALESCE(p_status, '')), ''), 'abandoned');
  v_questionnaire jsonb := COALESCE(p_questionnaire, '{}'::jsonb);
  v_current_status text;
  v_id uuid;
BEGIN
  -- Input hardening (lengths / ranges / whitelists) before touching the table.
  IF v_full_name IS NOT NULL AND char_length(v_full_name) > 120 THEN
    RAISE EXCEPTION 'invalid_full_name' USING ERRCODE = '22023';
  END IF;
  IF v_phone IS NOT NULL AND char_length(v_phone) > 32 THEN
    RAISE EXCEPTION 'invalid_phone' USING ERRCODE = '22023';
  END IF;
  IF v_email IS NOT NULL AND (char_length(v_email) > 254 OR position('@' IN v_email) <= 1) THEN
    RAISE EXCEPTION 'invalid_email' USING ERRCODE = '22023';
  END IF;
  IF p_pain_level IS NOT NULL AND (p_pain_level < 0 OR p_pain_level > 10) THEN
    RAISE EXCEPTION 'invalid_pain_level' USING ERRCODE = '22023';
  END IF;
  IF v_status NOT IN ('abandoned', 'pending_paybox', 'pending_zoom') THEN
    -- 'converted' is intentionally NOT settable through this public RPC.
    RAISE EXCEPTION 'invalid_status' USING ERRCODE = '22023';
  END IF;
  IF pg_column_size(v_questionnaire) > 32768 THEN
    RAISE EXCEPTION 'questionnaire_too_large' USING ERRCODE = '22023';
  END IF;

  IF p_lead_id IS NULL THEN
    -- New leads always start as 'abandoned'; contact details are mandatory.
    IF v_full_name IS NULL OR v_phone IS NULL OR v_email IS NULL THEN
      RAISE EXCEPTION 'missing_contact_details' USING ERRCODE = '22023';
    END IF;

    INSERT INTO public.onboarding_leads
      (full_name, phone, email, pain_level, status, questionnaire_data)
    VALUES
      (v_full_name, v_phone, v_email, p_pain_level, 'abandoned', v_questionnaire)
    RETURNING id INTO v_id;

    RETURN v_id;
  END IF;

  SELECT status INTO v_current_status
  FROM public.onboarding_leads
  WHERE id = p_lead_id
  FOR UPDATE;

  IF v_current_status IS NULL THEN
    RAISE EXCEPTION 'lead_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_current_status = 'converted' THEN
    RAISE EXCEPTION 'lead_locked' USING ERRCODE = '22023';
  END IF;

  IF v_current_status IN ('pending_paybox', 'pending_zoom') AND v_status = 'abandoned' THEN
    -- Never downgrade a checkout-intent lead back to abandoned.
    v_status := v_current_status;
  END IF;

  UPDATE public.onboarding_leads
  SET
    full_name = COALESCE(v_full_name, full_name),
    phone = COALESCE(v_phone, phone),
    email = COALESCE(v_email, email),
    pain_level = COALESCE(p_pain_level, pain_level),
    status = v_status,
    questionnaire_data = CASE
      WHEN p_questionnaire IS NULL THEN questionnaire_data
      ELSE v_questionnaire
    END
  WHERE id = p_lead_id
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_onboarding_lead(uuid, text, text, text, integer, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_onboarding_lead(uuid, text, text, text, integer, text, jsonb) TO anon, authenticated;

COMMENT ON FUNCTION public.save_onboarding_lead(uuid, text, text, text, integer, text, jsonb) IS
  'Public funnel write path for onboarding_leads. Insert (lead_id NULL, status forced abandoned) or capability-token update by UUID. Anon can never set status=converted.';
