
-- App settings (key/value)
CREATE TABLE IF NOT EXISTS public.app_settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY app_settings_read_all ON public.app_settings FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY app_settings_admin_all ON public.app_settings FOR ALL
    USING (has_role(auth.uid(), 'admin'::app_role))
    WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Projects: PM/Prorab names
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS pm_name text,
  ADD COLUMN IF NOT EXISTS prorab_name text;

-- Zayavka header: per-project number
ALTER TABLE public.project_zayavka
  ADD COLUMN IF NOT EXISTS zayavka_no integer;

CREATE INDEX IF NOT EXISTS idx_pz_project_zayavka_no
  ON public.project_zayavka (project_id, zayavka_no);

-- Items
CREATE TABLE IF NOT EXISTS public.project_zayavka_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zayavka_id uuid NOT NULL REFERENCES public.project_zayavka(id) ON DELETE CASCADE,
  line_no integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  unit text NOT NULL DEFAULT 'dona',
  qty numeric NOT NULL DEFAULT 0,
  location text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pzi_zayavka ON public.project_zayavka_items(zayavka_id);
ALTER TABLE public.project_zayavka_items ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY pzi_read_all ON public.project_zayavka_items FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY pzi_insert_all ON public.project_zayavka_items FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY pzi_update_all ON public.project_zayavka_items FOR UPDATE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY pzi_delete_all ON public.project_zayavka_items FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
