-- =============================================================================
-- Live engine phase for therapist dashboard badges (scanning / analyzing / idle)
-- Written only by service_role (clinical-review-cron); therapists may SELECT.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.program_review_engine_status (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  phase text NOT NULL DEFAULT 'idle'
    CHECK (phase IN ('idle', 'scanning', 'analyzing')),
  started_at timestamptz,
  finished_at timestamptz,
  last_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.program_review_engine_status IS
  'Singleton row: background clinical-review-cron phase for therapist UI badges. No PHI.';

INSERT INTO public.program_review_engine_status (id, phase)
VALUES (1, 'idle')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.program_review_engine_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "program_review_engine_status_select_therapist"
  ON public.program_review_engine_status
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles pr
      WHERE pr.id = (SELECT auth.uid())::text
    )
  );

GRANT SELECT ON public.program_review_engine_status TO authenticated;
GRANT ALL ON public.program_review_engine_status TO service_role;
