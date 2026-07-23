-- =============================================================================
-- Disable legacy reminder-cron pg_cron job that leaked the secret in the URL
-- =============================================================================
-- Job 4 called reminder-cron?secret=... which the Edge Function rejects
-- (query-string secrets are blocked). Job 5 uses x-cron-secret header via
-- private.app_config — keep that one active (hourly).
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobid = 4) THEN
    PERFORM cron.unschedule(4);
  END IF;
EXCEPTION
  WHEN undefined_table THEN
    NULL; -- cron schema absent in non-hosted environments
  WHEN OTHERS THEN
    RAISE NOTICE 'cron.unschedule(4) skipped: %', SQLERRM;
END $$;
