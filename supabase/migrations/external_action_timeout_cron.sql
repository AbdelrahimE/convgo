-- External Action Timeout Handler - Cron Job Setup
-- This migration sets up a cron job to handle expired external action responses
-- The job runs every minute to check for and process expired pending responses

-- Enable required extensions if not already enabled
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

-- Drop existing cron job if it exists (for re-running migration)
select cron.unschedule('external-action-timeout-handler')
where exists (
  select 1 from cron.job where jobname = 'external-action-timeout-handler'
);

-- Create cron job to handle expired external action responses every minute
-- This job calls the external-action-timeout-handler edge function via HTTP
select cron.schedule(
  'external-action-timeout-handler',        -- Job name
  '* * * * *',                              -- Cron schedule: every minute
  $$
  select net.http_post(
    url := (current_setting('app.settings.supabase_url') || '/functions/v1/external-action-timeout-handler'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Note: Before enabling this cron job, you need to set the following runtime settings:
-- Run these commands in the Supabase SQL Editor:
--
-- ALTER DATABASE postgres SET app.settings.supabase_url = 'YOUR_SUPABASE_URL';
-- ALTER DATABASE postgres SET app.settings.service_role_key = 'YOUR_SERVICE_ROLE_KEY';
--
-- Replace YOUR_SUPABASE_URL with your actual Supabase project URL (e.g., https://xxxxx.supabase.co)
-- Replace YOUR_SERVICE_ROLE_KEY with your actual Supabase service role key
--
-- After setting these values, the cron job will automatically start running every minute.

-- Create a helper function to view cron job status
create or replace function public.get_external_action_cron_status()
returns table (
  jobid bigint,
  schedule text,
  command text,
  active boolean,
  jobname text
)
language sql
security definer
as $$
  select jobid, schedule, command, active, jobname
  from cron.job
  where jobname = 'external-action-timeout-handler';
$$;

-- Grant execute permission to authenticated users (optional - remove if not needed)
grant execute on function public.get_external_action_cron_status() to authenticated;

comment on function public.get_external_action_cron_status() is
'Returns the status of the external action timeout handler cron job';
