REVOKE EXECUTE ON FUNCTION public.sheets_sync_url() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_trigger_error(text, text, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sheets_sync_url() TO service_role;
GRANT EXECUTE ON FUNCTION public.log_trigger_error(text, text, uuid, text, text, text) TO service_role;