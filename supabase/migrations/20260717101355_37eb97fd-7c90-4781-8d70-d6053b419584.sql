
CREATE POLICY "brigades_select_operational_roles"
ON public.brigades
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR has_role(auth.uid(), 'ceo'::app_role)
  OR has_role(auth.uid(), 'direktor'::app_role)
  OR has_role(auth.uid(), 'pm'::app_role)
  OR has_role(auth.uid(), 'prorab'::app_role)
  OR has_role(auth.uid(), 'finans'::app_role)
  OR has_role(auth.uid(), 'buxgalter'::app_role)
  OR has_role(auth.uid(), 'omborchi'::app_role)
);

COMMENT ON TABLE public.role_permissions IS 'UI menu routing paths per role. Non-sensitive. Users read only their own role rows via has_role().';
