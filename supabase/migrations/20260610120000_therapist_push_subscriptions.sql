-- PHYSIOSHIELD — Multi-device therapist push (One-to-Many).
--
-- Root cause this migration fixes:
--   Therapist push registration stored a SINGLE push_token / push_payload on public.profiles, so
--   logging in on a second device (PC + Mobile) overwrote the first device's subscription and
--   notifications only reached the most recently active device. This table stores one row per
--   device endpoint, letting notify-new-message fan out to ALL of a therapist's devices and delete
--   only the specific stale endpoint on 410 Gone (instead of nuking the therapist's only token).

CREATE TABLE IF NOT EXISTS public.therapist_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- TEXT to match public.profiles.id (app Therapist.id == auth.uid()::text).
  user_id TEXT NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  -- Push gateway endpoint URL — globally unique per browser subscription.
  endpoint TEXT NOT NULL UNIQUE,
  -- Canonical { webPushSubscription: { endpoint, keys: { p256dh, auth } } } (same shape as profiles.push_payload).
  subscription_data JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_therapist_push_subscriptions_user
  ON public.therapist_push_subscriptions (user_id);

COMMENT ON TABLE public.therapist_push_subscriptions IS
  'One row per therapist device Web Push subscription. notify-new-message fans out to all rows for a therapist; stale endpoints (403/404/410) are deleted individually.';
COMMENT ON COLUMN public.therapist_push_subscriptions.endpoint IS
  'HTTPS Web Push endpoint (unique per browser subscription). Upsert key for re-registration on the same device.';
COMMENT ON COLUMN public.therapist_push_subscriptions.subscription_data IS
  'Canonical { webPushSubscription: { endpoint, keys: { p256dh, auth } } } for VAPID Web Push.';

ALTER TABLE public.therapist_push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.therapist_push_subscriptions FORCE ROW LEVEL SECURITY;

-- Therapists manage only their own device rows. Edge Functions use the service role (bypasses RLS).
DROP POLICY IF EXISTS "therapist_push_subscriptions_select_own" ON public.therapist_push_subscriptions;
CREATE POLICY "therapist_push_subscriptions_select_own"
  ON public.therapist_push_subscriptions
  FOR SELECT
  TO authenticated
  USING (user_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "therapist_push_subscriptions_insert_own" ON public.therapist_push_subscriptions;
CREATE POLICY "therapist_push_subscriptions_insert_own"
  ON public.therapist_push_subscriptions
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "therapist_push_subscriptions_update_own" ON public.therapist_push_subscriptions;
CREATE POLICY "therapist_push_subscriptions_update_own"
  ON public.therapist_push_subscriptions
  FOR UPDATE
  TO authenticated
  USING (user_id = (SELECT auth.uid())::text)
  WITH CHECK (user_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "therapist_push_subscriptions_delete_own" ON public.therapist_push_subscriptions;
CREATE POLICY "therapist_push_subscriptions_delete_own"
  ON public.therapist_push_subscriptions
  FOR DELETE
  TO authenticated
  USING (user_id = (SELECT auth.uid())::text);

-- Backfill: migrate each therapist's current single-device registration so already-registered
-- devices keep receiving pushes without waiting for the next dashboard open / re-registration.
INSERT INTO public.therapist_push_subscriptions (user_id, endpoint, subscription_data)
SELECT p.id, trim(p.push_token), COALESCE(p.push_payload, '{}'::jsonb)
FROM public.profiles p
WHERE p.push_token IS NOT NULL
  AND lower(trim(p.push_token)) LIKE 'https://%'
  AND p.push_payload IS NOT NULL
ON CONFLICT (endpoint) DO NOTHING;
