DROP POLICY IF EXISTS pz_insert_authed ON public.project_zayavka;
DROP POLICY IF EXISTS pz_update_authed ON public.project_zayavka;
DROP POLICY IF EXISTS pz_delete_authed ON public.project_zayavka;

CREATE POLICY pz_insert_anyone ON public.project_zayavka FOR INSERT TO public WITH CHECK (true);
CREATE POLICY pz_update_anyone ON public.project_zayavka FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY pz_delete_anyone ON public.project_zayavka FOR DELETE TO public USING (true);