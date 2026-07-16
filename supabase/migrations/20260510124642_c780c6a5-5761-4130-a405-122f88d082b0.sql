-- 1. Eski purchase_orders ni project_zayavka sub-zayavka sifatida ko'chirish
INSERT INTO public.project_zayavka (
  project_id, parent_id, kind, name, unit, qty, unit_price,
  workflow_status, status,
  supplier_name, supplier_id, contract_url,
  waybill_url, waybill_no, waybill_received_at, qty_received,
  invoice_url, invoice_no, invoice_date,
  payment_proof_url, paid_amount, paid_at,
  ceo_status, ceo_at, ceo_note,
  notes, created_at, created_by, off_plan
)
SELECT
  po.project_id,
  po.zayavka_id AS parent_id,
  'material'::zayavka_kind,
  COALESCE(po.material_name, 'Material'),
  COALESCE(po.unit, 'dona'),
  COALESCE(po.qty, 0),
  COALESCE(po.unit_price, 0),
  CASE
    WHEN po.payment_proof_url IS NOT NULL OR COALESCE(po.paid_amount,0) > 0 THEN 'paid'::zayavka_workflow_status
    WHEN po.ceo_status = 'pending' THEN 'waiting_ceo'::zayavka_workflow_status
    WHEN po.invoice_url IS NOT NULL THEN 'invoiced'::zayavka_workflow_status
    WHEN po.waybill_url IS NOT NULL OR COALESCE(po.qty_received,0) > 0 THEN 'delivered'::zayavka_workflow_status
    WHEN po.pm_status = 'approved' THEN 'ordered'::zayavka_workflow_status
    WHEN po.pm_status = 'pending' THEN 'pending_pm'::zayavka_workflow_status
    ELSE 'approved'::zayavka_workflow_status
  END,
  CASE WHEN po.pm_status = 'rejected' OR po.ceo_status = 'rejected' THEN 'rejected'::zayavka_status ELSE 'approved'::zayavka_status END,
  po.supplier_name, po.supplier_id, po.contract_url,
  po.waybill_url, po.waybill_no, po.waybill_received_at, COALESCE(po.qty_received, 0),
  po.invoice_url, po.invoice_no, po.invoice_date,
  po.payment_proof_url, COALESCE(po.paid_amount, 0), po.paid_at,
  po.ceo_status, po.ceo_at, po.ceo_note,
  COALESCE(po.note, '[migrated PO ' || COALESCE(po.po_number, po.id::text) || ']'),
  po.created_at, po.requested_by, po.off_plan
FROM public.purchase_orders po
WHERE po.zayavka_id IS NOT NULL
  -- Skip if a sub-zayavka with same parent and same name and same created_at already exists
  AND NOT EXISTS (
    SELECT 1 FROM public.project_zayavka z
    WHERE z.parent_id = po.zayavka_id
      AND z.created_at = po.created_at
      AND z.qty = COALESCE(po.qty, 0)
  );

-- 2. Triggerlar/funksiyalar (purchase_orders ga bog'liqlar) - drop
DROP FUNCTION IF EXISTS public.sync_zayavka_workflow_from_po() CASCADE;
DROP FUNCTION IF EXISTS public.sync_zayavka_from_po() CASCADE;

-- 3. Legacy jadvallarni o'chirish
DROP TABLE IF EXISTS public.po_payments CASCADE;
DROP TABLE IF EXISTS public.purchase_order_items CASCADE;
DROP TABLE IF EXISTS public.purchase_orders CASCADE;