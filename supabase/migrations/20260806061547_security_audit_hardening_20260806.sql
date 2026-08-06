-- =============================================================================
-- Security audit hardening (2026-08-06) — part 1
-- Generic vs Premium: gate chat_messages INSERT on patients.allow_chat
-- =============================================================================

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
      WHERE p.id = chat_messages.patient_id
        AND p.auth_user_id = (SELECT auth.uid())
        AND p.therapist_id = chat_messages.therapist_id
        AND p.allow_chat = true
        AND COALESCE(p.account_frozen, false) = false
    )
  );

COMMENT ON POLICY "chat_messages_insert_patient" ON public.chat_messages IS
  'Linked patient may insert only when allow_chat=true, not frozen, and therapist_id matches.';
