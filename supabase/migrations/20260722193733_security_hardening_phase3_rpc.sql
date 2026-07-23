-- =============================================================================
-- SECURITY HARDENING PHASE 3 — RPC exposure + search_path + knowledge sources
-- =============================================================================
-- Addresses live Supabase security advisor findings after emergency hardening:
--   1) complete_exercise_safe / link_patient_auth_user still executable by anon
--   2) tg_chat_messages_notify_new_message callable directly via /rest/v1/rpc
--   3) SECURITY DEFINER helpers missing a fixed search_path
--   4) app_knowledge_sources has RLS but zero policies (phase-1 policies drifted)
--
-- Safe for valid workflows:
--   - Patient rehab completions: authenticated patients call complete_exercise_safe
--   - Portal first link: authenticated patients call link_patient_auth_user
--   - Chat push notify: AFTER INSERT trigger still fires as function owner;
--     revoking client EXECUTE only blocks direct RPC abuse
-- =============================================================================

-- ── 1) Lock down SECURITY DEFINER RPCs exposed to anon ───────────────────────
-- Prior migrations revoked PUBLIC and granted authenticated, but live grants
-- still allowed anon EXECUTE (Supabase default privileges / drift).

REVOKE EXECUTE ON FUNCTION public.complete_exercise_safe(text, jsonb) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_exercise_safe(text, jsonb) TO authenticated, service_role;

-- Portal onboarding uses an authenticated session (signUp → session → rpc).
-- Anonymous invocation is not required.
REVOKE EXECUTE ON FUNCTION public.link_patient_auth_user(text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.link_patient_auth_user(text) TO authenticated, service_role;

COMMENT ON FUNCTION public.complete_exercise_safe(text, jsonb) IS
  'Patient portal exercise completion RPC. SECURITY DEFINER; EXECUTE limited to authenticated + service_role (phase3).';

COMMENT ON FUNCTION public.link_patient_auth_user(text) IS
  'Portal first sign-in: binds auth.users to patients.auth_user_id when JWT user_metadata.patient_id matches. EXECUTE limited to authenticated + service_role (phase3).';

-- ── 2) Prevent direct API/RPC invocation of trigger functions ────────────────
-- Trigger continues to run on chat_messages INSERT; clients must not call it.

REVOKE EXECUTE ON FUNCTION public.tg_chat_messages_notify_new_message() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.tg_chat_messages_notify_new_message() IS
  'AFTER INSERT trigger on chat_messages → notify-new-message webhook. Not a client RPC; EXECUTE revoked from anon/authenticated/PUBLIC (phase3).';

-- ── 3) Hardened search_path for SECURITY DEFINER functions ───────────────────
-- Re-assert on already-pinned RPCs; pin remaining auth-cleanup helpers that
-- advisors flagged as search_path mutable.

ALTER FUNCTION public.complete_exercise_safe(text, jsonb) SET search_path = public;
ALTER FUNCTION public.link_patient_auth_user(text) SET search_path = public;
ALTER FUNCTION public.tg_chat_messages_notify_new_message() SET search_path = public, private, extensions;

-- Auth-cleanup SECURITY DEFINER helpers (trigger / service_role only).
-- Include auth so schema-qualified auth.users lookups remain resolvable.
-- Skip handle_patient_delete_auth_cleanup: it already pins search_path = '' and
-- uses fully-qualified auth.users references (stronger than a non-empty path).
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'delete_auth_user_by_any_email',
    'delete_auth_user_by_contact_email',
    'delete_auth_user_by_email_final',
    'delete_auth_user_by_email_on_patient_delete',
    'delete_auth_user_by_id_on_patient_delete',
    'delete_auth_user_final_v3',
    'delete_auth_user_on_patient_delete'
  ];
BEGIN
  FOREACH fn IN ARRAY fns
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
        AND p.proname = fn
        AND pg_get_function_identity_arguments(p.oid) = ''
    ) THEN
      EXECUTE format(
        'ALTER FUNCTION public.%I() SET search_path = public, auth',
        fn
      );
    END IF;
  END LOOP;
END
$$;

-- Auth hook (if present on this project) already used SET search_path = public
-- at CREATE time; re-assert when the overload exists.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'hook_before_user_created_guardian'
      AND pg_get_function_identity_arguments(p.oid) = 'event jsonb'
  ) THEN
    EXECUTE 'ALTER FUNCTION public.hook_before_user_created_guardian(jsonb) SET search_path = public';
  END IF;
END
$$;

-- private schema helpers (advisor: mutable search_path)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'private'
      AND p.proname = 'tg_app_config_trim_value'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'ALTER FUNCTION private.tg_app_config_trim_value() SET search_path = private, public';
  END IF;
END
$$;

-- ── 4) Restore RLS policies on app_knowledge_sources ─────────────────────────
-- Live DB: RLS enabled, FORCE off, zero policies (phase-1 drifted).
-- Client code currently reads deleted_seed_ids from app_knowledge_base, not this
-- table — but therapists manage AI allow-list sources when the feature is used.
-- Restore therapist-scoped policies (not blanket USING(true) for all auth users).

ALTER TABLE public.app_knowledge_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_knowledge_sources FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated users to read knowledge sources" ON public.app_knowledge_sources;
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

COMMENT ON TABLE public.app_knowledge_sources IS
  'מקורות מידע לבסיס ידע + Gemini — KnowledgeSource[] ומזהי seed שנמחקו. Phase3: therapist-scoped RLS restored (SELECT global|own; write own row only).';

-- ── 5) Post-migration asserts ────────────────────────────────────────────────

DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.complete_exercise_safe(text, jsonb)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'phase3: anon still has EXECUTE on complete_exercise_safe';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.link_patient_auth_user(text)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'phase3: anon still has EXECUTE on link_patient_auth_user';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.complete_exercise_safe(text, jsonb)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'phase3: authenticated missing EXECUTE on complete_exercise_safe';
  END IF;

  IF NOT has_function_privilege(
    'authenticated',
    'public.link_patient_auth_user(text)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'phase3: authenticated missing EXECUTE on link_patient_auth_user';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.tg_chat_messages_notify_new_message()'::regprocedure,
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.tg_chat_messages_notify_new_message()'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'phase3: clients still have EXECUTE on tg_chat_messages_notify_new_message';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_knowledge_sources'
      AND policyname = 'app_knowledge_sources_select_therapist'
  ) THEN
    RAISE EXCEPTION 'phase3: missing app_knowledge_sources_select_therapist';
  END IF;
END
$$;
