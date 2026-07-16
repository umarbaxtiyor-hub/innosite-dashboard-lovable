-- Trigger funksiyalardan barcha rollar EXECUTE huquqini olib tashlash
-- (trigger'lar jadval egasi huquqlarida ishlaydi, foydalanuvchiga GRANT kerak emas)
REVOKE EXECUTE ON FUNCTION public.log_audit_event() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.recompute_zayavka_progress(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_zayavka_from_receipt() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_zayavka_from_work() FROM anon, authenticated, public;

-- tg_user_has_role hech qaysi RLS'da ishlatilmaydi — faqat service_role uchun
REVOKE EXECUTE ON FUNCTION public.tg_user_has_role(bigint, app_role) FROM anon, authenticated, public;
GRANT EXECUTE ON FUNCTION public.tg_user_has_role(bigint, app_role) TO service_role;

-- has_role RLS policy'larda ishlatiladi — authenticated rolga kerak, qoldiramiz
-- Lekin anon va public'dan olib tashlangan bo'lishi kerak (oldingi migratsiyada bajarilgan)
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;