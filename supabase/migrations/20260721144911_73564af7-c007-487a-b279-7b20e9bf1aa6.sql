
-- Brigades: allow management roles to insert/update/delete
CREATE POLICY brigades_insert_management ON public.brigades FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'ceo'::app_role)
  OR has_role(auth.uid(),'direktor'::app_role) OR has_role(auth.uid(),'pm'::app_role)
  OR has_role(auth.uid(),'finans'::app_role) OR has_role(auth.uid(),'buxgalter'::app_role)
);

CREATE POLICY brigades_update_management ON public.brigades FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'ceo'::app_role)
  OR has_role(auth.uid(),'direktor'::app_role) OR has_role(auth.uid(),'pm'::app_role)
  OR has_role(auth.uid(),'finans'::app_role) OR has_role(auth.uid(),'buxgalter'::app_role)
)
WITH CHECK (
  has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'ceo'::app_role)
  OR has_role(auth.uid(),'direktor'::app_role) OR has_role(auth.uid(),'pm'::app_role)
  OR has_role(auth.uid(),'finans'::app_role) OR has_role(auth.uid(),'buxgalter'::app_role)
);

CREATE POLICY brigades_delete_management ON public.brigades FOR DELETE TO authenticated
USING (
  has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'ceo'::app_role)
  OR has_role(auth.uid(),'direktor'::app_role) OR has_role(auth.uid(),'pm'::app_role)
);

-- Documents: add update/delete policies scoped like select
CREATE POLICY docs_update_scoped ON public.documents FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'ceo'::app_role)
  OR has_role(auth.uid(),'direktor'::app_role) OR has_role(auth.uid(),'finans'::app_role)
  OR has_role(auth.uid(),'buxgalter'::app_role) OR uploaded_by = auth.uid()
)
WITH CHECK (
  has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'ceo'::app_role)
  OR has_role(auth.uid(),'direktor'::app_role) OR has_role(auth.uid(),'finans'::app_role)
  OR has_role(auth.uid(),'buxgalter'::app_role) OR uploaded_by = auth.uid()
);

CREATE POLICY docs_delete_scoped ON public.documents FOR DELETE TO authenticated
USING (
  has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'ceo'::app_role)
  OR has_role(auth.uid(),'direktor'::app_role) OR uploaded_by = auth.uid()
);

CREATE POLICY docs_insert_scoped ON public.documents FOR INSERT TO authenticated
WITH CHECK (
  uploaded_by = auth.uid() OR has_role(auth.uid(),'admin'::app_role)
);
