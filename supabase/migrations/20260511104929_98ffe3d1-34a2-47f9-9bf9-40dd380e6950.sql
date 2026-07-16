-- Audit log table
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_fields text[],
  user_id uuid,
  user_email text,
  telegram_user_id bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_created_at ON public.audit_log (created_at DESC);
CREATE INDEX idx_audit_log_table ON public.audit_log (table_name, created_at DESC);
CREATE INDEX idx_audit_log_record ON public.audit_log (record_id);
CREATE INDEX idx_audit_log_user ON public.audit_log (user_id);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_admin_select" ON public.audit_log
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "audit_insert_any" ON public.audit_log
  FOR INSERT TO public WITH CHECK (true);

-- Trigger function
CREATE OR REPLACE FUNCTION public.log_audit_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old jsonb;
  v_new jsonb;
  v_record_id uuid;
  v_changed text[];
  v_tg_id bigint;
  v_uid uuid;
  v_email text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_old := to_jsonb(OLD);
    v_new := NULL;
    v_record_id := (v_old->>'id')::uuid;
    v_tg_id := NULLIF(v_old->>'telegram_user_id','')::bigint;
  ELSIF TG_OP = 'INSERT' THEN
    v_old := NULL;
    v_new := to_jsonb(NEW);
    v_record_id := (v_new->>'id')::uuid;
    v_tg_id := NULLIF(v_new->>'telegram_user_id','')::bigint;
  ELSE
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
    v_record_id := (v_new->>'id')::uuid;
    v_tg_id := NULLIF(v_new->>'telegram_user_id','')::bigint;
    SELECT array_agg(key) INTO v_changed
    FROM jsonb_each(v_new) n
    WHERE n.value IS DISTINCT FROM (v_old->n.key);
    IF v_changed IS NULL OR array_length(v_changed,1) IS NULL THEN
      RETURN COALESCE(NEW, OLD);
    END IF;
  END IF;

  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN OTHERS THEN v_uid := NULL; END;

  IF v_uid IS NOT NULL THEN
    SELECT email INTO v_email FROM auth.users WHERE id = v_uid;
  END IF;

  INSERT INTO public.audit_log
    (table_name, record_id, action, old_data, new_data, changed_fields, user_id, user_email, telegram_user_id)
  VALUES
    (TG_TABLE_NAME, v_record_id, TG_OP, v_old, v_new, v_changed, v_uid, v_email, v_tg_id);

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Attach triggers to relevant tables
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'material_receipts','work_progress','expenses','brigade_payments',
    'project_zayavka','projects','brigades','brigade_members',
    'employees','employee_payments','suppliers','supplier_contracts',
    'firms','boq_items','variations','master_materials','master_works',
    'expense_categories','user_roles','user_firm_access','user_project_access'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_trg ON public.%I', t);
    EXECUTE format('CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.log_audit_event()', t);
  END LOOP;
END $$;