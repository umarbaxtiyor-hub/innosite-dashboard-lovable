
-- Restrict SELECT on sensitive tables to authenticated users (or admins for roles/profiles)

-- profiles: only the row owner or admins
DROP POLICY IF EXISTS read_all_profiles ON public.profiles;
CREATE POLICY profiles_select_self_or_admin ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id OR has_role(auth.uid(), 'admin'::app_role));

-- user_roles: only own rows or admins
DROP POLICY IF EXISTS read_all_roles ON public.user_roles;
CREATE POLICY user_roles_select_self_or_admin ON public.user_roles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- suppliers: authenticated only
DROP POLICY IF EXISTS read_all_suppliers ON public.suppliers;
CREATE POLICY suppliers_select_authenticated ON public.suppliers
  FOR SELECT TO authenticated USING (true);

-- brigade_payments: authenticated only
DROP POLICY IF EXISTS read_all_bp ON public.brigade_payments;
CREATE POLICY bp_select_authenticated ON public.brigade_payments
  FOR SELECT TO authenticated USING (true);

-- expenses: authenticated only
DROP POLICY IF EXISTS read_all_exp ON public.expenses;
CREATE POLICY exp_select_authenticated ON public.expenses
  FOR SELECT TO authenticated USING (true);

-- Storage: telegram-files bucket — restrict writes to authenticated users
DROP POLICY IF EXISTS tg_files_write ON storage.objects;
CREATE POLICY tg_files_insert_authenticated ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'telegram-files');

CREATE POLICY tg_files_update_authenticated ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'telegram-files' AND (owner = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)));

CREATE POLICY tg_files_delete_authenticated ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'telegram-files' AND (owner = auth.uid() OR has_role(auth.uid(), 'admin'::app_role)));
