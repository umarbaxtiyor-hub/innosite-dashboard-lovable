
-- Trigger function for work_progress (analogous to material receipts)
CREATE OR REPLACE FUNCTION public.tg_recompute_zayavka_from_work()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_zayavka_progress(OLD.zayavka_id);
    RETURN OLD;
  ELSE
    PERFORM public.recompute_zayavka_progress(NEW.zayavka_id);
    IF TG_OP = 'UPDATE' AND OLD.zayavka_id IS DISTINCT FROM NEW.zayavka_id THEN
      PERFORM public.recompute_zayavka_progress(OLD.zayavka_id);
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_recompute_zayavka_from_receipt ON public.material_receipts;
CREATE TRIGGER trg_recompute_zayavka_from_receipt
AFTER INSERT OR UPDATE OR DELETE ON public.material_receipts
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_zayavka_from_receipt();

DROP TRIGGER IF EXISTS trg_recompute_zayavka_from_work ON public.work_progress;
CREATE TRIGGER trg_recompute_zayavka_from_work
AFTER INSERT OR UPDATE OR DELETE ON public.work_progress
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_zayavka_from_work();

-- Recompute existing data once
DO $$
DECLARE z RECORD;
BEGIN
  FOR z IN SELECT id FROM public.project_zayavka LOOP
    PERFORM public.recompute_zayavka_progress(z.id);
  END LOOP;
END $$;
