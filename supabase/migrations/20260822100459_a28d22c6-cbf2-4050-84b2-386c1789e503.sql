ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'operatsion';
ALTER TABLE public.expenses DROP CONSTRAINT IF EXISTS expenses_kind_check;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_kind_check CHECK (kind IN ('boq_material','boq_work','ustalar','xodim','operatsion'));

UPDATE public.expenses SET kind = CASE
  WHEN lower(coalesce(category,'')) LIKE '%material (boq)%' THEN 'boq_material'
  WHEN lower(coalesce(category,'')) LIKE '%ish (boq)%' THEN 'boq_work'
  WHEN lower(coalesce(category,'')) LIKE '%usta%' OR lower(coalesce(category,'')) LIKE '%brigada%' THEN 'ustalar'
  WHEN lower(coalesce(category,'')) LIKE '%xodim%' THEN 'xodim'
  WHEN boq_item_id IS NOT NULL OR (boq_code IS NOT NULL AND boq_code <> '') THEN
    CASE WHEN lower(coalesce(category,'')) LIKE '%ish%' THEN 'boq_work' ELSE 'boq_material' END
  ELSE 'operatsion' END;

CREATE INDEX IF NOT EXISTS expenses_kind_idx ON public.expenses(kind);

ALTER TABLE public.expense_categories ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'operatsion';
ALTER TABLE public.expense_categories DROP CONSTRAINT IF EXISTS expense_categories_kind_check;
ALTER TABLE public.expense_categories ADD CONSTRAINT expense_categories_kind_check CHECK (kind IN ('boq_material','boq_work','ustalar','xodim','operatsion'));

UPDATE public.expense_categories SET kind = CASE
  WHEN lower(name) LIKE '%material (boq)%' THEN 'boq_material'
  WHEN lower(name) LIKE '%ish (boq)%' THEN 'boq_work'
  WHEN lower(name) LIKE '%usta%' OR lower(name) LIKE '%brigada%' THEN 'ustalar'
  WHEN lower(name) LIKE '%xodim%' THEN 'xodim'
  ELSE 'operatsion' END;

DROP TABLE IF EXISTS public.project_operations;