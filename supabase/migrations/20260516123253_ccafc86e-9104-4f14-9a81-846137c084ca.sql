CREATE TABLE public.work_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  period text NOT NULL DEFAULT 'today' CHECK (period IN ('today','tomorrow','week','month','custom')),
  plan_date date NOT NULL DEFAULT CURRENT_DATE,
  date_from date,
  date_to date,
  source text DEFAULT 'web' CHECK (source IN ('web','telegram_text','telegram_voice','telegram_photo')),
  raw_text text,
  image_url text,
  items jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_analysis jsonb,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','edited','cancelled','done')),
  notes text,
  created_by uuid,
  telegram_user_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_work_plans_project_date ON public.work_plans(project_id, plan_date DESC);
CREATE INDEX idx_work_plans_status ON public.work_plans(status);

ALTER TABLE public.work_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY wp_select_all ON public.work_plans FOR SELECT USING (true);
CREATE POLICY wp_insert_all ON public.work_plans FOR INSERT WITH CHECK (true);
CREATE POLICY wp_update_all ON public.work_plans FOR UPDATE USING (true);
CREATE POLICY wp_delete_all ON public.work_plans FOR DELETE USING (true);

CREATE TRIGGER trg_work_plans_updated_at
  BEFORE UPDATE ON public.work_plans
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();