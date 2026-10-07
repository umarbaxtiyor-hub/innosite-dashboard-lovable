ALTER TABLE public.sheet_sync_ledger DROP CONSTRAINT IF EXISTS sheet_sync_ledger_source_table_check;
ALTER TABLE public.sheet_sync_ledger ADD CONSTRAINT sheet_sync_ledger_source_table_check
  CHECK (source_table = ANY (ARRAY['expenses','incomes','fuel','hr','dpr']));