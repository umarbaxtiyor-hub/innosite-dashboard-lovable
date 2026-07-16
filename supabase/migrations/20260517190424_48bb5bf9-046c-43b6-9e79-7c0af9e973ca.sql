
-- 1) audit_log + zayavka_status_log: triggerlar (SECURITY DEFINER) ishlatadi, anon foydalanuvchi yoza olmasligi kerak
DROP POLICY IF EXISTS audit_insert_any ON public.audit_log;
CREATE POLICY audit_insert_any ON public.audit_log FOR INSERT TO authenticated, service_role WITH CHECK (true);

DROP POLICY IF EXISTS zsl_insert_all ON public.zayavka_status_log;
CREATE POLICY zsl_insert_all ON public.zayavka_status_log FOR INSERT TO authenticated, service_role WITH CHECK (true);

-- 2) SECURITY DEFINER funksiyalarni anon foydalanuvchilardan yopish
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.tg_user_has_role(bigint, app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.tg_user_has_role(bigint, app_role) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.recompute_zayavka_progress(uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.recompute_zayavka_progress(uuid) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.log_audit_event() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, public;

-- 3) Storage buckets: umumiy listing siyosatini olib tashlash; faqat authenticated foydalanuvchilar ko'rishi mumkin
-- Avval mavjud keng siyosatlarni tozalaymiz (turli nomlar bo'lishi mumkin), keyin aniq qoidalar qo'shamiz
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname IN (
        'Public read telegram-files','telegram-files public read','telegram-files read',
        'Public read procurement','procurement public read','procurement read',
        'Public read nakladnoy','nakladnoy public read','nakladnoy read',
        'Give users authenticated access to folder','Public Access'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects;', pol.policyname);
  END LOOP;
END $$;

-- Authenticated foydalanuvchilar 3 bucket'da SELECT/INSERT/UPDATE/DELETE qila oladi
DROP POLICY IF EXISTS "telegram_files_authenticated_all" ON storage.objects;
CREATE POLICY "telegram_files_authenticated_all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id IN ('telegram-files','procurement','nakladnoy'))
  WITH CHECK (bucket_id IN ('telegram-files','procurement','nakladnoy'));

-- Bucket'larni private qilamiz (faqat signed URL orqali ochiladi; allaqachon yuklangan ommaviy URL'lar uchun pastda istisno)
UPDATE storage.buckets SET public = false WHERE id IN ('telegram-files','procurement','nakladnoy');

-- Eski yuklangan fayllar ham ishlashi uchun anonim SELECT'ni saqlaymiz (faqat o'qish, listing emas)
-- Storage anonymous SELECT-by-key (full path) ishlashi uchun:
DROP POLICY IF EXISTS "buckets_anon_read_by_key" ON storage.objects;
CREATE POLICY "buckets_anon_read_by_key" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id IN ('telegram-files','procurement','nakladnoy'));
