create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('ceo-daily-report') where exists (select 1 from cron.job where jobname = 'ceo-daily-report');

-- External CEO reporting is intentionally not scheduled during migration.
-- Configure a new endpoint and secret only after the new application is deployed.
