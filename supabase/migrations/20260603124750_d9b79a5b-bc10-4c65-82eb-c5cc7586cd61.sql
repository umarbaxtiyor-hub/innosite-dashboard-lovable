DO $$
DECLARE pid uuid := '5b3cb769-febd-43bf-ba55-1070bb037b51';
BEGIN
  DELETE FROM public.expenses WHERE project_id = pid;
  DELETE FROM public.material_receipts WHERE project_id = pid;
  DELETE FROM public.material_usage WHERE project_id = pid;
  DELETE FROM public.work_progress WHERE project_id = pid;
  DELETE FROM public.incomes WHERE project_id = pid;
  DELETE FROM public.employee_payments WHERE project_id = pid;
  DELETE FROM public.brigade_payments WHERE project_id = pid;
  DELETE FROM public.employee_attendance WHERE project_id = pid;
  DELETE FROM public.variations WHERE project_id = pid;
  DELETE FROM public.project_zayavka_items WHERE zayavka_id IN (SELECT id FROM public.project_zayavka WHERE project_id = pid);
  DELETE FROM public.zayavka_status_log WHERE zayavka_id IN (SELECT id FROM public.project_zayavka WHERE project_id = pid);
  DELETE FROM public.project_zayavka WHERE project_id = pid;
  DELETE FROM public.boq_items WHERE project_id = pid;
END $$;