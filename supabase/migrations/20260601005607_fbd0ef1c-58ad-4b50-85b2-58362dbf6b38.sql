-- Material chiqim (ombordan ishlatilgan material) jadvali
CREATE TABLE public.material_usage (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL,
  material_name text NOT NULL,
  master_material_id uuid,
  unit text,
  qty numeric NOT NULL DEFAULT 0,
  unit_price numeric DEFAULT 0,
  boq_code text,
  boq_item_id uuid,
  zayavka_id uuid,
  used_for text,
  brigade_id uuid,
  brigade_name text,
  note text,
  used_at date NOT NULL DEFAULT CURRENT_DATE,
  created_by uuid,
  telegram_user_id bigint,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.material_usage TO authenticated;
GRANT ALL ON public.material_usage TO service_role;

ALTER TABLE public.material_usage ENABLE ROW LEVEL SECURITY;

CREATE POLICY mu_select_all ON public.material_usage FOR SELECT TO authenticated USING (true);
CREATE POLICY mu_insert_all ON public.material_usage FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY mu_update_all ON public.material_usage FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY mu_delete_all ON public.material_usage FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_material_usage_project ON public.material_usage(project_id);
CREATE INDEX idx_material_usage_name ON public.material_usage(material_name);
CREATE INDEX idx_material_usage_date ON public.material_usage(used_at DESC);
