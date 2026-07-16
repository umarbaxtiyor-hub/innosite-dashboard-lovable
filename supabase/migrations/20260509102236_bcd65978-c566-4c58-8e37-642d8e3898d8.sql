
-- Workflow status enum
DO $$ BEGIN
  CREATE TYPE public.zayavka_workflow_status AS ENUM (
    'draft', 'submitted', 'approved', 'ordered', 'delivered', 'invoiced', 'waiting_ceo', 'paid', 'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.project_zayavka
  ADD COLUMN IF NOT EXISTS workflow_status public.zayavka_workflow_status NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS boq_item_id uuid REFERENCES public.boq_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS submitted_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid;

-- Backfill: existing approved zayavkalar uchun workflow holatini moslash
UPDATE public.project_zayavka
SET workflow_status = CASE
  WHEN status = 'approved' THEN 'approved'::public.zayavka_workflow_status
  WHEN status = 'rejected' THEN 'rejected'::public.zayavka_workflow_status
  ELSE 'submitted'::public.zayavka_workflow_status
END
WHERE workflow_status = 'draft';

-- Trigger: PO holatini zayavkaga sinxronlash
CREATE OR REPLACE FUNCTION public.sync_zayavka_workflow_from_po()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  zid uuid := COALESCE(NEW.zayavka_id, OLD.zayavka_id);
  new_status public.zayavka_workflow_status;
BEGIN
  IF zid IS NULL THEN RETURN NEW; END IF;

  IF (TG_OP = 'DELETE') THEN
    -- Hech qanday PO qolmasa, zayavkani approved holatga qaytaramiz
    IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE zayavka_id = zid) THEN
      UPDATE public.project_zayavka SET workflow_status = 'approved' WHERE id = zid;
    END IF;
    RETURN OLD;
  END IF;

  -- Yuqoridan pastga: paid > waiting_ceo > invoiced > delivered > ordered
  IF COALESCE(NEW.paid_amount, 0) > 0 AND NEW.ceo_status = 'approved' THEN
    new_status := 'paid';
  ELSIF NEW.payment_request_at IS NOT NULL OR NEW.ceo_status IS NOT NULL THEN
    new_status := 'waiting_ceo';
  ELSIF NEW.invoice_url IS NOT NULL THEN
    new_status := 'invoiced';
  ELSIF NEW.waybill_url IS NOT NULL OR COALESCE(NEW.qty_received, 0) > 0 THEN
    new_status := 'delivered';
  ELSE
    new_status := 'ordered';
  END IF;

  UPDATE public.project_zayavka SET workflow_status = new_status WHERE id = zid;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_zayavka_workflow_from_po ON public.purchase_orders;
CREATE TRIGGER trg_sync_zayavka_workflow_from_po
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.sync_zayavka_workflow_from_po();
