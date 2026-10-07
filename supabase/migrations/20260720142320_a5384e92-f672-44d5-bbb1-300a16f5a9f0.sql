
-- Narrow brigades SELECT to management/finance roles (remove omborchi/prorab broad access to leader phone)
DROP POLICY IF EXISTS brigades_select_operational_roles ON public.brigades;
CREATE POLICY brigades_select_management ON public.brigades
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'ceo'::app_role)
    OR has_role(auth.uid(),'direktor'::app_role)
    OR has_role(auth.uid(),'pm'::app_role)
    OR has_role(auth.uid(),'finans'::app_role)
    OR has_role(auth.uid(),'buxgalter'::app_role)
  );

-- Add INSERT/DELETE policies for variations so authorized roles can create/remove requests
CREATE POLICY variations_insert_scoped ON public.variations
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'ceo'::app_role)
    OR has_role(auth.uid(),'direktor'::app_role)
    OR has_role(auth.uid(),'pm'::app_role)
    OR has_role(auth.uid(),'prorab'::app_role)
  );

CREATE POLICY variations_delete_scoped ON public.variations
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(),'admin'::app_role)
    OR has_role(auth.uid(),'ceo'::app_role)
    OR has_role(auth.uid(),'direktor'::app_role)
    OR has_role(auth.uid(),'pm'::app_role)
  );
