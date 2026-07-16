
CREATE POLICY "wp_insert_all" ON public.work_progress FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "wp_update_all" ON public.work_progress FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "wp_delete_all" ON public.work_progress FOR DELETE TO public USING (true);
