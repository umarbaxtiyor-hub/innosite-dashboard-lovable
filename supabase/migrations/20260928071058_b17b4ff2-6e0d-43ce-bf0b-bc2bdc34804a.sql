CREATE OR REPLACE FUNCTION public.has_any_role(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id)
$$;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_any_role(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS read_all_mm ON public.master_materials;
CREATE POLICY read_all_mm ON public.master_materials FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS read_all_mw ON public.master_works;
CREATE POLICY read_all_mw ON public.master_works FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS eu_read_auth ON public.expense_units;
CREATE POLICY eu_read_auth ON public.expense_units FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS ec_read_auth ON public.expense_categories;
CREATE POLICY ec_read_auth ON public.expense_categories FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS bmsg_read_authenticated ON public.bot_messages;
CREATE POLICY bmsg_read_authenticated ON public.bot_messages FOR SELECT TO authenticated USING (public.has_any_role(auth.uid()));
DROP POLICY IF EXISTS app_settings_read_auth ON public.app_settings;
CREATE POLICY app_settings_read_auth ON public.app_settings FOR SELECT TO authenticated USING (
  (key IN ('work_start_time','lateness_grace_min') AND public.has_any_role(auth.uid()))
  OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans')
);