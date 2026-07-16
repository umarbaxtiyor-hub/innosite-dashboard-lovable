
-- Cleanup orphans
DELETE FROM public.user_firm_access
WHERE firm_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.firms f WHERE f.id = user_firm_access.firm_id);

ALTER TABLE public.employee_attendance
  ADD CONSTRAINT employee_attendance_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.incomes
  ADD CONSTRAINT incomes_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE SET NULL;

ALTER TABLE public.supplier_contracts
  ADD CONSTRAINT supplier_contracts_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE public.user_firm_access
  ADD CONSTRAINT user_firm_access_firm_id_fkey
  FOREIGN KEY (firm_id) REFERENCES public.firms(id) ON UPDATE CASCADE ON DELETE CASCADE;

ALTER TABLE public.user_project_access
  ADD CONSTRAINT user_project_access_project_id_fkey
  FOREIGN KEY (project_id) REFERENCES public.projects(id) ON UPDATE CASCADE ON DELETE CASCADE;
