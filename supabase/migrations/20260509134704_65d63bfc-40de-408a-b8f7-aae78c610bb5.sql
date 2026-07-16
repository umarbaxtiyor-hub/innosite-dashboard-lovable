-- Track last reminder for missing faktura (anti-spam)
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS last_invoice_reminder_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_po_invoice_reminder
  ON public.purchase_orders (waybill_received_at)
  WHERE waybill_url IS NOT NULL AND invoice_url IS NULL;