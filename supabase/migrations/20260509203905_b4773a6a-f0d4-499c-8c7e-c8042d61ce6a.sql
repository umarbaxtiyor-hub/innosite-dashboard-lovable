
-- Payment type enum
DO $$ BEGIN
  CREATE TYPE public.po_payment_type AS ENUM ('cash', 'bank_transfer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- purchase_orders: cash/bank fields + off_plan
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS payment_type public.po_payment_type NOT NULL DEFAULT 'bank_transfer',
  ADD COLUMN IF NOT EXISTS cash_shop_name text,
  ADD COLUMN IF NOT EXISTS cash_shop_phone text,
  ADD COLUMN IF NOT EXISTS off_plan boolean NOT NULL DEFAULT false;

-- project_zayavka: off_plan + PM approval fields
ALTER TABLE public.project_zayavka
  ADD COLUMN IF NOT EXISTS off_plan boolean NOT NULL DEFAULT false;

-- Update sync trigger to handle cash (skip CEO step)
CREATE OR REPLACE FUNCTION public.sync_zayavka_workflow_from_po()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  zid uuid := COALESCE(NEW.zayavka_id, OLD.zayavka_id);
  new_status public.zayavka_workflow_status;
  is_cash boolean;
BEGIN
  IF zid IS NULL THEN RETURN NEW; END IF;

  IF (TG_OP = 'DELETE') THEN
    IF NOT EXISTS (SELECT 1 FROM public.purchase_orders WHERE zayavka_id = zid) THEN
      UPDATE public.project_zayavka SET workflow_status = 'approved' WHERE id = zid;
    END IF;
    RETURN OLD;
  END IF;

  is_cash := (NEW.payment_type = 'cash');

  IF is_cash THEN
    -- Cash flow: ordered → delivered → paid (CEO yo'q)
    IF NEW.payment_proof_url IS NOT NULL OR COALESCE(NEW.paid_amount, 0) > 0 THEN
      new_status := 'paid';
    ELSIF NEW.waybill_url IS NOT NULL OR COALESCE(NEW.qty_received, 0) > 0 THEN
      new_status := 'delivered';
    ELSE
      new_status := 'ordered';
    END IF;
  ELSE
    -- Bank transfer flow
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
  END IF;

  UPDATE public.project_zayavka SET workflow_status = new_status WHERE id = zid;
  RETURN NEW;
END $function$;

-- Ensure trigger exists on purchase_orders
DROP TRIGGER IF EXISTS trg_sync_zayavka_workflow ON public.purchase_orders;
CREATE TRIGGER trg_sync_zayavka_workflow
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.sync_zayavka_workflow_from_po();
