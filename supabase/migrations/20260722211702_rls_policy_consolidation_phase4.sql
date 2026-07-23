-- =============================================================================
-- SECURITY HARDENING PHASE 4 — consolidate duplicate permissive RLS policies
-- =============================================================================
-- Live advisors flagged multiple_permissive_policies + auth_rls_initplan on
-- legacy overlapping policies. Keep the scoped patients_*/profiles_*/exercise_plans_*
-- set; drop older public/ALL duplicates that OR with them.
-- =============================================================================

-- ── patients: drop legacy duplicates (scoped patients_* remain) ─────────────
DROP POLICY IF EXISTS "Allow therapists to update their own patients" ON public.patients;
DROP POLICY IF EXISTS "Therapists can view their assigned patients" ON public.patients;
DROP POLICY IF EXISTS "Users can view their own patient record" ON public.patients;

-- ── profiles: drop legacy public/ALL duplicates (profiles_* remain) ─────────
DROP POLICY IF EXISTS "Profiles are viewable by owner" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can manage their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

-- ── exercise_plans: drop overlapping ALL policy ─────────────────────────────
DROP POLICY IF EXISTS "therapist_full_access" ON public.exercise_plans;

-- ── app_knowledge_base: drop duplicate public SELECT ────────────────────────
DROP POLICY IF EXISTS "Allow public read access" ON public.app_knowledge_base;

-- Re-assert scoped policies use (select auth.uid()) init-plan form (idempotent).
DROP POLICY IF EXISTS "patients_select_therapist" ON public.patients;
CREATE POLICY "patients_select_therapist"
  ON public.patients
  FOR SELECT
  TO authenticated
  USING (therapist_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "patients_select_patient" ON public.patients;
CREATE POLICY "patients_select_patient"
  ON public.patients
  FOR SELECT
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = (SELECT auth.uid())::text)
  WITH CHECK (id = (SELECT auth.uid())::text);

COMMENT ON TABLE public.patients IS
  'Full Patient document as JSONB. Phase4: duplicate legacy permissive policies removed; access via patients_* only.';

COMMENT ON TABLE public.profiles IS
  'Therapist profiles. Phase4: duplicate legacy policies removed; access via profiles_* only.';
