-- Restrict SELECT on financial tables to finance/management roles only
DROP POLICY IF EXISTS bp_select_authenticated ON public.brigade_payments;
CREATE POLICY bp_select_finance ON public.brigade_payments
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'ceo'::app_role)
    OR has_role(auth.uid(), 'direktor'::app_role)
    OR has_role(auth.uid(), 'finans'::app_role)
    OR has_role(auth.uid(), 'buxgalter'::app_role)
    OR has_role(auth.uid(), 'pm'::app_role)
  );

DROP POLICY IF EXISTS ep_select ON public.employee_payments;
CREATE POLICY ep_select_finance ON public.employee_payments
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'ceo'::app_role)
    OR has_role(auth.uid(), 'direktor'::app_role)
    OR has_role(auth.uid(), 'finans'::app_role)
    OR has_role(auth.uid(), 'buxgalter'::app_role)
  );

DROP POLICY IF EXISTS inc_read_all ON public.incomes;
CREATE POLICY inc_read_finance ON public.incomes
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'ceo'::app_role)
    OR has_role(auth.uid(), 'direktor'::app_role)
    OR has_role(auth.uid(), 'finans'::app_role)
    OR has_role(auth.uid(), 'buxgalter'::app_role)
  );
