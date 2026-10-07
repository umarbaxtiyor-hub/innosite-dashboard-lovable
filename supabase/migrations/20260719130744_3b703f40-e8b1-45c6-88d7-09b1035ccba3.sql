
-- 1. Restrict master_works and master_materials reads to authenticated users only
DROP POLICY IF EXISTS "read_all_mw" ON public.master_works;
DROP POLICY IF EXISTS "read_all_mm" ON public.master_materials;

CREATE POLICY "read_all_mw" ON public.master_works
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "read_all_mm" ON public.master_materials
  FOR SELECT TO authenticated USING (true);

-- 2. Restrict audit_log inserts to service_role only
DROP POLICY IF EXISTS "audit_insert_any" ON public.audit_log;

CREATE POLICY "audit_insert_service_only" ON public.audit_log
  FOR INSERT TO service_role WITH CHECK (true);

-- 3. Restrict zayavka_status_log inserts to service_role only (triggers use SECURITY DEFINER)
DROP POLICY IF EXISTS "zsl_insert_all" ON public.zayavka_status_log;

CREATE POLICY "zsl_insert_service_only" ON public.zayavka_status_log
  FOR INSERT TO service_role WITH CHECK (true);

-- 4. Tie telegram-files uploads to uploader identity
DROP POLICY IF EXISTS "tg_files_insert_authenticated" ON storage.objects;

CREATE POLICY "tg_files_insert_authenticated" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'telegram-files' AND owner = auth.uid());
