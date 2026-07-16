
-- Allow public (anon) read access on dashboard tables
DROP POLICY IF EXISTS read_all_projects ON public.projects;
CREATE POLICY read_all_projects ON public.projects FOR SELECT USING (true);

DROP POLICY IF EXISTS read_all_boq ON public.boq_items;
CREATE POLICY read_all_boq ON public.boq_items FOR SELECT USING (true);

DROP POLICY IF EXISTS read_all_mat ON public.material_receipts;
CREATE POLICY read_all_mat ON public.material_receipts FOR SELECT USING (true);

DROP POLICY IF EXISTS read_all_work ON public.work_progress;
CREATE POLICY read_all_work ON public.work_progress FOR SELECT USING (true);

DROP POLICY IF EXISTS exp_select_authenticated ON public.expenses;
CREATE POLICY exp_select_all ON public.expenses FOR SELECT USING (true);

DROP POLICY IF EXISTS read_all_var ON public.variations;
CREATE POLICY read_all_var ON public.variations FOR SELECT USING (true);

-- Also open related tables that the dashboard/views may read
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY['suppliers','project_zayavka','purchase_orders','employees','brigades','employee_payments','brigade_payments']) LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('DROP POLICY IF EXISTS public_read ON public.%I', t);
      EXECUTE format('CREATE POLICY public_read ON public.%I FOR SELECT USING (true)', t);
    END IF;
  END LOOP;
END $$;
