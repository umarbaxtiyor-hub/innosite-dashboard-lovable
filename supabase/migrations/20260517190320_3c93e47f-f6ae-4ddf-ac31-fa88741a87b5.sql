
-- 1) FIX: Security Definer Views → recreate with security_invoker=true
ALTER VIEW public.warehouse_balance SET (security_invoker = true);
ALTER VIEW public.v_master_zayavka_remaining SET (security_invoker = true);

-- 2) FIX: Function search_path mutable
ALTER FUNCTION public.tg_recompute_zayavka_from_receipt() SET search_path = public;
ALTER FUNCTION public.tg_recompute_zayavka_from_work() SET search_path = public;

-- 3) FIX: RLS "Always True" — write policies endi faqat ro'yxatdan o'tgan foydalanuvchilar uchun
-- audit_log INSERT — trigger ishlatadi, qoldiramiz

-- bot_messages
DROP POLICY IF EXISTS bm_insert ON public.bot_messages;
DROP POLICY IF EXISTS bm_update ON public.bot_messages;
DROP POLICY IF EXISTS bm_delete ON public.bot_messages;
CREATE POLICY bm_insert ON public.bot_messages FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY bm_update ON public.bot_messages FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY bm_delete ON public.bot_messages FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- brigade_members
DROP POLICY IF EXISTS bm_write_all ON public.brigade_members;
DROP POLICY IF EXISTS bm_update_all ON public.brigade_members;
DROP POLICY IF EXISTS bm_delete_all ON public.brigade_members;
CREATE POLICY bm_write_all ON public.brigade_members FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY bm_update_all ON public.brigade_members FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY bm_delete_all ON public.brigade_members FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- employee_attendance (telegram bot ham yozadi — service_role baribir RLS chetlab o'tadi)
DROP POLICY IF EXISTS att_insert_all ON public.employee_attendance;
DROP POLICY IF EXISTS att_update_all ON public.employee_attendance;
DROP POLICY IF EXISTS att_delete_all ON public.employee_attendance;
CREATE POLICY att_insert_all ON public.employee_attendance FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY att_update_all ON public.employee_attendance FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY att_delete_all ON public.employee_attendance FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- employee_payments
DROP POLICY IF EXISTS ep_insert ON public.employee_payments;
DROP POLICY IF EXISTS ep_update ON public.employee_payments;
DROP POLICY IF EXISTS ep_delete ON public.employee_payments;
CREATE POLICY ep_insert ON public.employee_payments FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY ep_update ON public.employee_payments FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY ep_delete ON public.employee_payments FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- employees
DROP POLICY IF EXISTS emp_write_all ON public.employees;
DROP POLICY IF EXISTS emp_update_all ON public.employees;
DROP POLICY IF EXISTS emp_delete_all ON public.employees;
CREATE POLICY emp_write_all ON public.employees FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY emp_update_all ON public.employees FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY emp_delete_all ON public.employees FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- expense_categories
DROP POLICY IF EXISTS ec_insert ON public.expense_categories;
DROP POLICY IF EXISTS ec_update ON public.expense_categories;
DROP POLICY IF EXISTS ec_delete ON public.expense_categories;
CREATE POLICY ec_insert ON public.expense_categories FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY ec_update ON public.expense_categories FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY ec_delete ON public.expense_categories FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- expense_units
DROP POLICY IF EXISTS eu_insert ON public.expense_units;
DROP POLICY IF EXISTS eu_update ON public.expense_units;
DROP POLICY IF EXISTS eu_delete ON public.expense_units;
CREATE POLICY eu_insert ON public.expense_units FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY eu_update ON public.expense_units FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY eu_delete ON public.expense_units FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- expenses
DROP POLICY IF EXISTS exp_write_all ON public.expenses;
DROP POLICY IF EXISTS exp_update_all ON public.expenses;
DROP POLICY IF EXISTS exp_delete_all ON public.expenses;
CREATE POLICY exp_write_all ON public.expenses FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY exp_update_all ON public.expenses FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY exp_delete_all ON public.expenses FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- firms
DROP POLICY IF EXISTS firms_insert ON public.firms;
DROP POLICY IF EXISTS firms_update ON public.firms;
DROP POLICY IF EXISTS firms_delete ON public.firms;
CREATE POLICY firms_insert ON public.firms FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY firms_update ON public.firms FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY firms_delete ON public.firms FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- incomes
DROP POLICY IF EXISTS inc_insert_all ON public.incomes;
DROP POLICY IF EXISTS inc_update_all ON public.incomes;
DROP POLICY IF EXISTS inc_delete_all ON public.incomes;
CREATE POLICY inc_insert_all ON public.incomes FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY inc_update_all ON public.incomes FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY inc_delete_all ON public.incomes FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- material_receipts
DROP POLICY IF EXISTS mr_write_all ON public.material_receipts;
DROP POLICY IF EXISTS mr_update_all ON public.material_receipts;
DROP POLICY IF EXISTS mr_delete_all ON public.material_receipts;
CREATE POLICY mr_write_all ON public.material_receipts FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY mr_update_all ON public.material_receipts FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY mr_delete_all ON public.material_receipts FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- project_zayavka
DROP POLICY IF EXISTS pz_insert_anyone ON public.project_zayavka;
DROP POLICY IF EXISTS pz_update_anyone ON public.project_zayavka;
DROP POLICY IF EXISTS pz_delete_anyone ON public.project_zayavka;
CREATE POLICY pz_insert_anyone ON public.project_zayavka FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY pz_update_anyone ON public.project_zayavka FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY pz_delete_anyone ON public.project_zayavka FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- project_zayavka_items
DROP POLICY IF EXISTS pzi_insert_all ON public.project_zayavka_items;
DROP POLICY IF EXISTS pzi_update_all ON public.project_zayavka_items;
DROP POLICY IF EXISTS pzi_delete_all ON public.project_zayavka_items;
CREATE POLICY pzi_insert_all ON public.project_zayavka_items FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY pzi_update_all ON public.project_zayavka_items FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY pzi_delete_all ON public.project_zayavka_items FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- supplier_contracts
DROP POLICY IF EXISTS sc_insert ON public.supplier_contracts;
DROP POLICY IF EXISTS sc_update ON public.supplier_contracts;
DROP POLICY IF EXISTS sc_delete ON public.supplier_contracts;
CREATE POLICY sc_insert ON public.supplier_contracts FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY sc_update ON public.supplier_contracts FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY sc_delete ON public.supplier_contracts FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- work_plans
DROP POLICY IF EXISTS wp_insert_all ON public.work_plans;
DROP POLICY IF EXISTS wp_update_all ON public.work_plans;
DROP POLICY IF EXISTS wp_delete_all ON public.work_plans;
CREATE POLICY wp_insert_all ON public.work_plans FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY wp_update_all ON public.work_plans FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL);
CREATE POLICY wp_delete_all ON public.work_plans FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);

-- work_progress
DROP POLICY IF EXISTS wp_insert_all ON public.work_progress;
DROP POLICY IF EXISTS wp_update_all ON public.work_progress;
DROP POLICY IF EXISTS wp_delete_all ON public.work_progress;
CREATE POLICY wpg_insert_all ON public.work_progress FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY wpg_update_all ON public.work_progress FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY wpg_delete_all ON public.work_progress FOR DELETE TO authenticated USING (auth.uid() IS NOT NULL);
