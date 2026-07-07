-- PHYSIOSHIELD — Harden the chat-notify webhook config against corrupted secrets.
--
-- Root cause under triage: private.app_config.internal_messages_webhook_secret held the
-- secret CONCATENATED TWICE (44 chars vs the 22-char Edge Function secret), so the
-- x-webhook-secret header never matched and notify-new-message returned 401 on every insert.
--
-- This migration cannot know the real secret value (secrets never belong in version control) —
-- the operator sets the clean value once via the SQL Editor. What it CAN do is make sure this
-- class of corruption is caught and never silently repeated:
--   1. Trim whitespace on every app_config write (BEFORE trigger).
--   2. One-time cleanup of edge whitespace in existing rows.
--   3. Recreate tg_chat_messages_notify_new_message to send btrim(value) only, and to WARN
--      loudly when the stored secret looks corrupted (whitespace inside, suspicious length).

-- ── 1. Normalize app_config values on write ──
CREATE OR REPLACE FUNCTION private.tg_app_config_trim_value()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.key := trim(NEW.key);
  NEW.value := trim(NEW.value);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_app_config_trim_value ON private.app_config;
CREATE TRIGGER trg_app_config_trim_value
  BEFORE INSERT OR UPDATE ON private.app_config
  FOR EACH ROW
  EXECUTE FUNCTION private.tg_app_config_trim_value();

-- ── 2. One-time cleanup of edge whitespace already stored ──
UPDATE private.app_config SET value = trim(value) WHERE value <> trim(value);

-- ── 3. Recreate the chat-notify trigger function with defensive reads ──
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
  -- btrim + strip CR/LF defensively even though the write-side trigger now trims:
  -- a newline inside an HTTP header would make pg_net's request malformed.
  SELECT btrim(replace(replace(value, chr(13), ''), chr(10), ''))
    INTO base_url FROM private.app_config WHERE key = 'edge_functions_base_url';
  SELECT btrim(replace(replace(value, chr(13), ''), chr(10), ''))
    INTO secret   FROM private.app_config WHERE key = 'internal_messages_webhook_secret';

  IF base_url IS NULL OR base_url = '' OR base_url LIKE '%CHANGE_ME%'
     OR secret IS NULL OR secret = '' OR secret = 'CHANGE_ME' THEN
    RAISE WARNING '[chat_notify] private.app_config not configured — skipping push webhook for message % (patient %). Set edge_functions_base_url + internal_messages_webhook_secret.',
      NEW.id, NEW.patient_id;
    RETURN NEW;
  END IF;

  -- Corruption tripwires (never log the secret itself, only its shape).
  IF secret ~ '\s' THEN
    RAISE WARNING '[chat_notify] webhook secret contains interior whitespace (length %) — fix private.app_config.', length(secret);
  END IF;
  IF length(secret) % 2 = 0
     AND left(secret, length(secret) / 2) = right(secret, length(secret) / 2) THEN
    RAISE WARNING '[chat_notify] webhook secret looks DUPLICATED (length %, first half = second half) — the value was probably pasted twice. Fix private.app_config.', length(secret);
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

  RAISE LOG '[chat_notify] Trigger fired: queued notify-new-message request_id=% message=% patient=% from_patient=% ai_alert=% secret_len=%',
    request_id, NEW.id, NEW.patient_id, NEW.from_patient, NEW.ai_clinical_alert, length(secret);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A failed push webhook must NEVER block the chat insert (message still saved + Realtime delivered).
  RAISE WARNING '[chat_notify] webhook dispatch failed for message %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_chat_messages_notify_new_message() IS
  'AFTER INSERT on chat_messages: async POST to notify-new-message Edge Function (pg_net). Non-blocking; reads trimmed URL/secret from private.app_config and warns on corrupted secrets.';
