
ALTER TABLE public.material_receipts
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_note text;

ALTER TABLE public.work_progress
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_note text;

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_note text;

ALTER TABLE public.brigade_payments
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS source_note text;

UPDATE public.material_receipts SET source = CASE WHEN telegram_user_id IS NOT NULL THEN 'telegram_text' ELSE 'web' END WHERE source IS NULL;
UPDATE public.work_progress    SET source = CASE WHEN telegram_user_id IS NOT NULL THEN 'telegram_text' ELSE 'web' END WHERE source IS NULL;
UPDATE public.expenses         SET source = CASE WHEN telegram_user_id IS NOT NULL THEN 'telegram_text' ELSE 'web' END WHERE source IS NULL;
UPDATE public.brigade_payments SET source = CASE WHEN telegram_user_id IS NOT NULL THEN 'telegram_text' ELSE 'web' END WHERE source IS NULL;
