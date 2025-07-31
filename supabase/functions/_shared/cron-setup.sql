
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- First remove any existing scheduled tasks with this name to avoid duplicates
SELECT cron.unschedule('run-cleanup-every-12h');

-- Schedule the cleanup function to run every 12 hours
SELECT cron.schedule(
  'run-cleanup-every-12h',
  '0 */12 * * *',
  $$
  SELECT public.cleanup_webhook_debug_logs();
  $$
);
