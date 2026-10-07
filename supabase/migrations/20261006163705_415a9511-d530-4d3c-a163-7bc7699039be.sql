CREATE TABLE public.sheet_sync_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL CHECK (source_table IN ('expenses','incomes')),
  record_id uuid NOT NULL,
  spreadsheet_id text NOT NULL,
  tab text NOT NULL,
  status text NOT NULL DEFAULT 'writing' CHECK (status IN ('writing','written')),
  write_token text NOT NULL,
  attempt_at timestamptz NOT NULL DEFAULT now(),
  written_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sheet_sync_ledger_target_uniq UNIQUE (source_table, record_id, spreadsheet_id, tab)
);
GRANT SELECT ON public.sheet_sync_ledger TO authenticated;
GRANT ALL ON public.sheet_sync_ledger TO service_role;
ALTER TABLE public.sheet_sync_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view sheet sync ledger" ON public.sheet_sync_ledger
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX idx_sheet_sync_ledger_writing ON public.sheet_sync_ledger (attempt_at) WHERE status = 'writing';
CREATE TRIGGER sheet_sync_ledger_touch BEFORE UPDATE ON public.sheet_sync_ledger
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();