-- 1) BOQ: yangi 'ustalar' turi
ALTER TYPE zayavka_kind ADD VALUE IF NOT EXISTS 'ustalar';

-- 2) Project Operations
CREATE TABLE IF NOT EXISTS public.project_operations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  category text NOT NULL,
  description text,
  qty numeric,
  unit text,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text,
  op_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  source text,
  telegram_user_id bigint,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.project_operations TO authenticated;
GRANT ALL ON public.project_operations TO service_role;

ALTER TABLE public.project_operations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ops_select" ON public.project_operations FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans')
  OR public.has_role(auth.uid(),'ceo') OR public.has_role(auth.uid(),'direktor')
  OR public.has_role(auth.uid(),'buxgalter') OR public.has_role(auth.uid(),'pm')
);
CREATE POLICY "ops_insert" ON public.project_operations FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans')
  OR public.has_role(auth.uid(),'buxgalter') OR public.has_role(auth.uid(),'pm')
);
CREATE POLICY "ops_update" ON public.project_operations FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'));
CREATE POLICY "ops_delete" ON public.project_operations FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'));

CREATE TRIGGER trg_ops_touch BEFORE UPDATE ON public.project_operations
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_ops_project_date ON public.project_operations(project_id, op_date DESC);

-- 3) Daily reports
CREATE TABLE IF NOT EXISTS public.daily_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  report_date date NOT NULL DEFAULT CURRENT_DATE,
  telegram_user_id bigint,
  reporter_name text,
  issues text,
  notes text,
  photo_url text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.daily_report_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES public.daily_reports(id) ON DELETE CASCADE,
  zayavka_id uuid REFERENCES public.project_zayavka(id) ON DELETE SET NULL,
  boq_item_id uuid REFERENCES public.boq_items(id) ON DELETE SET NULL,
  activity_name text,
  unit text,
  qty_done numeric NOT NULL DEFAULT 0,
  brigade_id uuid REFERENCES public.brigades(id) ON DELETE SET NULL,
  brigade_name text,
  workers_count integer,
  equipment_name text,
  equipment_hours numeric,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_reports TO authenticated;
GRANT ALL ON public.daily_reports TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_report_lines TO authenticated;
GRANT ALL ON public.daily_report_lines TO service_role;

ALTER TABLE public.daily_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_report_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dr_select" ON public.daily_reports FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans')
  OR public.has_role(auth.uid(),'ceo') OR public.has_role(auth.uid(),'direktor')
  OR public.has_role(auth.uid(),'pm') OR public.has_role(auth.uid(),'prorab')
);
CREATE POLICY "dr_insert" ON public.daily_reports FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans')
  OR public.has_role(auth.uid(),'pm') OR public.has_role(auth.uid(),'prorab')
);
CREATE POLICY "dr_update" ON public.daily_reports FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'));
CREATE POLICY "dr_delete" ON public.daily_reports FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'));

CREATE POLICY "drl_select" ON public.daily_report_lines FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans')
  OR public.has_role(auth.uid(),'ceo') OR public.has_role(auth.uid(),'direktor')
  OR public.has_role(auth.uid(),'pm') OR public.has_role(auth.uid(),'prorab')
);
CREATE POLICY "drl_insert" ON public.daily_report_lines FOR INSERT TO authenticated
WITH CHECK (
  public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans')
  OR public.has_role(auth.uid(),'pm') OR public.has_role(auth.uid(),'prorab')
);
CREATE POLICY "drl_update" ON public.daily_report_lines FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'))
WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'));
CREATE POLICY "drl_delete" ON public.daily_report_lines FOR DELETE TO authenticated
USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'));

CREATE TRIGGER trg_dr_touch BEFORE UPDATE ON public.daily_reports
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE INDEX IF NOT EXISTS idx_dr_project_date ON public.daily_reports(project_id, report_date DESC);
CREATE INDEX IF NOT EXISTS idx_drl_report ON public.daily_report_lines(report_id);
CREATE INDEX IF NOT EXISTS idx_drl_zayavka ON public.daily_report_lines(zayavka_id);

-- 4) BOQ progressni kunlik hisobotdan ham hisoblash
CREATE OR REPLACE FUNCTION public.recompute_zayavka_progress(_zid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  z_kind text; z_qty numeric; total_recv numeric := 0; daily_recv numeric := 0;
  cur_status zayavka_workflow_status; new_status zayavka_workflow_status;
BEGIN
  IF _zid IS NULL THEN RETURN; END IF;
  SELECT kind::text, COALESCE(qty,0), workflow_status
    INTO z_kind, z_qty, cur_status
  FROM public.project_zayavka WHERE id = _zid;
  IF NOT FOUND THEN RETURN; END IF;

  IF z_kind = 'material' THEN
    SELECT COALESCE(SUM(qty),0) INTO total_recv FROM public.material_receipts WHERE zayavka_id = _zid;
  ELSE
    SELECT COALESCE(SUM(qty_done),0) INTO total_recv FROM public.work_progress WHERE zayavka_id = _zid;
  END IF;

  SELECT COALESCE(SUM(qty_done),0) INTO daily_recv
    FROM public.daily_report_lines WHERE zayavka_id = _zid;
  total_recv := total_recv + daily_recv;

  new_status := CASE WHEN total_recv > 0 THEN 'delivered'::zayavka_workflow_status ELSE cur_status END;

  UPDATE public.project_zayavka
     SET qty_received = total_recv, workflow_status = new_status
   WHERE id = _zid;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_trigger_error(
    'project_zayavka', 'RECOMPUTE', _zid, SQLERRM, SQLSTATE,
    'recompute_zayavka_progress failed'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.tg_recompute_zayavka_from_daily()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recompute_zayavka_progress(OLD.zayavka_id);
    RETURN OLD;
  END IF;
  PERFORM public.recompute_zayavka_progress(NEW.zayavka_id);
  IF TG_OP = 'UPDATE' AND OLD.zayavka_id IS DISTINCT FROM NEW.zayavka_id THEN
    PERFORM public.recompute_zayavka_progress(OLD.zayavka_id);
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_drl_recompute
AFTER INSERT OR UPDATE OR DELETE ON public.daily_report_lines
FOR EACH ROW EXECUTE FUNCTION public.tg_recompute_zayavka_from_daily();

CREATE TRIGGER audit_trg
AFTER INSERT OR UPDATE OR DELETE ON public.project_operations
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TRIGGER audit_trg
AFTER INSERT OR UPDATE OR DELETE ON public.daily_reports
FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();