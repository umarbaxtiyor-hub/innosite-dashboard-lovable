ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS sheet_id text,
  ADD COLUMN IF NOT EXISTS sheet_tab text;