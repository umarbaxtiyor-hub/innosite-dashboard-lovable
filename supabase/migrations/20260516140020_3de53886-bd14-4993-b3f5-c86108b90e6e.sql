CREATE TABLE IF NOT EXISTS public.expense_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.expense_units ENABLE ROW LEVEL SECURITY;
CREATE POLICY eu_read_all ON public.expense_units FOR SELECT USING (true);
CREATE POLICY eu_insert ON public.expense_units FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY eu_update ON public.expense_units FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY eu_delete ON public.expense_units FOR DELETE TO authenticated USING (true);