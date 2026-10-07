
-- Projects: scope SELECT to assigned users + privileged roles
DROP POLICY IF EXISTS projects_select_authenticated ON public.projects;
CREATE POLICY projects_select_scoped ON public.projects
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'ceo'::app_role)
    OR has_role(auth.uid(), 'direktor'::app_role)
    OR has_role(auth.uid(), 'finans'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_project_access upa WHERE upa.user_id = auth.uid() AND upa.project_id = projects.id)
    OR (firm_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.user_firm_access ufa WHERE ufa.user_id = auth.uid() AND ufa.firm_id = projects.firm_id))
  );

-- Firms: scope SELECT to assigned users + privileged roles
DROP POLICY IF EXISTS firms_select_authenticated ON public.firms;
CREATE POLICY firms_select_scoped ON public.firms
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'ceo'::app_role)
    OR has_role(auth.uid(), 'direktor'::app_role)
    OR has_role(auth.uid(), 'finans'::app_role)
    OR EXISTS (SELECT 1 FROM public.user_firm_access ufa WHERE ufa.user_id = auth.uid() AND ufa.firm_id = firms.id)
    OR EXISTS (
      SELECT 1 FROM public.user_project_access upa
      JOIN public.projects p ON p.id = upa.project_id
      WHERE upa.user_id = auth.uid() AND p.firm_id = firms.id
    )
  );

-- Documents: scope SELECT to project assignment for non-privileged roles
DROP POLICY IF EXISTS docs_select_scoped ON public.documents;
CREATE POLICY docs_select_scoped ON public.documents
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'ceo'::app_role)
    OR has_role(auth.uid(), 'direktor'::app_role)
    OR has_role(auth.uid(), 'finans'::app_role)
    OR has_role(auth.uid(), 'buxgalter'::app_role)
    OR uploaded_by = auth.uid()
    OR (
      project_id IS NOT NULL
      AND (
        has_role(auth.uid(), 'pm'::app_role)
        OR has_role(auth.uid(), 'taminotchi'::app_role)
        OR has_role(auth.uid(), 'omborchi'::app_role)
      )
      AND EXISTS (
        SELECT 1 FROM public.user_project_access upa
        WHERE upa.user_id = auth.uid() AND upa.project_id = documents.project_id
      )
    )
  );

-- telegram-files bucket: require uploader-owned folder prefix
DROP POLICY IF EXISTS tg_files_insert_authenticated ON storage.objects;
CREATE POLICY tg_files_insert_authenticated ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'telegram-files'
    AND owner = auth.uid()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR (storage.foldername(name))[1] = auth.uid()::text
    )
  );
