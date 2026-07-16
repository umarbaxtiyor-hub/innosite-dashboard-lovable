DROP TRIGGER IF EXISTS trg_require_zayavka_mat ON public.material_receipts;
DROP TRIGGER IF EXISTS trg_require_zayavka_exp ON public.expenses;
DROP TRIGGER IF EXISTS trg_require_zayavka_work ON public.work_progress;

DROP FUNCTION IF EXISTS public.require_zayavka_link();