-- Master zayavka (project budget = chegara): kind = material/work/equipment
CREATE TYPE public.zayavka_kind AS ENUM ('material','work','equipment');
CREATE TYPE public.zayavka_status AS ENUM ('approved','pending');

CREATE TABLE public.project_zayavka (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  kind public.zayavka_kind NOT NULL,
  master_material_id uuid REFERENCES public.master_materials(id) ON DELETE SET NULL,
  master_work_id uuid REFERENCES public.master_works(id) ON DELETE SET NULL,
  name text NOT NULL,
  unit text NOT NULL,
  qty numeric NOT NULL DEFAULT 0,
  unit_price numeric NOT NULL DEFAULT 0,
  total numeric GENERATED ALWAYS AS (qty * unit_price) STORED,
  status public.zayavka_status NOT NULL DEFAULT 'approved',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_zayavka_project ON public.project_zayavka(project_id);
CREATE INDEX idx_zayavka_kind ON public.project_zayavka(kind);

ALTER TABLE public.project_zayavka ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read_all_zayavka" ON public.project_zayavka FOR SELECT USING (true);
CREATE POLICY "admin_all_zayavka" ON public.project_zayavka FOR ALL
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Brigada va ish turi uchun qo'shimcha izohlar
ALTER TABLE public.brigades ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE public.master_works ADD COLUMN IF NOT EXISTS notes text;