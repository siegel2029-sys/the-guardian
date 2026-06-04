-- PHYSIOSHIELD — Pipeline 2 fix: track dead/stale push registrations so Edge Functions stop
-- hammering gateways that already returned 403 (VAPID mismatch) / 404 / 410 Gone.
--
-- When reminder-cron or notify-new-message gets a persistent gateway rejection, it clears the
-- push_token + webPushSubscription and stamps these columns. The frontend auto re-registers the
-- subscription (with the server-validated VAPID key) the next time the user opens the app.

ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS push_invalidated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS push_last_error TEXT;

COMMENT ON COLUMN public.patients.push_invalidated_at IS
  'Set when a push gateway returned a persistent rejection (403/404/410) and the stale token was cleared. NULL once a fresh subscription is registered.';
COMMENT ON COLUMN public.patients.push_last_error IS
  'Short detail of the last push gateway failure (for dashboard triage). Cleared on successful re-registration.';
