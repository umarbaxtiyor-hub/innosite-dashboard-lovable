
DROP POLICY IF EXISTS "procurement_read_auth" ON storage.objects;
DROP POLICY IF EXISTS "nakladnoy_read_auth" ON storage.objects;
DROP POLICY IF EXISTS "tg_files_read_auth" ON storage.objects;

CREATE POLICY "procurement_read_scoped" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'procurement' AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'finans')
    OR public.has_role(auth.uid(), 'buxgalter')
    OR public.has_role(auth.uid(), 'pm')
    OR public.has_role(auth.uid(), 'omborchi')
  )
);

CREATE POLICY "nakladnoy_read_scoped" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'nakladnoy' AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'finans')
    OR public.has_role(auth.uid(), 'buxgalter')
    OR public.has_role(auth.uid(), 'pm')
    OR public.has_role(auth.uid(), 'omborchi')
  )
);

CREATE POLICY "tg_files_read_scoped" ON storage.objects
FOR SELECT TO authenticated
USING (
  bucket_id = 'telegram-files' AND (
    owner = auth.uid()
    OR public.has_role(auth.uid(), 'admin')
    OR public.has_role(auth.uid(), 'ceo')
    OR public.has_role(auth.uid(), 'finans')
  )
);
