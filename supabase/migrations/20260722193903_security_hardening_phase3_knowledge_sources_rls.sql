-- =============================================================================
-- PHASE 3 follow-up: app_knowledge_sources RLS must not use user_metadata
-- =============================================================================
-- Restoring phase-1 policies reintroduced advisor ERROR rls_references_user_metadata
-- because policies gated on auth.jwt() -> user_metadata -> patient_id.
-- user_metadata is end-user editable and must never authorize access.
--
-- Therapist gate = row exists in public.profiles for auth.uid() (patients do not
-- get therapist profile rows for this check in normal flows).
-- =============================================================================

DROP POLICY IF EXISTS "app_knowledge_sources_select_therapist" ON public.app_knowledge_sources;
CREATE POLICY "app_knowledge_sources_select_therapist"
  ON public.app_knowledge_sources
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
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
    id = (SELECT auth.uid())::text
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
    id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    id = (SELECT auth.uid())::text
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
    id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  );

COMMENT ON TABLE public.app_knowledge_sources IS
  'מקורות מידע לבסיס ידע + Gemini. Therapist-scoped RLS via profiles membership (no user_metadata).';

-- Also clear leftover advisor WARN: session_history_has_work mutable search_path
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'session_history_has_work'
      AND pg_get_function_identity_arguments(p.oid) = 'payload jsonb'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.session_history_has_work(jsonb) SET search_path = public';
  END IF;
END
$$;
