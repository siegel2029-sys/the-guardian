-- =============================================================================
-- 3-day clinical program review proposals (therapist approval required)
-- =============================================================================
-- Background clinical-review-cron evaluates session logs every 3 days and inserts
-- structured proposals. Declined / approved rows never block the next cycle —
-- only one `pending` row per patient is allowed (partial unique index).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.program_review_proposals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id text NOT NULL REFERENCES public.patients (id) ON DELETE CASCADE,
  therapist_id text NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  review_window_start date NOT NULL,
  review_window_end date NOT NULL,
  decision text NOT NULL
    CHECK (decision IN ('reduce', 'progress', 'maintain')),
  rationale text NOT NULL DEFAULT '',
  proposed_exercises jsonb NOT NULL DEFAULT '[]'::jsonb,
  proposed_changes jsonb NOT NULL DEFAULT '[]'::jsonb,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'declined', 'auto_recorded')),
  resolved_at timestamptz,
  resolved_by text REFERENCES public.profiles (id) ON DELETE SET NULL,
  CONSTRAINT program_review_proposals_window_chk
    CHECK (review_window_end >= review_window_start)
);

COMMENT ON TABLE public.program_review_proposals IS
  'Background 3-day clinical review proposals. reduce/progress require therapist approval; maintain may be auto_recorded. Never auto-applies plan changes.';

COMMENT ON COLUMN public.program_review_proposals.proposed_exercises IS
  'Proposed exercise_plans.exercises JSONB snapshot (apply only after therapist approve).';

COMMENT ON COLUMN public.program_review_proposals.metrics IS
  'De-identified aggregates: avgPain, maxPain, adherenceRate, logDays, highPainExerciseIds — no PHI.';

CREATE UNIQUE INDEX IF NOT EXISTS program_review_proposals_one_pending_per_patient
  ON public.program_review_proposals (patient_id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS program_review_proposals_therapist_status_idx
  ON public.program_review_proposals (therapist_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS program_review_proposals_patient_created_idx
  ON public.program_review_proposals (patient_id, created_at DESC);

ALTER TABLE public.program_review_proposals ENABLE ROW LEVEL SECURITY;

-- Therapists: full access to rows for their own patients / therapist_id.
CREATE POLICY "program_review_proposals_select_therapist"
  ON public.program_review_proposals
  FOR SELECT
  TO authenticated
  USING (therapist_id = (SELECT auth.uid())::text);

CREATE POLICY "program_review_proposals_insert_therapist"
  ON public.program_review_proposals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    therapist_id = (SELECT auth.uid())::text
    AND EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_id
        AND p.therapist_id = (SELECT auth.uid())::text
    )
  );

CREATE POLICY "program_review_proposals_update_therapist"
  ON public.program_review_proposals
  FOR UPDATE
  TO authenticated
  USING (therapist_id = (SELECT auth.uid())::text)
  WITH CHECK (therapist_id = (SELECT auth.uid())::text);

CREATE POLICY "program_review_proposals_delete_therapist"
  ON public.program_review_proposals
  FOR DELETE
  TO authenticated
  USING (therapist_id = (SELECT auth.uid())::text);

-- Patients: read-only awareness of their own review cycle (AI assistant context).
CREATE POLICY "program_review_proposals_select_patient"
  ON public.program_review_proposals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.patients p
      WHERE p.id = patient_id
        AND p.auth_user_id IS NOT NULL
        AND p.auth_user_id = (SELECT auth.uid())
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.program_review_proposals TO authenticated;
GRANT ALL ON public.program_review_proposals TO service_role;

-- Daily cron → clinical-review-cron Edge Function (x-cron-secret via private.app_config).
-- Per-patient 3-day cadence is enforced inside the function; this job only invokes it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('physioshield-clinical-review-cron');
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL;
  WHEN undefined_function THEN
    NULL;
  WHEN OTHERS THEN
    -- job may not exist yet
    NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    PERFORM cron.schedule(
      'physioshield-clinical-review-cron',
      '15 3 * * *',
      $cron$
  SELECT net.http_post(
    url     := (SELECT value FROM private.app_config WHERE key = 'edge_functions_base_url') || '/clinical-review-cron',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (SELECT btrim(value) FROM private.app_config WHERE key = 'internal_cron_secret')
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $cron$
    );
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE 'clinical-review cron schedule skipped (cron/app_config absent)';
  WHEN OTHERS THEN
    RAISE NOTICE 'clinical-review cron schedule skipped: %', SQLERRM;
END $$;
