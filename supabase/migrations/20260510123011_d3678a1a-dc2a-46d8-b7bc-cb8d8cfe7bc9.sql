
-- Add new columns to project_zayavka for sub-zayavka workflow
ALTER TABLE public.project_zayavka
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.project_zayavka(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS needed_date date,
  ADD COLUMN IF NOT EXISTS supplier_name text,
  ADD COLUMN IF NOT EXISTS supplier_id uuid,
  ADD COLUMN IF NOT EXISTS contract_url text,
  ADD COLUMN IF NOT EXISTS waybill_url text,
  ADD COLUMN IF NOT EXISTS waybill_no text,
  ADD COLUMN IF NOT EXISTS waybill_received_at date,
  ADD COLUMN IF NOT EXISTS qty_received numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS invoice_url text,
  ADD COLUMN IF NOT EXISTS invoice_no text,
  ADD COLUMN IF NOT EXISTS invoice_date date,
  ADD COLUMN IF NOT EXISTS payment_proof_url text,
  ADD COLUMN IF NOT EXISTS paid_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS paid_at date,
  ADD COLUMN IF NOT EXISTS ceo_status text,
  ADD COLUMN IF NOT EXISTS ceo_at timestamptz,
  ADD COLUMN IF NOT EXISTS ceo_note text;

CREATE INDEX IF NOT EXISTS idx_project_zayavka_parent ON public.project_zayavka(parent_id);

-- Add pending_pm to enum (idempotent)
DO $$ BEGIN
  ALTER TYPE public.zayavka_workflow_status ADD VALUE IF NOT EXISTS 'pending_pm';
EXCEPTION WHEN others THEN NULL; END $$;

-- View: master remaining
CREATE OR REPLACE VIEW public.v_master_zayavka_remaining AS
SELECT
  m.id,
  m.project_id,
  m.kind,
  m.name,
  m.unit,
  m.qty AS planned_qty,
  m.unit_price,
  COALESCE(SUM(c.qty) FILTER (WHERE c.workflow_status NOT IN ('rejected','draft')), 0) AS requested_qty,
  COALESCE(SUM(c.qty_received), 0) AS received_qty,
  GREATEST(0, m.qty - COALESCE(SUM(c.qty) FILTER (WHERE c.workflow_status NOT IN ('rejected','draft')), 0)) AS remaining_qty
FROM public.project_zayavka m
LEFT JOIN public.project_zayavka c ON c.parent_id = m.id
WHERE m.parent_id IS NULL
GROUP BY m.id;

GRANT SELECT ON public.v_master_zayavka_remaining TO anon, authenticated;
