-- Kirim (income) jadvali
CREATE TABLE IF NOT EXISTS public.incomes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid,
  amount numeric NOT NULL,
  payment_method text NOT NULL DEFAULT 'Naqd',
  category text NOT NULL DEFAULT 'Kirim',
  description text,
  payer text,
  income_date date NOT NULL DEFAULT CURRENT_DATE,
  source text,
  source_note text,
  created_by uuid,
  telegram_user_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.incomes ENABLE ROW LEVEL SECURITY;

CREATE POLICY inc_read_all ON public.incomes FOR SELECT USING (true);
CREATE POLICY inc_insert_all ON public.incomes FOR INSERT WITH CHECK (true);
CREATE POLICY inc_update_all ON public.incomes FOR UPDATE USING (true);
CREATE POLICY inc_delete_all ON public.incomes FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS incomes_project_idx ON public.incomes(project_id);
CREATE INDEX IF NOT EXISTS incomes_date_idx ON public.incomes(income_date);