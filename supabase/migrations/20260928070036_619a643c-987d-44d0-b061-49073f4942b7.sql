-- Yozuv qo'shilishi bilan darhol Google Sheets sinxronizatsiyasini uyg'otadi (polling emas)
CREATE OR REPLACE FUNCTION public.enqueue_sheet_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _url text;
BEGIN
  INSERT INTO public.sheet_sync_queue (source_table, record_id, project_id)
  VALUES (TG_TABLE_NAME, NEW.id, NEW.project_id)
  ON CONFLICT (source_table, record_id) DO NOTHING;

  SELECT value INTO _url FROM public.app_settings WHERE key = 'sheets_sync_webhook_url';
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

REVOKE ALL ON FUNCTION public.enqueue_sheet_sync() FROM PUBLIC, anon, authenticated;

-- External Sheets sync is intentionally not scheduled during migration.
-- Configure a new endpoint and secret only after the new application is deployed.
