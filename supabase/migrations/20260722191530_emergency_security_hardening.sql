-- =============================================================================
-- EMERGENCY SECURITY HARDENING — remove legacy RLS development bypasses
-- =============================================================================
-- Context:
--   Earlier hardening migrations (e.g. 20260612100000) added therapist/patient-
--   scoped policies, but LEFT BEHIND older permissive policies that use
--   USING (true) / WITH CHECK (true). In Postgres RLS, permissive policies are
--   OR'd: any matching true-policy grants access and nullifies the hardened
--   rules. That allowed any authenticated user full read/write on clinical
--   tables (patients, session_history) — a severe privacy / HIPAA-class failure.
--
-- This migration:
--   1) Drops only the legacy bypass policies (idempotent DROP POLICY IF EXISTS).
--   2) Leaves restrictive scoped policies untouched (patient auth_user_id /
--      therapist_id isolation for patients + session_history; therapist-scoped
--      KB writes from phase-1 hardening).
--   3) Revokes public/anon/authenticated EXECUTE on dangerous SECURITY DEFINER
--      delete-auth RPCs; grants EXECUTE only to service_role.
--
-- Safe for valid workflows:
--   - Patient login / portal: patients_select_patient, patients_update_patient
--   - Therapist roster: patients_select_therapist, patients_*_therapist
--   - Session reporting: session_history_*_patient / *_therapist, plus
--     complete_exercise_safe (unchanged — not a delete_auth_user RPC)
--   - Patient delete auth cleanup: AFTER DELETE triggers still fire as the
--     function owner (SECURITY DEFINER); revoking client EXECUTE only blocks
--     /rest/v1/rpc/... abuse, not trigger execution.
-- =============================================================================

-- ── 1) Drop legacy bypass policies ──────────────────────────────────────────

-- patients: any authenticated user could ALL rows (true/true)
DROP POLICY IF EXISTS "Allow all actions for authenticated users" ON public.patients;

-- session_history: same full bypass for authenticated
DROP POLICY IF EXISTS "Allow all actions for authenticated users on history" ON public.session_history;

-- session_history: legacy public SELECT with USING (true) — equivalent clinical
-- read bypass (any role in PUBLIC could read every patient's session rows).
-- Restrictive selects remain: session_history_select_patient / _therapist.
DROP POLICY IF EXISTS "Users can view session history" ON public.session_history;

-- app_knowledge_base: public/legacy write policies with WITH CHECK (true)
DROP POLICY IF EXISTS "Allow public insert" ON public.app_knowledge_base;
DROP POLICY IF EXISTS "Allow public update" ON public.app_knowledge_base;
-- ALL policy with permissive WITH CHECK (true); USING was partially scoped but
-- WITH CHECK (true) still allowed unrestricted writes under OR semantics.
DROP POLICY IF EXISTS "Allow therapist to manage their own knowledge base" ON public.app_knowledge_base;

-- Intentionally KEPT (do not drop):
--   patients:
--     patients_select_patient, patients_select_therapist,
--     patients_insert_therapist, patients_update_patient, patients_update_therapist,
--     patients_delete_therapist,
--     "Users can view their own patient record",
--     "Therapists can view their assigned patients",
--     "Allow therapists to update their own patients"
--   session_history:
--     session_history_select_patient, session_history_select_therapist,
--     session_history_insert_patient, session_history_insert_therapist,
--     session_history_update_patient, session_history_update_therapist,
--     session_history_delete_therapist
--   app_knowledge_base:
--     app_knowledge_base_select_public / "Allow public read access" (read-only),
--     app_knowledge_base_insert_therapist, app_knowledge_base_update_therapist

COMMENT ON TABLE public.patients IS
  'Full Patient document as JSONB (see types.Patient). Emergency hardening 20260722190938: legacy authenticated ALL(true) policy removed; access is therapist_id / auth_user_id scoped only.';

COMMENT ON TABLE public.session_history IS
  'DailySession rows; session_date = clinical YYYY-MM-DD. Emergency hardening 20260722190938: legacy authenticated ALL(true) and public SELECT(true) policies removed; access via patient/therapist scoped policies only.';

COMMENT ON TABLE public.app_knowledge_base IS
  'מאמרי "הידעת?" — מערך JSON של KnowledgeFact (כולל isApproved). Emergency hardening 20260722190938: public/legacy write policies with WITH CHECK (true) removed; therapist-scoped insert/update retained.';

-- ── 2) Lock down dangerous SECURITY DEFINER delete-auth RPCs ────────────────
-- Live inventory (zero-arg variants; no delete_auth_user(uuid) overload exists).
-- Several are leftover experimental variants; some are still attached as AFTER
-- DELETE triggers on patients (tr_cleanup_auth, trg_patient_delete_auth_cleanup).
-- Revoke client roles; allow service_role only for intentional privileged ops.

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
    'delete_auth_user_on_patient_delete',
    -- Same privilege class (SECURITY DEFINER auth cleanup callable via RPC)
    'handle_patient_delete_auth_cleanup'
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
      EXECUTE format('REVOKE ALL ON FUNCTION public.%I() FROM PUBLIC', fn);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I() FROM anon, authenticated', fn);
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I() TO service_role', fn);
    END IF;
  END LOOP;
END
$$;

-- ── 3) Post-migration verification helpers (read-only asserts) ──────────────
-- Fail the migration if a true/true ALL bypass somehow still exists, or if
-- required scoped policies are missing (would break patient login / reporting).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'patients'
      AND policyname = 'Allow all actions for authenticated users'
  ) THEN
    RAISE EXCEPTION 'emergency_security_hardening: patients bypass policy still present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'session_history'
      AND policyname IN (
        'Allow all actions for authenticated users on history',
        'Users can view session history'
      )
  ) THEN
    RAISE EXCEPTION 'emergency_security_hardening: session_history bypass policy still present';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'app_knowledge_base'
      AND policyname IN (
        'Allow public insert',
        'Allow public update',
        'Allow therapist to manage their own knowledge base'
      )
  ) THEN
    RAISE EXCEPTION 'emergency_security_hardening: app_knowledge_base write-bypass policy still present';
  END IF;

  -- Required policies for patient login + therapist access
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patients'
      AND policyname = 'patients_select_patient'
  ) THEN
    RAISE EXCEPTION 'emergency_security_hardening: missing patients_select_patient (patient login would break)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patients'
      AND policyname = 'patients_update_patient'
  ) THEN
    RAISE EXCEPTION 'emergency_security_hardening: missing patients_update_patient (patient portal updates would break)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'patients'
      AND policyname = 'patients_select_therapist'
  ) THEN
    RAISE EXCEPTION 'emergency_security_hardening: missing patients_select_therapist';
  END IF;

  -- Required policies for session reporting / hydration
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_history'
      AND policyname = 'session_history_select_patient'
  ) THEN
    RAISE EXCEPTION 'emergency_security_hardening: missing session_history_select_patient';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_history'
      AND policyname = 'session_history_insert_patient'
  ) THEN
    RAISE EXCEPTION 'emergency_security_hardening: missing session_history_insert_patient';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'session_history'
      AND policyname = 'session_history_select_therapist'
  ) THEN
    RAISE EXCEPTION 'emergency_security_hardening: missing session_history_select_therapist';
  END IF;

  -- Therapist KB writes (phase-1) must remain
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'app_knowledge_base'
      AND policyname = 'app_knowledge_base_insert_therapist'
  ) THEN
    RAISE EXCEPTION 'emergency_security_hardening: missing app_knowledge_base_insert_therapist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'app_knowledge_base'
      AND policyname = 'app_knowledge_base_update_therapist'
  ) THEN
    RAISE EXCEPTION 'emergency_security_hardening: missing app_knowledge_base_update_therapist';
  END IF;
END
$$;
