
-- Helper macro pattern: drop existing public policy and recreate scoped to authenticated

-- boq_items
DROP POLICY IF EXISTS read_all_boq ON public.boq_items;
CREATE POLICY read_all_boq ON public.boq_items FOR SELECT TO authenticated USING (true);

-- material_receipts
DROP POLICY IF EXISTS read_all_mat ON public.material_receipts;
CREATE POLICY read_all_mat ON public.material_receipts FOR SELECT TO authenticated USING (true);

-- variations
DROP POLICY IF EXISTS read_all_var ON public.variations;
CREATE POLICY read_all_var ON public.variations FOR SELECT TO authenticated USING (true);

-- employees
DROP POLICY IF EXISTS emp_read_all ON public.employees;
CREATE POLICY emp_read_all ON public.employees FOR SELECT TO authenticated USING (true);

-- brigade_members
DROP POLICY IF EXISTS bm_read_all ON public.brigade_members;
CREATE POLICY bm_read_all ON public.brigade_members FOR SELECT TO authenticated USING (true);

-- supplier_contracts: scope all policies to authenticated
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='supplier_contracts' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.supplier_contracts', p.policyname);
  END LOOP;
END $$;
CREATE POLICY sc_select ON public.supplier_contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY sc_insert ON public.supplier_contracts FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY sc_update ON public.supplier_contracts FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY sc_delete ON public.supplier_contracts FOR DELETE TO authenticated USING (true);

-- projects
DROP POLICY IF EXISTS read_all_projects ON public.projects;
CREATE POLICY read_all_projects ON public.projects FOR SELECT TO authenticated USING (true);

-- project_zayavka writes
DROP POLICY IF EXISTS pz_write_all ON public.project_zayavka;
DROP POLICY IF EXISTS pz_update_all ON public.project_zayavka;
DROP POLICY IF EXISTS pz_delete_all ON public.project_zayavka;
CREATE POLICY pz_write_all ON public.project_zayavka FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY pz_update_all ON public.project_zayavka FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pz_delete_all ON public.project_zayavka FOR DELETE TO authenticated USING (true);

-- expense_categories writes
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='expense_categories' AND cmd <> 'SELECT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.expense_categories', p.policyname);
  END LOOP;
END $$;
CREATE POLICY ec_insert ON public.expense_categories FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY ec_update ON public.expense_categories FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY ec_delete ON public.expense_categories FOR DELETE TO authenticated USING (true);

-- bot_messages writes
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='bot_messages' AND cmd <> 'SELECT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.bot_messages', p.policyname);
  END LOOP;
END $$;
CREATE POLICY bm_insert ON public.bot_messages FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY bm_update ON public.bot_messages FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY bm_delete ON public.bot_messages FOR DELETE TO authenticated USING (true);

-- firms writes
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname, cmd FROM pg_policies WHERE schemaname='public' AND tablename='firms' AND cmd <> 'SELECT' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.firms', p.policyname);
  END LOOP;
END $$;
CREATE POLICY firms_insert ON public.firms FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY firms_update ON public.firms FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY firms_delete ON public.firms FOR DELETE TO authenticated USING (true);

-- work_progress
DROP POLICY IF EXISTS read_all_work ON public.work_progress;
CREATE POLICY read_all_work ON public.work_progress FOR SELECT TO authenticated USING (true);

-- purchase_order_items
DROP POLICY IF EXISTS read_all_poi ON public.purchase_order_items;
CREATE POLICY read_all_poi ON public.purchase_order_items FOR SELECT TO authenticated USING (true);

-- employee_payments: drop all and recreate authenticated-only
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='employee_payments' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.employee_payments', p.policyname);
  END LOOP;
END $$;
CREATE POLICY ep_select ON public.employee_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY ep_insert ON public.employee_payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY ep_update ON public.employee_payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY ep_delete ON public.employee_payments FOR DELETE TO authenticated USING (true);

-- purchase_orders writes
DROP POLICY IF EXISTS po_write_all ON public.purchase_orders;
DROP POLICY IF EXISTS po_update_all ON public.purchase_orders;
DROP POLICY IF EXISTS po_delete_all ON public.purchase_orders;
CREATE POLICY po_write_all ON public.purchase_orders FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY po_update_all ON public.purchase_orders FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY po_delete_all ON public.purchase_orders FOR DELETE TO authenticated USING (true);

-- po_payments
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='po_payments' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.po_payments', p.policyname);
  END LOOP;
END $$;
CREATE POLICY pop_select ON public.po_payments FOR SELECT TO authenticated USING (true);
CREATE POLICY pop_insert ON public.po_payments FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY pop_update ON public.po_payments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pop_delete ON public.po_payments FOR DELETE TO authenticated USING (true);

-- documents
DROP POLICY IF EXISTS read_all_docs ON public.documents;
CREATE POLICY read_all_docs ON public.documents FOR SELECT TO authenticated USING (true);

-- storage: procurement bucket write/update/delete to authenticated only
DROP POLICY IF EXISTS procurement_anyone_write ON storage.objects;
DROP POLICY IF EXISTS procurement_anyone_update ON storage.objects;
DROP POLICY IF EXISTS procurement_anyone_delete ON storage.objects;
CREATE POLICY procurement_anyone_write ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'procurement');
CREATE POLICY procurement_anyone_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'procurement') WITH CHECK (bucket_id = 'procurement');
CREATE POLICY procurement_anyone_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'procurement');
