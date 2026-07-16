DROP POLICY IF EXISTS pz_write_all ON public.project_zayavka;
DROP POLICY IF EXISTS pz_update_all ON public.project_zayavka;
DROP POLICY IF EXISTS pz_delete_all ON public.project_zayavka;

CREATE POLICY pz_insert_authed ON public.project_zayavka
  FOR INSERT TO public
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY pz_update_authed ON public.project_zayavka
  FOR UPDATE TO public
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY pz_delete_authed ON public.project_zayavka
  FOR DELETE TO public
  USING (auth.uid() IS NOT NULL);