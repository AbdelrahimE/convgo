
-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule the cleanup function to run every 12 hours
SELECT cron.schedule(
  'run-cleanup-every-12h',
  '0 */12 * * *',
  $$
  SELECT
    net.http_post(
      url:='https://okoaoguvtjauiecfajri.supabase.co/functions/v1/scheduled-cleanup',
      headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
    ) as request_id;
  $$
);
