
-- Helper: role groups used in policies
-- Finance-tier roles (money movement): admin, ceo, direktor, finans, buxgalter, pm
-- Ops-tier roles (project execution incl. finance): admin, pm, project_manager, prorab, foreman, snabjenec, taminotchi, omborchi, storekeeper, ceo, direktor, finans, buxgalter

-- ============================================================
-- brigade_payments: add finance-scoped write policies
-- ============================================================
DROP POLICY IF EXISTS bp_insert_finance ON public.brigade_payments;
DROP POLICY IF EXISTS bp_update_finance ON public.brigade_payments;
DROP POLICY IF EXISTS bp_delete_finance ON public.brigade_payments;

CREATE POLICY bp_insert_finance ON public.brigade_payments
FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm')
);
CREATE POLICY bp_update_finance ON public.brigade_payments
FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm')
);
CREATE POLICY bp_delete_finance ON public.brigade_payments
FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm')
);

-- ============================================================
-- expenses: replace broad policies with finance-scoped ones
-- ============================================================
DROP POLICY IF EXISTS exp_select_all ON public.expenses;
DROP POLICY IF EXISTS exp_write_all  ON public.expenses;
DROP POLICY IF EXISTS exp_update_all ON public.expenses;
DROP POLICY IF EXISTS exp_delete_all ON public.expenses;

CREATE POLICY exp_select_finance ON public.expenses
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager')
);
CREATE POLICY exp_insert_finance ON public.expenses
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager')
);
CREATE POLICY exp_update_finance ON public.expenses
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm')
);
CREATE POLICY exp_delete_finance ON public.expenses
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter')
);

-- ============================================================
-- material_receipts: replace broad policies with role-scoped ones
-- ============================================================
DROP POLICY IF EXISTS read_all_mat  ON public.material_receipts;
DROP POLICY IF EXISTS mr_write_all  ON public.material_receipts;
DROP POLICY IF EXISTS mr_update_all ON public.material_receipts;
DROP POLICY IF EXISTS mr_delete_all ON public.material_receipts;

CREATE POLICY mr_select_scoped ON public.material_receipts
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'foreman') OR public.has_role(auth.uid(), 'snabjenec') OR
  public.has_role(auth.uid(), 'taminotchi') OR public.has_role(auth.uid(), 'omborchi') OR
  public.has_role(auth.uid(), 'storekeeper')
);
CREATE POLICY mr_insert_scoped ON public.material_receipts
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'foreman') OR public.has_role(auth.uid(), 'snabjenec') OR
  public.has_role(auth.uid(), 'taminotchi') OR public.has_role(auth.uid(), 'omborchi') OR
  public.has_role(auth.uid(), 'storekeeper') OR public.has_role(auth.uid(), 'buxgalter')
);
CREATE POLICY mr_update_scoped ON public.material_receipts
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'snabjenec') OR public.has_role(auth.uid(), 'taminotchi') OR
  public.has_role(auth.uid(), 'omborchi') OR public.has_role(auth.uid(), 'storekeeper') OR
  public.has_role(auth.uid(), 'buxgalter')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'snabjenec') OR public.has_role(auth.uid(), 'taminotchi') OR
  public.has_role(auth.uid(), 'omborchi') OR public.has_role(auth.uid(), 'storekeeper') OR
  public.has_role(auth.uid(), 'buxgalter')
);
CREATE POLICY mr_delete_scoped ON public.material_receipts
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager')
);

-- ============================================================
-- material_usage
-- ============================================================
DROP POLICY IF EXISTS mu_select_all  ON public.material_usage;
DROP POLICY IF EXISTS mu_insert_all  ON public.material_usage;
DROP POLICY IF EXISTS mu_update_all  ON public.material_usage;
DROP POLICY IF EXISTS mu_delete_all  ON public.material_usage;

CREATE POLICY mu_select_scoped ON public.material_usage
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'foreman') OR public.has_role(auth.uid(), 'snabjenec') OR
  public.has_role(auth.uid(), 'taminotchi') OR public.has_role(auth.uid(), 'omborchi') OR
  public.has_role(auth.uid(), 'storekeeper')
);
CREATE POLICY mu_insert_scoped ON public.material_usage
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'foreman') OR public.has_role(auth.uid(), 'omborchi') OR
  public.has_role(auth.uid(), 'storekeeper')
);
CREATE POLICY mu_update_scoped ON public.material_usage
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'omborchi') OR public.has_role(auth.uid(), 'storekeeper')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'omborchi') OR public.has_role(auth.uid(), 'storekeeper')
);
CREATE POLICY mu_delete_scoped ON public.material_usage
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager')
);

-- ============================================================
-- supplier_contracts
-- ============================================================
DROP POLICY IF EXISTS sc_select ON public.supplier_contracts;
DROP POLICY IF EXISTS sc_insert ON public.supplier_contracts;
DROP POLICY IF EXISTS sc_update ON public.supplier_contracts;
DROP POLICY IF EXISTS sc_delete ON public.supplier_contracts;

CREATE POLICY sc_select_scoped ON public.supplier_contracts
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'snabjenec') OR
  public.has_role(auth.uid(), 'taminotchi')
);
CREATE POLICY sc_insert_scoped ON public.supplier_contracts
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm')
);
CREATE POLICY sc_update_scoped ON public.supplier_contracts
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm')
);
CREATE POLICY sc_delete_scoped ON public.supplier_contracts
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor')
);

-- ============================================================
-- work_progress
-- ============================================================
DROP POLICY IF EXISTS read_all_work  ON public.work_progress;
DROP POLICY IF EXISTS wpg_insert_all ON public.work_progress;
DROP POLICY IF EXISTS wpg_update_all ON public.work_progress;
DROP POLICY IF EXISTS wpg_delete_all ON public.work_progress;

CREATE POLICY wpg_select_scoped ON public.work_progress
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'foreman') OR public.has_role(auth.uid(), 'kuzatuvchi')
);
CREATE POLICY wpg_insert_scoped ON public.work_progress
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'foreman')
);
CREATE POLICY wpg_update_scoped ON public.work_progress
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'foreman')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'foreman')
);
CREATE POLICY wpg_delete_scoped ON public.work_progress
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager')
);

-- ============================================================
-- project_zayavka
-- ============================================================
DROP POLICY IF EXISTS pz_select_authenticated ON public.project_zayavka;
DROP POLICY IF EXISTS pz_insert_anyone         ON public.project_zayavka;
DROP POLICY IF EXISTS pz_update_anyone         ON public.project_zayavka;
DROP POLICY IF EXISTS pz_delete_anyone         ON public.project_zayavka;

CREATE POLICY pz_select_scoped ON public.project_zayavka
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'foreman') OR public.has_role(auth.uid(), 'snabjenec') OR
  public.has_role(auth.uid(), 'taminotchi') OR public.has_role(auth.uid(), 'omborchi') OR
  public.has_role(auth.uid(), 'storekeeper') OR public.has_role(auth.uid(), 'kuzatuvchi')
);
CREATE POLICY pz_insert_scoped ON public.project_zayavka
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'foreman') OR public.has_role(auth.uid(), 'snabjenec') OR
  public.has_role(auth.uid(), 'taminotchi') OR public.has_role(auth.uid(), 'omborchi') OR
  public.has_role(auth.uid(), 'storekeeper')
);
CREATE POLICY pz_update_scoped ON public.project_zayavka
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'snabjenec') OR public.has_role(auth.uid(), 'taminotchi') OR
  public.has_role(auth.uid(), 'omborchi') OR public.has_role(auth.uid(), 'storekeeper') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'finans')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'snabjenec') OR public.has_role(auth.uid(), 'taminotchi') OR
  public.has_role(auth.uid(), 'omborchi') OR public.has_role(auth.uid(), 'storekeeper') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'finans')
);
CREATE POLICY pz_delete_scoped ON public.project_zayavka
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager')
);

-- ============================================================
-- employee_attendance
-- ============================================================
DROP POLICY IF EXISTS att_read_all   ON public.employee_attendance;
DROP POLICY IF EXISTS att_insert_all ON public.employee_attendance;
DROP POLICY IF EXISTS att_update_all ON public.employee_attendance;
DROP POLICY IF EXISTS att_delete_all ON public.employee_attendance;

CREATE POLICY att_select_scoped ON public.employee_attendance
FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'ceo') OR
  public.has_role(auth.uid(), 'direktor') OR public.has_role(auth.uid(), 'finans') OR
  public.has_role(auth.uid(), 'buxgalter') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'foreman') OR public.has_role(auth.uid(), 'kuzatuvchi')
);
CREATE POLICY att_insert_scoped ON public.employee_attendance
FOR INSERT TO authenticated WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'foreman')
);
CREATE POLICY att_update_scoped ON public.employee_attendance
FOR UPDATE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'foreman')
) WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager') OR public.has_role(auth.uid(), 'prorab') OR
  public.has_role(auth.uid(), 'foreman')
);
CREATE POLICY att_delete_scoped ON public.employee_attendance
FOR DELETE TO authenticated USING (
  public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'pm') OR
  public.has_role(auth.uid(), 'project_manager')
);

-- ============================================================
-- Storage: restrict procurement/nakladnoy update/delete to owner or admin
-- ============================================================
DROP POLICY IF EXISTS procurement_anyone_write         ON storage.objects;
DROP POLICY IF EXISTS procurement_anyone_update        ON storage.objects;
DROP POLICY IF EXISTS procurement_anyone_delete        ON storage.objects;
DROP POLICY IF EXISTS nakladnoy_insert_auth            ON storage.objects;
DROP POLICY IF EXISTS nakladnoy_update_auth            ON storage.objects;
DROP POLICY IF EXISTS nakladnoy_delete_auth            ON storage.objects;
DROP POLICY IF EXISTS telegram_files_authenticated_all ON storage.objects;

CREATE POLICY procurement_insert_auth ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'procurement' AND owner = auth.uid());

CREATE POLICY procurement_update_owner ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'procurement' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')))
WITH CHECK (bucket_id = 'procurement' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY procurement_delete_owner ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'procurement' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY nakladnoy_insert_owner ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'nakladnoy' AND owner = auth.uid());

CREATE POLICY nakladnoy_update_owner ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'nakladnoy' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')))
WITH CHECK (bucket_id = 'nakladnoy' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));

CREATE POLICY nakladnoy_delete_owner ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'nakladnoy' AND (owner = auth.uid() OR public.has_role(auth.uid(), 'admin')));
