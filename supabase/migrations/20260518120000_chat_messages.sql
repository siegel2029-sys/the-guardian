-- PHYSIOSHIELD — therapist ↔ patient chat rows for DB webhooks & push notifications
--
-- App previously stored chat only in React + localStorage; push webhook targeted `messages`, which never existed.
-- Canonical table name: public.chat_messages

CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT NOT NULL REFERENCES public.patients (id) ON DELETE CASCADE,
  therapist_id TEXT NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  content TEXT NOT NULL DEFAULT '',
  from_patient BOOLEAN NOT NULL DEFAULT false,
  ai_clinical_alert BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_patient_created
  ON public.chat_messages (patient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_therapist_created
  ON public.chat_messages (therapist_id, created_at DESC);

COMMENT ON TABLE public.chat_messages IS 'Therapist/patient portal chat; INSERT webhook drives notify-new-message Edge Function';

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "chat_messages_select_therapist" ON public.chat_messages;
CREATE POLICY "chat_messages_select_therapist"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (therapist_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "chat_messages_insert_therapist" ON public.chat_messages;
CREATE POLICY "chat_messages_insert_therapist"
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    from_patient = false
    AND therapist_id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "chat_messages_select_patient" ON public.chat_messages;
CREATE POLICY "chat_messages_select_patient"
  ON public.chat_messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "chat_messages_insert_patient" ON public.chat_messages;
CREATE POLICY "chat_messages_insert_patient"
  ON public.chat_messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    from_patient = true
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND p.therapist_id = therapist_id
    )
  );
