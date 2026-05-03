-- PHYSIOSHIELD — Row Level Security (RLS) for clinical tables + knowledge base
--
-- BRIDGE (custom auth today → Supabase Auth tomorrow)
-- ---------------------------------------------------------------------------
-- Policies use auth.uid() from the Supabase session JWT. Until you sign users in
-- with Supabase Auth, the browser anon key has NO valid JWT → these policies
-- deny direct PostgREST access to clinical data (expected). Options meanwhile:
--
-- 1) Recommended short-term: call Supabase from Edge Functions / backend using
--    the service role key (bypasses RLS) and enforce therapist/patient checks
--    in application code until JWTs are wired.
--
-- 2) After Supabase Auth for therapists:
--    - Set public.profiles.id = auth.uid()::text (store the UUID as text), OR
--      add profiles.user_id UUID UNIQUE REFERENCES auth.users(id) and change
--      policies to use profiles.user_id = auth.uid().
--    - On signup / first login, upsert the therapist row so EXISTS (profiles…)
--      holds for KB writes.
--
-- 3) After Supabase Auth for patients (portal):
--    - Set patients.auth_user_id = auth.uid() for that patient row (this
--      migration adds the column). Link once when the patient account is created.
--    - Optional: instead of auth_user_id, use JWT custom claims, e.g.
--      (auth.jwt() -> 'user_metadata' ->> 'patient_id') = patients.id
--      and mirror the same claim in policies below (replace auth_user_id checks).
--
-- Service role: continues to bypass RLS (seeds, admin scripts, trusted backends).

-- ── Link portal users (Supabase Auth) to app patient rows ───────────────────
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES auth.users (id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_patients_auth_user_id
  ON public.patients (auth_user_id)
  WHERE auth_user_id IS NOT NULL;

COMMENT ON COLUMN public.patients.auth_user_id IS 'Supabase Auth user owning this patient row (portal); used by RLS';

-- ── Enable RLS ────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients FORCE ROW LEVEL SECURITY;

ALTER TABLE public.exercise_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exercise_plans FORCE ROW LEVEL SECURITY;

ALTER TABLE public.session_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_history FORCE ROW LEVEL SECURITY;

ALTER TABLE public.app_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_knowledge_base FORCE ROW LEVEL SECURITY;

-- ── profiles (therapist account row; id should match auth.uid()::text) ──────
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

-- ── patients ───────────────────────────────────────────────────────────────
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

DROP POLICY IF EXISTS "patients_insert_therapist" ON public.patients;
CREATE POLICY "patients_insert_therapist"
  ON public.patients
  FOR INSERT
  TO authenticated
  WITH CHECK (therapist_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "patients_update_therapist" ON public.patients;
CREATE POLICY "patients_update_therapist"
  ON public.patients
  FOR UPDATE
  TO authenticated
  USING (therapist_id = (SELECT auth.uid())::text)
  WITH CHECK (therapist_id = (SELECT auth.uid())::text);

DROP POLICY IF EXISTS "patients_update_patient" ON public.patients;
CREATE POLICY "patients_update_patient"
  ON public.patients
  FOR UPDATE
  TO authenticated
  USING (auth_user_id = (SELECT auth.uid()))
  WITH CHECK (auth_user_id = (SELECT auth.uid()));

-- ── exercise_plans (via patients.therapist_id or patients.auth_user_id) ────
DROP POLICY IF EXISTS "exercise_plans_select_therapist" ON public.exercise_plans;
CREATE POLICY "exercise_plans_select_therapist"
  ON public.exercise_plans
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = exercise_plans.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "exercise_plans_select_patient" ON public.exercise_plans;
CREATE POLICY "exercise_plans_select_patient"
  ON public.exercise_plans
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = exercise_plans.patient_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "exercise_plans_insert_therapist" ON public.exercise_plans;
CREATE POLICY "exercise_plans_insert_therapist"
  ON public.exercise_plans
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = exercise_plans.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "exercise_plans_update_therapist" ON public.exercise_plans;
CREATE POLICY "exercise_plans_update_therapist"
  ON public.exercise_plans
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = exercise_plans.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = exercise_plans.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "exercise_plans_update_patient" ON public.exercise_plans;
CREATE POLICY "exercise_plans_update_patient"
  ON public.exercise_plans
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = exercise_plans.patient_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = exercise_plans.patient_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

-- ── session_history ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS "session_history_select_therapist" ON public.session_history;
CREATE POLICY "session_history_select_therapist"
  ON public.session_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = session_history.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "session_history_select_patient" ON public.session_history;
CREATE POLICY "session_history_select_patient"
  ON public.session_history
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = session_history.patient_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "session_history_insert_therapist" ON public.session_history;
CREATE POLICY "session_history_insert_therapist"
  ON public.session_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = session_history.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "session_history_insert_patient" ON public.session_history;
CREATE POLICY "session_history_insert_patient"
  ON public.session_history
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = session_history.patient_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "session_history_update_therapist" ON public.session_history;
CREATE POLICY "session_history_update_therapist"
  ON public.session_history
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = session_history.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = session_history.patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

DROP POLICY IF EXISTS "session_history_update_patient" ON public.session_history;
CREATE POLICY "session_history_update_patient"
  ON public.session_history
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = session_history.patient_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = session_history.patient_id
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

-- ── app_knowledge_base: public read; writes only for therapist profiles ─────
DROP POLICY IF EXISTS "app_knowledge_base_select_public" ON public.app_knowledge_base;
CREATE POLICY "app_knowledge_base_select_public"
  ON public.app_knowledge_base
  FOR SELECT
  TO anon, authenticated
  USING (true);

DROP POLICY IF EXISTS "app_knowledge_base_insert_therapist" ON public.app_knowledge_base;
CREATE POLICY "app_knowledge_base_insert_therapist"
  ON public.app_knowledge_base
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = (SELECT auth.uid())::text)
  );

DROP POLICY IF EXISTS "app_knowledge_base_update_therapist" ON public.app_knowledge_base;
CREATE POLICY "app_knowledge_base_update_therapist"
  ON public.app_knowledge_base
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = (SELECT auth.uid())::text)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = (SELECT auth.uid())::text)
  );
