-- =============================================================================
-- P0: Fix insecure chat notify trigger + auth/RLS hardening (store readiness)
-- =============================================================================
-- 1) Drop Dashboard webhook trigger that embedded service_role JWT + secret
-- 2) Attach secure pg_net trigger reading ONLY from private.app_config
-- 3) Freemium default in auth.users BEFORE INSERT (never fail-open to therapist)
-- 4) profiles_insert_own without user_metadata
-- 5) Revoke hook EXECUTE from anon/authenticated
-- 6) FORCE RLS + scoped policies on treatment_reports
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure URL row exists / is not a placeholder. Do NOT write secrets in migrations.
INSERT INTO private.app_config (key, value) VALUES
  ('edge_functions_base_url', 'https://sbbmyxztjmeerfmuhrka.functions.supabase.co'),
  ('internal_messages_webhook_secret', 'CHANGE_ME')
ON CONFLICT (key) DO UPDATE
  SET value = CASE
    WHEN private.app_config.key = 'edge_functions_base_url'
         AND (
           private.app_config.value LIKE '%CHANGE_ME%'
           OR btrim(private.app_config.value) = ''
         )
      THEN EXCLUDED.value
    ELSE private.app_config.value
  END,
  updated_at = now();

-- ── 1) Remove insecure supabase_functions.http_request trigger ───────────────
DROP TRIGGER IF EXISTS notify_on_new_message ON public.chat_messages;

-- ── 2) Secure notify function (pg_net + private.app_config only) ─────────────
CREATE OR REPLACE FUNCTION public.tg_chat_messages_notify_new_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, private, extensions
AS $$
DECLARE
  base_url   TEXT;
  secret     TEXT;
  request_id BIGINT;
BEGIN
  SELECT btrim(replace(replace(value, chr(13), ''), chr(10), ''))
    INTO base_url FROM private.app_config WHERE key = 'edge_functions_base_url';
  SELECT btrim(replace(replace(value, chr(13), ''), chr(10), ''))
    INTO secret   FROM private.app_config WHERE key = 'internal_messages_webhook_secret';

  IF base_url IS NULL OR base_url = '' OR base_url LIKE '%CHANGE_ME%'
     OR secret IS NULL OR secret = '' OR secret = 'CHANGE_ME' THEN
    RAISE WARNING '[chat_notify] private.app_config not configured — skipping push webhook for message %',
      NEW.id;
    RETURN NEW;
  END IF;

  IF secret ~ '\s' THEN
    RAISE WARNING '[chat_notify] webhook secret contains interior whitespace (length %)', length(secret);
  END IF;
  IF length(secret) % 2 = 0
     AND left(secret, length(secret) / 2) = right(secret, length(secret) / 2) THEN
    RAISE WARNING '[chat_notify] webhook secret looks DUPLICATED (length %) — fix private.app_config', length(secret);
  END IF;

  SELECT net.http_post(
    url     := base_url || '/notify-new-message',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-secret', secret
    ),
    body    := jsonb_build_object(
      'type', 'INSERT',
      'table', 'chat_messages',
      'schema', 'public',
      'record', to_jsonb(NEW)
    ),
    timeout_milliseconds := 5000
  ) INTO request_id;

  RAISE LOG '[chat_notify] queued notify-new-message request_id=% message=% from_patient=%',
    request_id, NEW.id, NEW.from_patient;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING '[chat_notify] webhook dispatch failed for message %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_chat_messages_notify_new_message() IS
  'AFTER INSERT on chat_messages: pg_net POST to notify-new-message. Secrets from private.app_config only — never hardcode JWTs.';

REVOKE ALL ON FUNCTION public.tg_chat_messages_notify_new_message() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_chat_messages_notify_new_message() FROM anon, authenticated;

DROP TRIGGER IF EXISTS trg_chat_messages_notify_new_message ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_notify_new_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_chat_messages_notify_new_message();

COMMENT ON TABLE public.chat_messages IS
  'Therapist/patient portal chat; secure trg_chat_messages_notify_new_message → notify-new-message (pg_net).';

-- ── 3) Auth signup: clinic → pro; explicit therapist claim → therapist; else free ──
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
  v_claim_role text;
BEGIN
  v_patient_id := btrim(coalesce(
    v_um ->> 'patient_id',
    v_um ->> 'invite_code',
    v_am ->> 'patient_id',
    ''
  ));

  -- Explicit therapist clinic signup (user_metadata.role=therapist from therapist signUp).
  v_claim_role := lower(btrim(coalesce(
    v_am ->> 'role',
    v_um ->> 'role',
    ''
  )));

  IF v_patient_id = '' THEN
    IF v_claim_role = 'therapist' THEN
      NEW.raw_app_meta_data := v_am
        || jsonb_build_object('role', 'therapist');
      -- Ensure freemium keys are not left stale.
      IF (NEW.raw_app_meta_data ? 'tier') AND (NEW.raw_app_meta_data ->> 'tier') = 'free' THEN
        NEW.raw_app_meta_data := NEW.raw_app_meta_data - 'tier';
      END IF;
      IF (NEW.raw_app_meta_data ? 'patient_id') THEN
        NEW.raw_app_meta_data := NEW.raw_app_meta_data - 'patient_id';
      END IF;
      RETURN NEW;
    END IF;

    -- App Store / freemium / unknown: never fail-open to therapist-shaped accounts.
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
  'Promotes clinic invite → app_metadata (tier=pro). Explicit therapist claim → role=therapist. Otherwise defaults to free patient (never therapist fail-open).';

DROP TRIGGER IF EXISTS trg_auth_users_promote_clinic_patient_id ON auth.users;
CREATE TRIGGER trg_auth_users_promote_clinic_patient_id
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_auth_users_promote_clinic_patient_id();

REVOKE ALL ON FUNCTION public.tg_auth_users_promote_clinic_patient_id() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_auth_users_promote_clinic_patient_id() FROM anon, authenticated;

-- ── 4) profiles_insert_own — app_metadata only (no user_metadata) ────────────
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
    AND COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'role', '') = 'therapist'
    AND COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'tier', '') IS DISTINCT FROM 'free'
    AND COALESCE((SELECT auth.jwt()) -> 'app_metadata' ->> 'patient_id', '') = ''
  );

COMMENT ON POLICY "profiles_insert_own" ON public.profiles IS
  'Therapists only: own-row insert when app_metadata.role=therapist; blocks free/pro patients. No user_metadata.';

-- ── 5) Revoke auth hook from client roles ────────────────────────────────────
REVOKE ALL ON FUNCTION public.hook_before_user_created_guardian(jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.hook_before_user_created_guardian(jsonb) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hook_before_user_created_guardian(jsonb) TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.hook_before_user_created_guardian(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.hook_before_user_created_guardian(jsonb) TO postgres;

-- ── 6) treatment_reports — FORCE RLS + therapist-scoped policies ─────────────
ALTER TABLE public.treatment_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatment_reports FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Therapists can manage their own reports" ON public.treatment_reports;
DROP POLICY IF EXISTS "treatment_reports_select_therapist" ON public.treatment_reports;
DROP POLICY IF EXISTS "treatment_reports_insert_therapist" ON public.treatment_reports;
DROP POLICY IF EXISTS "treatment_reports_update_therapist" ON public.treatment_reports;
DROP POLICY IF EXISTS "treatment_reports_delete_therapist" ON public.treatment_reports;

CREATE POLICY "treatment_reports_select_therapist"
  ON public.treatment_reports
  FOR SELECT
  TO authenticated
  USING (therapist_id = (SELECT auth.uid()));

CREATE POLICY "treatment_reports_insert_therapist"
  ON public.treatment_reports
  FOR INSERT
  TO authenticated
  WITH CHECK (
    therapist_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = treatment_reports.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "treatment_reports_update_therapist"
  ON public.treatment_reports
  FOR UPDATE
  TO authenticated
  USING (therapist_id = (SELECT auth.uid()))
  WITH CHECK (therapist_id = (SELECT auth.uid()));

CREATE POLICY "treatment_reports_delete_therapist"
  ON public.treatment_reports
  FOR DELETE
  TO authenticated
  USING (therapist_id = (SELECT auth.uid()));

REVOKE ALL ON TABLE public.treatment_reports FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.treatment_reports TO authenticated;
GRANT ALL ON TABLE public.treatment_reports TO service_role;
