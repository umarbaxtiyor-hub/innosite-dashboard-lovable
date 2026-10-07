CREATE TABLE public.telegram_processed_updates (
  update_id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_processed_updates TO service_role;
ALTER TABLE public.telegram_processed_updates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admins read processed updates" ON public.telegram_processed_updates
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.telegram_processed_updates TO authenticated;

CREATE TABLE public.internal_secrets (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.internal_secrets TO service_role;
ALTER TABLE public.internal_secrets ENABLE ROW LEVEL SECURITY;
-- no policies: only service_role / security definer functions can read

INSERT INTO public.internal_secrets(key, value)
VALUES ('sheets_sync_token', replace(gen_random_uuid()::text,'-','') || replace(gen_random_uuid()::text,'-',''))
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sheets_sync_url()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT NULL::text
$$;
REVOKE ALL ON FUNCTION public.sheets_sync_url() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.enqueue_sheet_sync()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _url text;
BEGIN
  INSERT INTO public.sheet_sync_queue (source_table, record_id, project_id)
  VALUES (TG_TABLE_NAME, NEW.id, NEW.project_id)
  ON CONFLICT (source_table, record_id) DO NOTHING;

  _url := public.sheets_sync_url();
  IF _url IS NOT NULL AND _url <> '' THEN
    PERFORM net.http_post(
      url := _url,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      body := '{}'::jsonb
    );
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

-- Remove the old URL (contained a leaked secret) from readable settings
DELETE FROM public.app_settings WHERE key = 'sheets_sync_webhook_url';

-- Re-point hourly backstop cron jobs to read the URL at runtime
DO $$
DECLARE j record;
BEGIN
  FOR j IN SELECT jobid, jobname, schedule FROM cron.job WHERE command LIKE '%/api/public/sheets-sync/%' LOOP
    PERFORM cron.unschedule(j.jobid);
    PERFORM cron.schedule(
      coalesce(j.jobname, 'sheets-sync-backstop'),
      j.schedule,
      $cmd$SELECT net.http_post(url := public.sheets_sync_url(), headers := '{"Content-Type":"application/json"}'::jsonb, body := '{}'::jsonb);$cmd$
    );
  END LOOP;
END $$;
