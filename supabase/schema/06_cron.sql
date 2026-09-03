-- ═══════════════════════════════════════════════════════════════
-- PULSE — SCHEDULED JOBS (pg_cron + pg_net)
-- Run in Supabase SQL Editor AFTER enabling extensions below.
--
-- ⚠️  SECURITY: never commit real keys to this file.
--     Replace YOUR_SB_SECRET_KEY below with your sb_secret_... key
--     (Dashboard → Project Settings → API Keys) at paste time only.
-- ═══════════════════════════════════════════════════════════════

-- 1. Enable extensions (once):
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2. Remove any previous job (safe to run even if it doesn't exist):
select cron.unschedule('weekly-report-reminder')
where exists (select 1 from cron.job where jobname = 'weekly-report-reminder');

-- 3. Weekly report reminder — every Friday at 9AM WAT (8AM UTC).
--    Calls the send-reminders Edge Function, which emails all employees
--    who haven't submitted a report in the last 7 days.
--    Both headers are set so the call authenticates with the new-style
--    sb_secret key at the functions gateway.
select cron.schedule(
  'weekly-report-reminder',
  '0 8 * * 5',  -- Every Friday at 8AM UTC (9AM WAT)
  $$
    select net.http_post(
      url     := 'https://yluskblohjdioqmeczsd.supabase.co/functions/v1/send-reminders',
      headers := jsonb_build_object(
        'Content-Type',   'application/json',
        'Authorization',  'Bearer YOUR_SB_SECRET_KEY',
        'apikey',         'YOUR_SB_SECRET_KEY',
        'x-pulse-secret', 'YOUR_PULSE_EDGE_SECRET'
      ),
      body    := '{}'::jsonb
    );
  $$
);

-- To verify the job was created:
-- select * from cron.job;

-- To remove it:
-- select cron.unschedule('weekly-report-reminder');
