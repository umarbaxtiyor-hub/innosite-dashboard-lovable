CREATE OR REPLACE FUNCTION public.user_can_access_project(_project_id uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'ceo'::public.app_role)
    OR public.has_role(auth.uid(), 'direktor'::public.app_role)
    OR public.has_role(auth.uid(), 'finans'::public.app_role)
    OR public.has_role(auth.uid(), 'pm'::public.app_role)
    OR public.has_role(auth.uid(), 'project_manager'::public.app_role)
    OR (
      _project_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.projects p
        WHERE p.id = _project_id
          AND (
            EXISTS (SELECT 1 FROM public.user_project_access upa WHERE upa.user_id = auth.uid() AND upa.project_id = p.id)
            OR EXISTS (SELECT 1 FROM public.user_firm_access ufa WHERE ufa.user_id = auth.uid() AND ufa.firm_id = p.firm_id)
          )
      )
    )
$function$;