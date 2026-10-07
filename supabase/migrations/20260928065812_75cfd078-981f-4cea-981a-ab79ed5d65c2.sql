-- Google Sheets sinxronizatsiya navbati
CREATE TABLE public.sheet_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  record_id uuid NOT NULL,
  project_id uuid,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  synced_at timestamptz,
  UNIQUE (source_table, record_id)
);

GRANT SELECT ON public.sheet_sync_queue TO authenticated;
GRANT ALL ON public.sheet_sync_queue TO service_role;

ALTER TABLE public.sheet_sync_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin/finance can view sheet sync queue"
ON public.sheet_sync_queue FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'finans'));

CREATE INDEX idx_sheet_sync_queue_pending
  ON public.sheet_sync_queue (created_at) WHERE status = 'pending';

-- Har bir yangi xarajat / kirim navbatga qo'shiladi
CREATE OR REPLACE FUNCTION public.enqueue_sheet_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.sheet_sync_queue (source_table, record_id, project_id)
  VALUES (TG_TABLE_NAME, NEW.id, NEW.project_id)
  ON CONFLICT (source_table, record_id) DO NOTHING;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_expenses_sheet_sync
AFTER INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.enqueue_sheet_sync();

CREATE TRIGGER trg_incomes_sheet_sync
AFTER INSERT ON public.incomes
FOR EACH ROW EXECUTE FUNCTION public.enqueue_sheet_sync();

-- Sozlamalar
-- Integration settings are intentionally not copied into a new project.
