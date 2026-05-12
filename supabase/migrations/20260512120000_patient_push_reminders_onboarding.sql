-- Patient push reminders, activity timestamps, onboarding flags, and exercise_logs view.
-- Therapist rows live in public.profiles; portal/device fields belong on public.patients.

-- ── Helpers: "session had real work" (mirrors app normalization heuristics) ──
CREATE OR REPLACE FUNCTION public.session_history_has_work(p jsonb)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    COALESCE(jsonb_array_length(COALESCE(p -> 'completedIds', p -> 'completed_ids', '[]'::jsonb)), 0) > 0
    OR COALESCE(
      jsonb_array_length(
        COALESCE(p -> 'finishReports', p -> 'finish_reports', '[]'::jsonb)
      ),
      0
    ) > 0
    OR COALESCE(NULLIF(trim(p ->> 'sessionXp'), '')::numeric, NULLIF(trim(p ->> 'session_xp'), '')::numeric, 0)
       > 0;
$$;

COMMENT ON FUNCTION public.session_history_has_work(jsonb) IS
  'True when session_history.payload records completed work (completedIds, finishReports, or sessionXp).';

-- ── exercise_logs: one row per qualifying session (for onboarding counts & analytics) ──
CREATE OR REPLACE VIEW public.exercise_logs AS
SELECT
  sh.id,
  sh.patient_id,
  sh.session_date,
  sh.updated_at AS logged_at,
  sh.payload
FROM public.session_history sh
WHERE public.session_history_has_work(sh.payload);

COMMENT ON VIEW public.exercise_logs IS
  'Completed sessions derived from session_history (Physio-Shield "exercise log" entries).';

GRANT SELECT ON public.exercise_logs TO authenticated;
GRANT SELECT ON public.exercise_logs TO service_role;

-- ── Patient columns: push, activity, timezone, reminder dedupe, onboarding ──
ALTER TABLE public.patients
  ADD COLUMN IF NOT EXISTS push_token TEXT,
  ADD COLUMN IF NOT EXISTS last_activity_timestamp TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reminder_timezone TEXT,
  ADD COLUMN IF NOT EXISTS onboarding_complete BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_momentum_reminder_local_date TEXT,
  ADD COLUMN IF NOT EXISTS last_standard_reminder_local_date TEXT;

COMMENT ON COLUMN public.patients.push_token IS
  'Expo push token (ExponentPushToken[...]) or web placeholder; used by reminder-cron Edge Function.';
COMMENT ON COLUMN public.patients.last_activity_timestamp IS
  'Updated by the patient app while browsing; drives "momentum" reminder eligibility.';
COMMENT ON COLUMN public.patients.reminder_timezone IS
  'IANA timezone for local 20:00 standard reminder (e.g. Asia/Jerusalem).';
COMMENT ON COLUMN public.patients.onboarding_complete IS
  'True after at least 3 exercise_logs rows; suppresses heavy AI treatment loops in the app.';
COMMENT ON COLUMN public.patients.last_momentum_reminder_local_date IS
  'Local calendar date (patient timezone) when momentum push was last sent.';
COMMENT ON COLUMN public.patients.last_standard_reminder_local_date IS
  'Local calendar date when standard 20:00 reminder was last sent.';

CREATE INDEX IF NOT EXISTS idx_patients_push_token
  ON public.patients (push_token)
  WHERE push_token IS NOT NULL AND length(trim(push_token)) > 0;

CREATE INDEX IF NOT EXISTS idx_patients_last_activity
  ON public.patients (last_activity_timestamp)
  WHERE last_activity_timestamp IS NOT NULL;

-- ── Keep onboarding_complete in sync when session_history changes ──
CREATE OR REPLACE FUNCTION public.refresh_patient_onboarding_complete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  pid TEXT;
  done BOOLEAN;
BEGIN
  pid := COALESCE(NEW.patient_id, OLD.patient_id);
  IF pid IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COUNT(*) >= 3
  INTO done
  FROM public.exercise_logs el
  WHERE el.patient_id = pid;

  UPDATE public.patients
  SET onboarding_complete = done
  WHERE id = pid;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_session_history_refresh_onboarding ON public.session_history;
CREATE TRIGGER trg_session_history_refresh_onboarding
  AFTER INSERT OR UPDATE OF payload OR DELETE
  ON public.session_history
  FOR EACH ROW
  EXECUTE PROCEDURE public.refresh_patient_onboarding_complete();

-- Backfill onboarding for existing patients
UPDATE public.patients p
SET onboarding_complete = (
  SELECT COUNT(*) >= 3 FROM public.exercise_logs el WHERE el.patient_id = p.id
);
