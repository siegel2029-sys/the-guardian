-- PHYSIOSHIELD — initial persistence schema (Supabase / Postgres)
-- Run in: SQL Editor → New query, or `supabase db push` if using Supabase CLI.
--
-- Maps app types (src/types/index.ts):
--   Therapist     → profiles
--   Patient       → patients.payload (JSONB)
--   ExercisePlan  → exercise_plans (patient_id + exercises JSONB)
--   DailySession  → session_history (patient_id + session_date + payload JSONB)
--
-- Security: enable RLS and tight policies before production. Tables are created with RLS OFF
-- for quick local testing with the anon key; restrict in dashboard when going live.

-- ── Therapist profiles (Therapist: id, name, email, title, avatarInitials, clinicName) ──
CREATE TABLE IF NOT EXISTS public.profiles (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL DEFAULT '',
  name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  avatar_initials TEXT NOT NULL DEFAULT '',
  clinic_name TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles (email);

COMMENT ON TABLE public.profiles IS 'Therapist accounts; id matches app Therapist.id';

-- ── Patients (Patient JSON — nested analytics, body areas, gamification) ──
CREATE TABLE IF NOT EXISTS public.patients (
  id TEXT PRIMARY KEY,
  therapist_id TEXT NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_patients_therapist ON public.patients (therapist_id);
CREATE INDEX IF NOT EXISTS idx_patients_payload_gin ON public.patients USING gin (payload);

COMMENT ON TABLE public.patients IS 'Full Patient document as JSONB (see types.Patient)';

-- ── Exercise plans (ExercisePlan: patientId + exercises[]) ──
CREATE TABLE IF NOT EXISTS public.exercise_plans (
  patient_id TEXT PRIMARY KEY REFERENCES public.patients (id) ON DELETE CASCADE,
  exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.exercise_plans IS 'PatientExercise[] per patient';

-- ── Session history (DailySession per clinical date) ──
CREATE TABLE IF NOT EXISTS public.session_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id TEXT NOT NULL REFERENCES public.patients (id) ON DELETE CASCADE,
  session_date TEXT NOT NULL,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT session_history_patient_date_unique UNIQUE (patient_id, session_date)
);

CREATE INDEX IF NOT EXISTS idx_session_history_patient ON public.session_history (patient_id);

COMMENT ON TABLE public.session_history IS 'DailySession rows; session_date = clinical YYYY-MM-DD';

-- Optional: updated_at trigger (requires function — skip for minimal migration)
