CREATE INDEX IF NOT EXISTS idx_incomes_project_date ON public.incomes (project_id, income_date);
CREATE INDEX IF NOT EXISTS idx_exp_project_category ON public.expenses (project_id, category);