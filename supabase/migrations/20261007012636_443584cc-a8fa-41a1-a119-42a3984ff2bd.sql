ALTER TABLE public.sheet_sync_queue
  ADD COLUMN IF NOT EXISTS update_seq integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS needs_update boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ever_synced boolean NOT NULL DEFAULT false;

UPDATE public.sheet_sync_queue SET ever_synced = true WHERE status = 'synced' AND ever_synced = false;

CREATE OR REPLACE FUNCTION public.enqueue_sheet_sync_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _changed boolean := false;
  _n int;
  _url text;
BEGIN
  IF TG_TABLE_NAME = 'expenses' THEN
    _changed := (OLD.project_id, OLD.expense_date, OLD.description, OLD.category, OLD.qty, OLD.unit_price, OLD.amount, OLD.paid_by)
      IS DISTINCT FROM (NEW.project_id, NEW.expense_date, NEW.description, NEW.category, NEW.qty, NEW.unit_price, NEW.amount, NEW.paid_by);
  ELSIF TG_TABLE_NAME = 'incomes' THEN
    _changed := (OLD.project_id, OLD.income_date, OLD.description, OLD.category, OLD.amount, OLD.payer)
      IS DISTINCT FROM (NEW.project_id, NEW.income_date, NEW.description, NEW.category, NEW.amount, NEW.payer);
  END IF;
  IF NOT _changed THEN RETURN NEW; END IF;

  -- Faqat mavjud navbat qatori yangilanadi; yangi qator yaratilmaydi (eski yozuvlar qayta qo'shilmasin).
  UPDATE public.sheet_sync_queue
     SET status = 'pending', needs_update = true, update_seq = update_seq + 1,
         attempts = 0, error = NULL, project_id = NEW.project_id
   WHERE source_table = TG_TABLE_NAME AND record_id = NEW.id;
  GET DIAGNOSTICS _n = ROW_COUNT;

  IF _n > 0 THEN
    _url := public.sheets_sync_url();
    IF _url IS NOT NULL AND _url <> '' THEN
      PERFORM net.http_post(url := _url, headers := '{"Content-Type": "application/json"}'::jsonb, body := '{}'::jsonb);
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_trigger_error(TG_TABLE_NAME, 'sheet_sync_update', NEW.id, SQLERRM, SQLSTATE, NULL);
  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.enqueue_sheet_sync_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_expenses_sheet_sync_update ON public.expenses;
CREATE TRIGGER trg_expenses_sheet_sync_update AFTER UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_sheet_sync_update();
DROP TRIGGER IF EXISTS trg_incomes_sheet_sync_update ON public.incomes;
CREATE TRIGGER trg_incomes_sheet_sync_update AFTER UPDATE ON public.incomes
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_sheet_sync_update();