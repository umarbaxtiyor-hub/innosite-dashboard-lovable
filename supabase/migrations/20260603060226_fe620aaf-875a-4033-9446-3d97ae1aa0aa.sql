
-- Helper: can_manage_finance / can_manage_hr
-- Use existing has_role() function

-- ===== bot_messages: writes admin only =====
DROP POLICY IF EXISTS bm_insert ON public.bot_messages;
DROP POLICY IF EXISTS bm_update ON public.bot_messages;
DROP POLICY IF EXISTS bm_delete ON public.bot_messages;

CREATE POLICY bm_insert ON public.bot_messages FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY bm_update ON public.bot_messages FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY bm_delete ON public.bot_messages FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- ===== brigade_members: restrict SELECT + writes =====
DROP POLICY IF EXISTS bm_read_all ON public.brigade_members;
DROP POLICY IF EXISTS bm_write_all ON public.brigade_members;
DROP POLICY IF EXISTS bm_update_all ON public.brigade_members;
DROP POLICY IF EXISTS bm_delete_all ON public.brigade_members;

CREATE POLICY bm_read_scoped ON public.brigade_members FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'finans')
    OR public.has_role(auth.uid(), 'buxgalter')
    OR public.has_role(auth.uid(), 'pm')
    OR public.has_role(auth.uid(), 'prorab')
  );
CREATE POLICY bm_insert_scoped ON public.brigade_members FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'pm')
    OR public.has_role(auth.uid(), 'prorab')
  );
CREATE POLICY bm_update_scoped ON public.brigade_members FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'pm')
    OR public.has_role(auth.uid(), 'prorab')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'pm')
    OR public.has_role(auth.uid(), 'prorab')
  );
CREATE POLICY bm_delete_scoped ON public.brigade_members FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'pm')
  );

-- ===== employees: restrict SELECT + writes =====
DROP POLICY IF EXISTS emp_read_all ON public.employees;
DROP POLICY IF EXISTS emp_write_all ON public.employees;
DROP POLICY IF EXISTS emp_update_all ON public.employees;
DROP POLICY IF EXISTS emp_delete_all ON public.employees;

CREATE POLICY emp_read_scoped ON public.employees FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'finans')
    OR public.has_role(auth.uid(), 'buxgalter')
    OR public.has_role(auth.uid(), 'pm')
    OR public.has_role(auth.uid(), 'prorab')
  );
CREATE POLICY emp_insert_scoped ON public.employees FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'finans')
    OR public.has_role(auth.uid(), 'buxgalter')
  );
CREATE POLICY emp_update_scoped ON public.employees FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'finans')
    OR public.has_role(auth.uid(), 'buxgalter')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'finans')
    OR public.has_role(auth.uid(), 'buxgalter')
  );
CREATE POLICY emp_delete_scoped ON public.employees FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
  );

-- ===== employee_payments: writes finance roles =====
DROP POLICY IF EXISTS ep_insert ON public.employee_payments;
DROP POLICY IF EXISTS ep_update ON public.employee_payments;
DROP POLICY IF EXISTS ep_delete ON public.employee_payments;

CREATE POLICY ep_insert ON public.employee_payments FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'finans')
    OR public.has_role(auth.uid(), 'buxgalter')
  );
CREATE POLICY ep_update ON public.employee_payments FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'finans')
    OR public.has_role(auth.uid(), 'buxgalter')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'finans')
    OR public.has_role(auth.uid(), 'buxgalter')
  );
CREATE POLICY ep_delete ON public.employee_payments FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'finans')
  );

-- ===== firms: writes admin/ceo/direktor =====
DROP POLICY IF EXISTS firms_insert ON public.firms;
DROP POLICY IF EXISTS firms_update ON public.firms;
DROP POLICY IF EXISTS firms_delete ON public.firms;

CREATE POLICY firms_insert ON public.firms FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
  );
CREATE POLICY firms_update ON public.firms FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
  );
CREATE POLICY firms_delete ON public.firms FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
  );

-- ===== incomes: writes finance roles =====
DROP POLICY IF EXISTS inc_insert_all ON public.incomes;
DROP POLICY IF EXISTS inc_update_all ON public.incomes;
DROP POLICY IF EXISTS inc_delete_all ON public.incomes;

CREATE POLICY inc_insert_scoped ON public.incomes FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'finans')
    OR public.has_role(auth.uid(), 'buxgalter')
  );
CREATE POLICY inc_update_scoped ON public.incomes FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'finans')
    OR public.has_role(auth.uid(), 'buxgalter')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'finans')
    OR public.has_role(auth.uid(), 'buxgalter')
  );
CREATE POLICY inc_delete_scoped ON public.incomes FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'direktor')
    OR public.has_role(auth.uid(), 'finans')
  );

-- ===== Revoke EXECUTE on SECURITY DEFINER role-check fns from anon/public =====
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.tg_user_has_role(bigint, public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tg_user_has_role(bigint, public.app_role) TO authenticated, service_role;
