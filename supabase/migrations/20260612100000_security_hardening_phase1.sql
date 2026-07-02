-- Phase 1: Critical DB security hardening
-- Fixes: C1 (patient therapist_id mutation), C2 (app_knowledge_sources RLS),
--        C3 (exercise_logs security_invoker), C5 (KB write scope + profiles_insert_own),
--        W1 (chat_messages immutable columns)

-- ── C1: Lock therapist_id on patient self-updates ───────────────────────────
-- patients_update_patient previously only constrained auth_user_id, allowing a
-- portal patient to reassign therapist_id and appear in another therapist's roster.

DROP POLICY IF EXISTS "patients_update_patient" ON public.patients;
CREATE POLICY "patients_update_patient"
  ON public.patients
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()))
  WITH CHECK (
    auth_user_id = (SELECT auth.uid())
    AND therapist_id IS NOT DISTINCT FROM (
      SELECT p.therapist_id
      FROM public.patients p
      WHERE p.id = patients.id
    )
  );

-- ── C3: exercise_logs view must respect session_history RLS ────────────────
-- Without security_invoker, the view runs as owner (postgres) and bypasses RLS.

DROP VIEW IF EXISTS public.exercise_logs;

CREATE VIEW public.exercise_logs
  WITH (security_invoker = true)
AS
SELECT
  sh.id,
  sh.patient_id,
  sh.session_date,
  sh.updated_at AS logged_at,
  sh.payload
FROM public.session_history sh
WHERE public.session_history_has_work(sh.payload);

COMMENT ON VIEW public.exercise_logs IS
  'Completed sessions derived from session_history. security_invoker=true enforces session_history RLS.';

GRANT SELECT ON public.exercise_logs TO authenticated;
GRANT SELECT ON public.exercise_logs TO service_role;

-- ── C2: Enable RLS on app_knowledge_sources ────────────────────────────────

ALTER TABLE public.app_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_knowledge_sources FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_knowledge_sources_select_therapist" ON public.app_knowledge_sources;
CREATE POLICY "app_knowledge_sources_select_therapist"
  ON public.app_knowledge_sources
  FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'patient_id') IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
    AND (
      id = (SELECT auth.uid())::text
      OR id = 'global'
    )
  );

DROP POLICY IF EXISTS "app_knowledge_sources_insert_therapist" ON public.app_knowledge_sources;
CREATE POLICY "app_knowledge_sources_insert_therapist"
  ON public.app_knowledge_sources
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'patient_id') IS NULL
    AND id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "app_knowledge_sources_update_therapist" ON public.app_knowledge_sources;
CREATE POLICY "app_knowledge_sources_update_therapist"
  ON public.app_knowledge_sources
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'patient_id') IS NULL
    AND id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'patient_id') IS NULL
    AND id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "app_knowledge_sources_delete_therapist" ON public.app_knowledge_sources;
CREATE POLICY "app_knowledge_sources_delete_therapist"
  ON public.app_knowledge_sources
  FOR DELETE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'patient_id') IS NULL
    AND id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  );

-- ── C5: Scope app_knowledge_base writes to owning therapist row only ────────
-- Previously any user with a profiles row (including self-inserted patient rows)
-- could INSERT/UPDATE any KB row id (including global).

DROP POLICY IF EXISTS "app_knowledge_base_insert_therapist" ON public.app_knowledge_base;
CREATE POLICY "app_knowledge_base_insert_therapist"
  ON public.app_knowledge_base
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'patient_id') IS NULL
    AND id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "app_knowledge_base_update_therapist" ON public.app_knowledge_base;
CREATE POLICY "app_knowledge_base_update_therapist"
  ON public.app_knowledge_base
  FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() -> 'user_metadata' ->> 'patient_id') IS NULL
    AND id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    (auth.jwt() -> 'user_metadata' ->> 'patient_id') IS NULL
    AND id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  );

-- ── C5: profiles_insert_own — therapists only (no patient_id in JWT) ────────

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    id = (SELECT auth.uid())::text
    AND (auth.jwt() -> 'user_metadata' ->> 'patient_id') IS NULL
  );

-- ── W1: chat_messages — only read-state columns may change on UPDATE ───────
-- RLS policies gate row access; this trigger blocks mutation of message content
-- and thread identity fields.

CREATE OR REPLACE FUNCTION public.tg_chat_messages_restrict_update_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.patient_id IS DISTINCT FROM OLD.patient_id
     OR NEW.therapist_id IS DISTINCT FROM OLD.therapist_id
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.from_patient IS DISTINCT FROM OLD.from_patient
     OR NEW.ai_clinical_alert IS DISTINCT FROM OLD.ai_clinical_alert
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'chat_messages: only read_by_therapist and read_by_patient may be updated'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.tg_chat_messages_restrict_update_columns() IS
  'Prevents tampering with chat message content or thread IDs; allows read-state toggles only.';

DROP TRIGGER IF EXISTS trg_chat_messages_restrict_update_columns ON public.chat_messages;
CREATE TRIGGER trg_chat_messages_restrict_update_columns
  BEFORE UPDATE ON public.chat_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_chat_messages_restrict_update_columns();
