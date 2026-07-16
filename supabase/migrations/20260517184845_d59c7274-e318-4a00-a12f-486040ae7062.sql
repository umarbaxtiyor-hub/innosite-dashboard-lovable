-- Role x Path ruxsat matritsasi
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role public.app_role NOT NULL,
  path text NOT NULL,
  PRIMARY KEY (role, path)
);

ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rp_read_authenticated ON public.role_permissions;
CREATE POLICY rp_read_authenticated ON public.role_permissions
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS rp_admin_all ON public.role_permissions;
CREATE POLICY rp_admin_all ON public.role_permissions
  FOR ALL TO public
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- Default matritsa (faqat jadval bo'sh bo'lsa)
INSERT INTO public.role_permissions (role, path)
SELECT r::public.app_role, p
FROM (VALUES
  -- /
  ('admin','/'),('ceo','/'),('direktor','/'),('finans','/'),('buxgalter','/'),
  ('pm','/'),('prorab','/'),('taminotchi','/'),('omborchi','/'),('kuzatuvchi','/'),
  -- /projects
  ('admin','/projects'),('ceo','/projects'),('direktor','/projects'),('finans','/projects'),('pm','/projects'),('kuzatuvchi','/projects'),
  -- /master-zayavka
  ('admin','/master-zayavka'),('ceo','/master-zayavka'),('direktor','/master-zayavka'),('pm','/master-zayavka'),('taminotchi','/master-zayavka'),('kuzatuvchi','/master-zayavka'),
  -- /master-jadval
  ('admin','/master-jadval'),('ceo','/master-jadval'),('direktor','/master-jadval'),('pm','/master-jadval'),('prorab','/master-jadval'),('kuzatuvchi','/master-jadval'),
  -- /ish-rejasi
  ('admin','/ish-rejasi'),('ceo','/ish-rejasi'),('direktor','/ish-rejasi'),('pm','/ish-rejasi'),('prorab','/ish-rejasi'),
  -- /taminot
  ('admin','/taminot'),('ceo','/taminot'),('direktor','/taminot'),('pm','/taminot'),('taminotchi','/taminot'),('omborchi','/taminot'),
  -- /buxalteriya
  ('admin','/buxalteriya'),('ceo','/buxalteriya'),('direktor','/buxalteriya'),('finans','/buxalteriya'),('buxgalter','/buxalteriya'),
  -- /brigade-balance
  ('admin','/brigade-balance'),('ceo','/brigade-balance'),('direktor','/brigade-balance'),('finans','/brigade-balance'),('buxgalter','/brigade-balance'),('pm','/brigade-balance'),('prorab','/brigade-balance'),
  -- /davomat
  ('admin','/davomat'),('ceo','/davomat'),('direktor','/davomat'),('pm','/davomat'),('prorab','/davomat'),
  -- /variations
  ('admin','/variations'),('ceo','/variations'),('direktor','/variations'),('pm','/variations'),
  -- /audit-log
  ('admin','/audit-log'),('ceo','/audit-log'),('direktor','/audit-log'),
  -- /ai-agent
  ('admin','/ai-agent'),('ceo','/ai-agent'),('direktor','/ai-agent'),('pm','/ai-agent'),
  -- /settings
  ('admin','/settings')
) AS t(r,p)
WHERE NOT EXISTS (SELECT 1 FROM public.role_permissions);