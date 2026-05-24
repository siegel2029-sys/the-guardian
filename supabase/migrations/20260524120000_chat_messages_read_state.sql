-- Per-viewer read state for therapist ↔ patient chat (badges survive refresh).

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS read_by_therapist BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS read_by_patient BOOLEAN NOT NULL DEFAULT false;

-- Backfill existing rows: sender has already "read" their own message.
UPDATE public.chat_messages
SET read_by_therapist = true
WHERE from_patient = false AND read_by_therapist = false;

UPDATE public.chat_messages
SET read_by_patient = true
WHERE from_patient = true AND read_by_patient = false;

DROP POLICY IF EXISTS "chat_messages_update_therapist_read" ON public.chat_messages;
CREATE POLICY "chat_messages_update_therapist_read"
  ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING (therapist_id = (SELECT auth.uid())::text)
  WITH CHECK (therapist_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "chat_messages_update_patient_read" ON public.chat_messages;
CREATE POLICY "chat_messages_update_patient_read"
  ON public.chat_messages
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );
