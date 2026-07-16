-- =========================================================================
-- 1) Tables with overlapping public_read policies — just DROP the public one
-- =========================================================================
DROP POLICY IF EXISTS public_read ON public.employees;
DROP POLICY IF EXISTS public_read ON public.employee_payments;
DROP POLICY IF EXISTS public_read ON public.brigade_payments;
DROP POLICY IF EXISTS public_read ON public.brigades;
DROP POLICY IF EXISTS public_read ON public.suppliers;
DROP POLICY IF EXISTS public_read ON public.project_zayavka;
DROP POLICY IF EXISTS read_all_zayavka ON public.project_zayavka;
DROP POLICY IF EXISTS read_all_brigades ON public.brigades;

-- =========================================================================
-- 2) Tables where the only SELECT policy is public — recreate as authenticated
-- =========================================================================

-- incomes
DROP POLICY IF EXISTS inc_read_all ON public.incomes;
CREATE POLICY inc_read_all ON public.incomes
  FOR SELECT TO authenticated USING (true);

-- expenses
DROP POLICY IF EXISTS exp_select_all ON public.expenses;
CREATE POLICY exp_select_all ON public.expenses
  FOR SELECT TO authenticated USING (true);

-- employee_attendance
DROP POLICY IF EXISTS att_read_all ON public.employee_attendance;
CREATE POLICY att_read_all ON public.employee_attendance
  FOR SELECT TO authenticated USING (true);

-- zayavka_status_log
DROP POLICY IF EXISTS zsl_read_all ON public.zayavka_status_log;
CREATE POLICY zsl_read_all ON public.zayavka_status_log
  FOR SELECT TO authenticated USING (true);

-- material_receipts
DROP POLICY IF EXISTS read_all_mat ON public.material_receipts;
CREATE POLICY read_all_mat ON public.material_receipts
  FOR SELECT TO authenticated USING (true);

-- variations
DROP POLICY IF EXISTS read_all_var ON public.variations;
CREATE POLICY read_all_var ON public.variations
  FOR SELECT TO authenticated USING (true);

-- work_progress
DROP POLICY IF EXISTS read_all_work ON public.work_progress;
CREATE POLICY read_all_work ON public.work_progress
  FOR SELECT TO authenticated USING (true);

-- work_plans
DROP POLICY IF EXISTS wp_select_all ON public.work_plans;
CREATE POLICY wp_select_all ON public.work_plans
  FOR SELECT TO authenticated USING (true);

-- project_zayavka — add a single authenticated SELECT
CREATE POLICY pz_select_authenticated ON public.project_zayavka
  FOR SELECT TO authenticated USING (true);

-- =========================================================================
-- 3) Lower-risk business tables — also restrict public reads
-- =========================================================================

DROP POLICY IF EXISTS read_all_firms ON public.firms;
CREATE POLICY firms_select_authenticated ON public.firms
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS read_all_boq ON public.boq_items;
CREATE POLICY boq_select_authenticated ON public.boq_items
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS read_all_projects ON public.projects;
CREATE POLICY projects_select_authenticated ON public.projects
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS pzi_read_all ON public.project_zayavka_items;
CREATE POLICY pzi_read_all ON public.project_zayavka_items
  FOR SELECT TO authenticated USING (true);

-- =========================================================================
-- 4) Storage: nakladnoy bucket — restrict writes to authenticated
-- =========================================================================
DROP POLICY IF EXISTS nakladnoy_insert_all ON storage.objects;
DROP POLICY IF EXISTS nakladnoy_update_all ON storage.objects;
DROP POLICY IF EXISTS nakladnoy_delete_all ON storage.objects;

CREATE POLICY nakladnoy_insert_auth ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'nakladnoy');

CREATE POLICY nakladnoy_update_auth ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'nakladnoy')
  WITH CHECK (bucket_id = 'nakladnoy');

CREATE POLICY nakladnoy_delete_auth ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'nakladnoy');

-- =========================================================================
-- 5) Storage: telegram-files bucket — restrict reads to authenticated
-- =========================================================================
DROP POLICY IF EXISTS tg_files_read ON storage.objects;
CREATE POLICY tg_files_read_auth ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'telegram-files');
