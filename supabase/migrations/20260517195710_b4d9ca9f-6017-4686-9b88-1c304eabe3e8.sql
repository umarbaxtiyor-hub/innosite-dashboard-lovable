-- Revoke EXECUTE on internal SECURITY DEFINER trigger/helper functions
-- from anon, authenticated and PUBLIC. These should only be invoked by
-- triggers or service_role, never directly via the API.

REVOKE EXECUTE ON FUNCTION public.log_audit_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_trigger_error(text, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.recompute_zayavka_progress(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_zayavka_from_receipt() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_recompute_zayavka_from_work() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;

-- Keep has_role and tg_user_has_role executable: they are used inside RLS
-- policies which require the calling role to have EXECUTE.
-- norm_name is harmless (pure text normalizer) but lock it down too.
REVOKE EXECUTE ON FUNCTION public.norm_name(text) FROM PUBLIC, anon;