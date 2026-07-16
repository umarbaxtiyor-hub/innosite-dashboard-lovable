-- 1) audit_log'ga xato ustunlari
ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS error_sqlstate text,
  ADD COLUMN IF NOT EXISTS error_context text;

-- 2) Trigger xatosini xavfsiz yozadigan yordamchi
CREATE OR REPLACE FUNCTION public.log_trigger_error(
  _table_name text,
  _action text,
  _record_id uuid,
  _err_message text,
  _err_sqlstate text,
  _err_context text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log
    (table_name, record_id, action, error_message, error_sqlstate, error_context)
  VALUES
    (_table_name, _record_id, 'TRIGGER_ERROR:' || _action, _err_message, _err_sqlstate, _err_context);
EXCEPTION WHEN OTHERS THEN
  -- audit logning o'zi ham yiqilsa, jim ketamiz
  NULL;
END $$;

REVOKE EXECUTE ON FUNCTION public.log_trigger_error(text,text,uuid,text,text,text) FROM anon, authenticated, public;

-- 3) log_audit_event'ni EXCEPTION bilan o'rab qayta yaratamiz
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_old jsonb; v_new jsonb; v_record_id uuid; v_changed text[];
  v_tg_id bigint; v_uid uuid; v_email text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD); v_record_id := (v_old->>'id')::uuid;
    v_tg_id := NULLIF(v_old->>'telegram_user_id','')::bigint;
  ELSIF TG_OP = 'INSERT' THEN
    v_new := to_jsonb(NEW); v_record_id := (v_new->>'id')::uuid;
    v_tg_id := NULLIF(v_new->>'telegram_user_id','')::bigint;
  ELSE
    v_old := to_jsonb(OLD); v_new := to_jsonb(NEW); v_record_id := (v_new->>'id')::uuid;
    v_tg_id := NULLIF(v_new->>'telegram_user_id','')::bigint;
    SELECT array_agg(key) INTO v_changed
      FROM jsonb_each(v_new) n WHERE n.value IS DISTINCT FROM (v_old->n.key);
    IF v_changed IS NULL OR array_length(v_changed,1) IS NULL THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  BEGIN v_uid := auth.uid(); EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;
  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  END IF;

  INSERT INTO public.audit_log
    (table_name, record_id, action, old_data, new_data, changed_fields, user_id, user_email, telegram_user_id)
  VALUES
    (TG_TABLE_NAME, v_record_id, TG_OP, v_old, v_new, v_changed, v_uid, v_email, v_tg_id);

  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_trigger_error(
    TG_TABLE_NAME, TG_OP, v_record_id, SQLERRM, SQLSTATE,
    'log_audit_event failed'
  );
  RETURN COALESCE(NEW, OLD);
END;
$function$;

-- 4) recompute_zayavka_progress'ni ham EXCEPTION bilan o'rash
CREATE OR REPLACE FUNCTION public.recompute_zayavka_progress(_zid uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  z_kind text; z_qty numeric; total_recv numeric := 0;
  cur_status zayavka_workflow_status; new_status zayavka_workflow_status;
BEGIN
  IF _zid IS NULL THEN RETURN; END IF;
  SELECT kind::text, COALESCE(qty,0), workflow_status
    INTO z_kind, z_qty, cur_status
  FROM public.project_zayavka WHERE id = _zid;
  IF NOT FOUND THEN RETURN; END IF;

  IF z_kind = 'work' THEN
    SELECT COALESCE(SUM(qty_done),0) INTO total_recv FROM public.work_progress WHERE zayavka_id = _zid;
  ELSE
    SELECT COALESCE(SUM(qty),0) INTO total_recv FROM public.material_receipts WHERE zayavka_id = _zid;
  END IF;

  new_status := CASE WHEN total_recv > 0 THEN 'delivered'::zayavka_workflow_status ELSE cur_status END;

  UPDATE public.project_zayavka
     SET qty_received = total_recv, workflow_status = new_status
   WHERE id = _zid;
EXCEPTION WHEN OTHERS THEN
  PERFORM public.log_trigger_error(
    'project_zayavka', 'RECOMPUTE', _zid, SQLERRM, SQLSTATE,
    'recompute_zayavka_progress failed'
  );
END;
$function$;

-- 5) Xavfsizlik audit view'i
CREATE OR REPLACE VIEW public.v_security_audit
WITH (security_invoker = true) AS
WITH tbl AS (
  SELECT
    c.relname AS table_name,
    c.relrowsecurity AS rls_enabled,
    (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS policy_count,
    (SELECT count(*) FROM pg_policies p
       WHERE p.schemaname='public' AND p.tablename=c.relname
         AND p.cmd <> 'SELECT'
         AND (p.qual = 'true' OR p.with_check = 'true')
    ) AS permissive_write_policies
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
)
SELECT
  table_name,
  rls_enabled,
  policy_count,
  permissive_write_policies,
  CASE
    WHEN NOT rls_enabled THEN 'CRITICAL: RLS off'
    WHEN policy_count = 0 THEN 'WARN: No policies'
    WHEN permissive_write_policies > 0 THEN 'WARN: Permissive write'
    ELSE 'OK'
  END AS status
FROM tbl
ORDER BY
  CASE WHEN NOT rls_enabled THEN 0
       WHEN policy_count = 0 THEN 1
       WHEN permissive_write_policies > 0 THEN 2
       ELSE 3 END,
  table_name;

REVOKE ALL ON public.v_security_audit FROM anon, public;
GRANT SELECT ON public.v_security_audit TO authenticated;

-- SECURITY DEFINER funksiyalar grant'larini ko'rsatuvchi view
CREATE OR REPLACE VIEW public.v_security_definer_grants
WITH (security_invoker = true) AS
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  array_agg(DISTINCT a.privilege_type || ':' || a.grantee ORDER BY a.privilege_type || ':' || a.grantee) AS grants
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
LEFT JOIN information_schema.routine_privileges a
  ON a.routine_schema = n.nspname AND a.routine_name = p.proname
WHERE n.nspname = 'public' AND p.prosecdef = true
GROUP BY p.proname, p.oid
ORDER BY p.proname;

REVOKE ALL ON public.v_security_definer_grants FROM anon, public;
GRANT SELECT ON public.v_security_definer_grants TO authenticated;