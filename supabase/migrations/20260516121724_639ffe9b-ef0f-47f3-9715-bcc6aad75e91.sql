-- Auto-update project_zayavka.qty_received whenever material_receipts or work_progress changes.
-- Uses the existing recompute_zayavka_progress function via tg_recompute_zayavka_from_* trigger functions.

DROP TRIGGER IF EXISTS trg_recompute_zayavka_from_receipt ON public.material_receipts;
CREATE TRIGGER trg_recompute_zayavka_from_receipt
AFTER INSERT OR UPDATE OR DELETE ON public.material_receipts
FOR EACH ROW
EXECUTE FUNCTION public.tg_recompute_zayavka_from_receipt();

DROP TRIGGER IF EXISTS trg_recompute_zayavka_from_work ON public.work_progress;
CREATE TRIGGER trg_recompute_zayavka_from_work
AFTER INSERT OR UPDATE OR DELETE ON public.work_progress
FOR EACH ROW
EXECUTE FUNCTION public.tg_recompute_zayavka_from_work();

-- Backfill existing rows so qty_received reflects current data.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT zayavka_id FROM public.material_receipts WHERE zayavka_id IS NOT NULL
    UNION
    SELECT DISTINCT zayavka_id FROM public.work_progress WHERE zayavka_id IS NOT NULL
  LOOP
    PERFORM public.recompute_zayavka_progress(r.zayavka_id);
  END LOOP;
END $$;