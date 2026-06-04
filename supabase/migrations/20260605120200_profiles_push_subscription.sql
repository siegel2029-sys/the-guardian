-- PHYSIOSHIELD — Pipeline 1 fix (therapist side): give therapists a Web Push / Expo registration
-- so a patient → therapist chat message can deliver a live notification to the therapist's device.
--
-- Root cause this migration fixes:
--   Only `public.patients` ever stored a push_token + webPushSubscription. There was nowhere to
--   persist a therapist's subscription, so notify-new-message had no recipient for patient-originated
--   rows and the therapist never received a push. These columns mirror the patient push-health schema
--   (push_invalidated_at / push_last_error) so the Edge Functions can flag and clear stale therapist
--   tokens the same way (403 VAPID mismatch / 404 / 410 Gone) and the therapist app re-registers on
--   the next open with the server-validated VAPID public key.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  -- Canonical { webPushSubscription: { endpoint, keys: { p256dh, auth } } } (mirrors patients.payload shape).
  ADD COLUMN IF NOT EXISTS push_payload JSONB,
  ADD COLUMN IF NOT EXISTS push_invalidated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS push_last_error TEXT,
  ADD COLUMN IF NOT EXISTS last_activity_timestamp TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.push_token IS
  'Therapist Expo push token (ExponentPushToken[...]) or HTTPS Web Push endpoint. Used by notify-new-message for patient → therapist chat pushes.';
COMMENT ON COLUMN public.profiles.push_payload IS
  'Canonical { webPushSubscription: { endpoint, keys: { p256dh, auth } } } for VAPID Web Push (parallel to patients.payload.webPushSubscription).';
COMMENT ON COLUMN public.profiles.push_invalidated_at IS
  'Set when a push gateway returned a persistent rejection (403/404/410) and the stale therapist token was cleared. NULL once a fresh subscription is registered.';
COMMENT ON COLUMN public.profiles.push_last_error IS
  'Short detail of the last therapist push gateway failure (for dashboard triage). Cleared on successful re-registration.';
COMMENT ON COLUMN public.profiles.last_activity_timestamp IS
  'Updated whenever the therapist opens the dashboard; used for push-health triage / stale-token diagnostics.';

CREATE INDEX IF NOT EXISTS idx_profiles_push_token
  ON public.profiles (push_token)
  WHERE push_token IS NOT NULL AND length(trim(push_token)) > 0;
