
ALTER TABLE public.material_receipts ADD COLUMN IF NOT EXISTS import_hash text;
ALTER TABLE public.work_progress ADD COLUMN IF NOT EXISTS import_hash text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS import_hash text;
ALTER TABLE public.brigade_payments ADD COLUMN IF NOT EXISTS import_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS material_receipts_project_hash_uq
  ON public.material_receipts (project_id, import_hash) WHERE import_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS work_progress_project_hash_uq
  ON public.work_progress (project_id, import_hash) WHERE import_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS expenses_project_hash_uq
  ON public.expenses (project_id, import_hash) WHERE import_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS brigade_payments_project_hash_uq
  ON public.brigade_payments (project_id, import_hash) WHERE import_hash IS NOT NULL;
