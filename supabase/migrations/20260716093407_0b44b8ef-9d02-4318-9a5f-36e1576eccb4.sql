
-- boq_items: role-scoped read
DROP POLICY IF EXISTS boq_select_authenticated ON public.boq_items;
CREATE POLICY boq_select_scoped ON public.boq_items FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ceo') OR
  public.has_role(auth.uid(),'direktor') OR public.has_role(auth.uid(),'finans') OR
  public.has_role(auth.uid(),'buxgalter') OR public.has_role(auth.uid(),'pm') OR
  public.has_role(auth.uid(),'prorab') OR public.has_role(auth.uid(),'taminotchi') OR
  public.has_role(auth.uid(),'omborchi') OR public.has_role(auth.uid(),'kuzatuvchi')
);

-- documents: role-scoped read
DROP POLICY IF EXISTS read_all_docs ON public.documents;
CREATE POLICY docs_select_scoped ON public.documents FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ceo') OR
  public.has_role(auth.uid(),'direktor') OR public.has_role(auth.uid(),'finans') OR
  public.has_role(auth.uid(),'buxgalter') OR public.has_role(auth.uid(),'pm') OR
  public.has_role(auth.uid(),'taminotchi') OR public.has_role(auth.uid(),'omborchi')
);

-- expense_categories: restrict write to admin/finans/buxgalter
DROP POLICY IF EXISTS ec_insert ON public.expense_categories;
DROP POLICY IF EXISTS ec_update ON public.expense_categories;
DROP POLICY IF EXISTS ec_delete ON public.expense_categories;
CREATE POLICY ec_insert_priv ON public.expense_categories FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans') OR public.has_role(auth.uid(),'buxgalter'));
CREATE POLICY ec_update_priv ON public.expense_categories FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans') OR public.has_role(auth.uid(),'buxgalter'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans') OR public.has_role(auth.uid(),'buxgalter'));
CREATE POLICY ec_delete_priv ON public.expense_categories FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans') OR public.has_role(auth.uid(),'buxgalter'));

-- expense_units: same
DROP POLICY IF EXISTS eu_insert ON public.expense_units;
DROP POLICY IF EXISTS eu_update ON public.expense_units;
DROP POLICY IF EXISTS eu_delete ON public.expense_units;
CREATE POLICY eu_insert_priv ON public.expense_units FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans') OR public.has_role(auth.uid(),'buxgalter'));
CREATE POLICY eu_update_priv ON public.expense_units FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans') OR public.has_role(auth.uid(),'buxgalter'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans') OR public.has_role(auth.uid(),'buxgalter'));
CREATE POLICY eu_delete_priv ON public.expense_units FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans') OR public.has_role(auth.uid(),'buxgalter'));

-- project_zayavka_items: role-scoped (match project_zayavka procurement scope)
DROP POLICY IF EXISTS pzi_read_all ON public.project_zayavka_items;
DROP POLICY IF EXISTS pzi_insert_all ON public.project_zayavka_items;
DROP POLICY IF EXISTS pzi_update_all ON public.project_zayavka_items;
DROP POLICY IF EXISTS pzi_delete_all ON public.project_zayavka_items;
CREATE POLICY pzi_select_scoped ON public.project_zayavka_items FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ceo') OR
  public.has_role(auth.uid(),'direktor') OR public.has_role(auth.uid(),'pm') OR
  public.has_role(auth.uid(),'taminotchi') OR public.has_role(auth.uid(),'omborchi') OR
  public.has_role(auth.uid(),'prorab')
);
CREATE POLICY pzi_insert_scoped ON public.project_zayavka_items FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pm') OR
  public.has_role(auth.uid(),'taminotchi') OR public.has_role(auth.uid(),'prorab')
);
CREATE POLICY pzi_update_scoped ON public.project_zayavka_items FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pm') OR
  public.has_role(auth.uid(),'taminotchi') OR public.has_role(auth.uid(),'prorab')
)
WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pm') OR
  public.has_role(auth.uid(),'taminotchi') OR public.has_role(auth.uid(),'prorab')
);
CREATE POLICY pzi_delete_scoped ON public.project_zayavka_items FOR DELETE TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'pm') OR
  public.has_role(auth.uid(),'taminotchi')
);

-- role_permissions: user sees only rows for their own roles; admin sees all
DROP POLICY IF EXISTS rp_read_authenticated ON public.role_permissions;
CREATE POLICY rp_read_own_roles ON public.role_permissions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(), role)
);

-- suppliers: role-scoped read
DROP POLICY IF EXISTS suppliers_select_authenticated ON public.suppliers;
CREATE POLICY suppliers_select_scoped ON public.suppliers FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ceo') OR
  public.has_role(auth.uid(),'direktor') OR public.has_role(auth.uid(),'finans') OR
  public.has_role(auth.uid(),'buxgalter') OR public.has_role(auth.uid(),'pm') OR
  public.has_role(auth.uid(),'taminotchi') OR public.has_role(auth.uid(),'omborchi')
);

-- variations: role-scoped read
DROP POLICY IF EXISTS read_all_var ON public.variations;
CREATE POLICY variations_select_scoped ON public.variations FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ceo') OR
  public.has_role(auth.uid(),'direktor') OR public.has_role(auth.uid(),'pm')
);

-- zayavka_status_log: role-scoped read
DROP POLICY IF EXISTS zsl_read_all ON public.zayavka_status_log;
CREATE POLICY zsl_read_scoped ON public.zayavka_status_log FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'ceo') OR
  public.has_role(auth.uid(),'direktor') OR public.has_role(auth.uid(),'pm') OR
  public.has_role(auth.uid(),'taminotchi') OR public.has_role(auth.uid(),'omborchi') OR
  public.has_role(auth.uid(),'prorab')
);
