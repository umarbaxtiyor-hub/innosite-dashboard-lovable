-- 1) profiles.is_active
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- 2) user_project_access
CREATE TABLE IF NOT EXISTS public.user_project_access (
  user_id uuid NOT NULL,
  project_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, project_id)
);
ALTER TABLE public.user_project_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "upa_admin_all" ON public.user_project_access
  FOR ALL TO public
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "upa_select_self_or_admin" ON public.user_project_access
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));

-- 3) user_firm_access
CREATE TABLE IF NOT EXISTS public.user_firm_access (
  user_id uuid NOT NULL,
  firm_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, firm_id)
);
ALTER TABLE public.user_firm_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ufa_admin_all" ON public.user_firm_access
  FOR ALL TO public
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "ufa_select_self_or_admin" ON public.user_firm_access
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::app_role));