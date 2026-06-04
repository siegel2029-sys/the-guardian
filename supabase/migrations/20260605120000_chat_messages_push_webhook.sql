-- PHYSIOSHIELD — Pipeline 1 fix: DB trigger that invokes the `notify-new-message` Edge Function
-- on every INSERT into public.chat_messages.
--
-- Root cause this migration fixes:
--   The table comment and the `notify-new-message` function were always written as a
--   "Database Webhook target", but NO trigger/webhook was ever created — so inserting a chat row
--   never called the Edge Function and the patient never received a push notification.
--
-- This migration wires the missing webhook directly in Postgres using `pg_net` (net.http_post),
-- which is the same mechanism the Supabase Dashboard "Database Webhooks" UI generates under the hood,
-- but kept in version control so it survives environment rebuilds.
--
-- Config (URL + shared secret) lives in a private key/value table so it can be set per-environment
-- WITHOUT editing this migration. After `supabase db push`, the operator runs (example):
--   insert into private.app_config (key, value) values
--     ('edge_functions_base_url', 'https://<project-ref>.functions.supabase.co'),
--     ('internal_messages_webhook_secret', '<same value as INTERNAL_MESSAGES_WEBHOOK_SECRET secret>')
--   on conflict (key) do update set value = excluded.value;

-- ── pg_net for async outbound HTTP from triggers ──
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- ── Private per-environment config (URL + webhook secret) ──
CREATE SCHEMA IF NOT EXISTS private;

CREATE TABLE IF NOT EXISTS private.app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE private.app_config IS
  'Per-environment config for DB-triggered Edge Functions (e.g. notify-new-message webhook URL + secret). Never exposed via PostgREST (private schema).';

-- Seed placeholder rows so operators see exactly what to fill in. Real values must overwrite these.
INSERT INTO private.app_config (key, value) VALUES
  ('edge_functions_base_url', 'https://CHANGE_ME.functions.supabase.co'),
  ('internal_messages_webhook_secret', 'CHANGE_ME')
ON CONFLICT (key) DO NOTHING;

-- ── Trigger function: POST the inserted chat row to notify-new-message ──
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
  SELECT value INTO base_url FROM private.app_config WHERE key = 'edge_functions_base_url';
  SELECT value INTO secret   FROM private.app_config WHERE key = 'internal_messages_webhook_secret';

  IF base_url IS NULL OR base_url = '' OR base_url LIKE '%CHANGE_ME%'
     OR secret IS NULL OR secret = '' OR secret = 'CHANGE_ME' THEN
    RAISE WARNING '[chat_notify] private.app_config not configured — skipping push webhook for message % (patient %). Set edge_functions_base_url + internal_messages_webhook_secret.',
      NEW.id, NEW.patient_id;
    RETURN NEW;
  END IF;

  -- Mirror the Supabase Database Webhook envelope so notify-new-message.extractRecord() works unchanged.
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

  RAISE LOG '[chat_notify] Trigger fired: queued notify-new-message request_id=% message=% patient=% from_patient=% ai_alert=%',
    request_id, NEW.id, NEW.patient_id, NEW.from_patient, NEW.ai_clinical_alert;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A failed push webhook must NEVER block the chat insert (message still saved + Realtime delivered).
  RAISE WARNING '[chat_notify] webhook dispatch failed for message %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_chat_messages_notify_new_message() IS
  'AFTER INSERT on chat_messages: async POST to notify-new-message Edge Function (pg_net). Non-blocking; reads URL/secret from private.app_config.';

DROP TRIGGER IF EXISTS trg_chat_messages_notify_new_message ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_notify_new_message
  AFTER INSERT ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_chat_messages_notify_new_message();

COMMENT ON TABLE public.chat_messages IS
  'Therapist/patient portal chat; AFTER INSERT trigger (trg_chat_messages_notify_new_message) drives notify-new-message Edge Function push.';
