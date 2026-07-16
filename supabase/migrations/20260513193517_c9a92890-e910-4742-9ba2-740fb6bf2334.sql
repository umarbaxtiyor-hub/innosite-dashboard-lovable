
CREATE OR REPLACE FUNCTION public.recompute_zayavka_progress(_zid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  z_kind text;
  z_qty numeric;
  total_recv numeric := 0;
  cur_status zayavka_workflow_status;
  new_status zayavka_workflow_status;
BEGIN
  IF _zid IS NULL THEN RETURN; END IF;
  SELECT kind::text, COALESCE(qty,0), workflow_status
    INTO z_kind, z_qty, cur_status
  FROM public.project_zayavka WHERE id = _zid;
  IF NOT FOUND THEN RETURN; END IF;

  IF z_kind = 'work' THEN
    SELECT COALESCE(SUM(qty_done),0) INTO total_recv FROM public.work_progress WHERE zayavka_id = _zid;
  ELSE
    SELECT COALESCE(SUM(qty),0) INTO total_recv FROM public.material_receipts WHERE zayavka_id = _zid;
  END IF;

  IF total_recv > 0 THEN
    new_status := 'delivered'::zayavka_workflow_status;
  ELSE
    new_status := cur_status;
  END IF;

  UPDATE public.project_zayavka
     SET qty_received = total_recv,
         workflow_status = new_status
   WHERE id = _zid;
END;
$$;

CREATE OR REPLACE FUNCTION public.tg_recompute_zayavka_from_receipt()
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

DROP TRIGGER IF EXISTS trg_mr_recompute_zayavka ON public.material_receipts;
CREATE TRIGGER trg_mr_recompute_zayavka
AFTER INSERT OR UPDATE OR DELETE ON public.material_receipts
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_zayavka_from_receipt();

DROP TRIGGER IF EXISTS trg_wp_recompute_zayavka ON public.work_progress;
CREATE TRIGGER trg_wp_recompute_zayavka
AFTER INSERT OR UPDATE OR DELETE ON public.work_progress
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_zayavka_from_receipt();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT id FROM public.project_zayavka LOOP
    PERFORM public.recompute_zayavka_progress(r.id);
  END LOOP;
END $$;
