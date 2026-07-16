
ALTER TABLE public.material_receipts 
  ADD COLUMN IF NOT EXISTS photo_url text,
  ADD COLUMN IF NOT EXISTS pdf_url text,
  ADD COLUMN IF NOT EXISTS nakladnoy_no text,
  ADD COLUMN IF NOT EXISTS receipt_group_id uuid;

INSERT INTO storage.buckets (id, name, public)
VALUES ('nakladnoy', 'nakladnoy', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "nakladnoy_read_all" ON storage.objects;
CREATE POLICY "nakladnoy_read_all" ON storage.objects FOR SELECT USING (bucket_id = 'nakladnoy');

DROP POLICY IF EXISTS "nakladnoy_insert_all" ON storage.objects;
CREATE POLICY "nakladnoy_insert_all" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'nakladnoy');

DROP POLICY IF EXISTS "nakladnoy_update_all" ON storage.objects;
CREATE POLICY "nakladnoy_update_all" ON storage.objects FOR UPDATE USING (bucket_id = 'nakladnoy');

DROP POLICY IF EXISTS "nakladnoy_delete_all" ON storage.objects;
CREATE POLICY "nakladnoy_delete_all" ON storage.objects FOR DELETE USING (bucket_id = 'nakladnoy');
