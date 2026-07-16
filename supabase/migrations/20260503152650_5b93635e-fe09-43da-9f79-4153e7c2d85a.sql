
-- Master materials catalog
CREATE TABLE public.master_materials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit text NOT NULL,
  aliases text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.master_materials ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_all_mm ON public.master_materials FOR SELECT USING (true);
CREATE POLICY admin_all_mm ON public.master_materials FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Master works catalog
CREATE TABLE public.master_works (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  unit text NOT NULL,
  aliases text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.master_works ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_all_mw ON public.master_works FOR SELECT USING (true);
CREATE POLICY admin_all_mw ON public.master_works FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Link master catalog to records
ALTER TABLE public.material_receipts ADD COLUMN IF NOT EXISTS master_material_id uuid;
ALTER TABLE public.work_progress ADD COLUMN IF NOT EXISTS master_work_id uuid;

-- Seed a few common items so AI has something to match
INSERT INTO public.master_materials (name, unit, aliases) VALUES
  ('Sement M400', 'qop', ARRAY['sement','cement','tsement']),
  ('G''isht', 'dona', ARRAY['kirpich','gisht']),
  ('Qum', 'm3', ARRAY['pesok']),
  ('Shag''al', 'm3', ARRAY['shebenka','shagal']),
  ('Armatura 12mm', 'tonna', ARRAY['armatur','arm']),
  ('Beton M300', 'm3', ARRAY['beton'])
ON CONFLICT DO NOTHING;

INSERT INTO public.master_works (name, unit, aliases) VALUES
  ('Devor terish', 'm2', ARRAY['kladka','devor']),
  ('Suvoq', 'm2', ARRAY['shtukaturka','suvoq']),
  ('Beton quyish', 'm3', ARRAY['beton quy','zalivka']),
  ('Pol qoplash', 'm2', ARRAY['pol','styajka']),
  ('Bo''yoq', 'm2', ARRAY['pakraska','boyoq'])
ON CONFLICT DO NOTHING;
