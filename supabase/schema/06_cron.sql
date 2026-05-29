-- ═══════════════════════════════════════════════════════════════
-- PULSE — SCHEDULED JOBS (pg_cron + pg_net)
-- Run in Supabase SQL Editor AFTER enabling extensions below.
-- ═══════════════════════════════════════════════════════════════

-- 1. Enable extensions (do this once in Supabase Dashboard →
--    Database → Extensions, or run here):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Weekly report reminder — every Friday at 9AM WAT (8AM UTC)
--    Calls the send-reminders Edge Function which emails all employees
--    who haven't submitted a report in the last 7 days.
--
--    Replace YOUR_SUPABASE_PROJECT_REF with your actual project ref
--    (found in Supabase Dashboard → Settings → General).
--    Replace YOUR_SERVICE_ROLE_KEY with your service role key.

select cron.schedule(
  'weekly-report-reminder',
  '0 8 * * 5',  -- Every Friday at 8AM UTC (9AM WAT)
  $$
    select net.http_post(
      url     := 'https://YOUR_SUPABASE_PROJECT_REF.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- To verify the job was created:
-- select * from cron.job;

-- To remove it:
-- select cron.unschedule('weekly-report-reminder');
