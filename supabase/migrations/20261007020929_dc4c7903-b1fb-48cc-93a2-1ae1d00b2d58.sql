CREATE TABLE public.sheet_category_map (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('expense','income')),
  source_category text NOT NULL,
  sheet_category text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sheet_category_map_uq ON public.sheet_category_map (kind, lower(btrim(source_category)));
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sheet_category_map TO authenticated;
GRANT ALL ON public.sheet_category_map TO service_role;
ALTER TABLE public.sheet_category_map ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catmap admin finans read" ON public.sheet_category_map FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'));
CREATE POLICY "catmap admin write" ON public.sheet_category_map FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'));
CREATE TRIGGER catmap_touch BEFORE UPDATE ON public.sheet_category_map FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.sheet_category_map FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

INSERT INTO public.sheet_category_map (kind, source_category, sheet_category)
SELECT 'expense', v, v FROM unnest(ARRAY['Transfer','Oziq-ovqat','Texnika xavfsizligi','Yoqilg‘i','Qurilish materiallari','Yetkazib berish','Ijara','oylik','Usta','Texnika','Boshqa']) v
ON CONFLICT DO NOTHING;

CREATE TABLE public.sheet_sync_warnings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  record_id uuid NOT NULL,
  kind text NOT NULL,
  detail text,
  occurrences integer NOT NULL DEFAULT 1,
  resolved boolean NOT NULL DEFAULT false,
  first_seen timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_table, record_id, kind)
);
GRANT SELECT ON public.sheet_sync_warnings TO authenticated;
GRANT ALL ON public.sheet_sync_warnings TO service_role;
ALTER TABLE public.sheet_sync_warnings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "warn admin finans read" ON public.sheet_sync_warnings FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'));

CREATE TABLE public.sheet_legacy_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  spreadsheet_id text NOT NULL,
  tab text NOT NULL,
  sheet_row integer NOT NULL,
  source_table text NOT NULL CHECK (source_table IN ('expenses','incomes')),
  record_id uuid NOT NULL,
  row_snapshot jsonb,
  linked_by uuid,
  linked_by_email text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (spreadsheet_id, tab, source_table, record_id),
  UNIQUE (spreadsheet_id, tab, sheet_row)
);
GRANT SELECT ON public.sheet_legacy_links TO authenticated;
GRANT ALL ON public.sheet_legacy_links TO service_role;
ALTER TABLE public.sheet_legacy_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "legacy admin finans read" ON public.sheet_legacy_links FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'));
CREATE TRIGGER audit_trg AFTER INSERT OR UPDATE OR DELETE ON public.sheet_legacy_links FOR EACH ROW EXECUTE FUNCTION public.log_audit_event();

CREATE TABLE public.bot_sheet_outbox (
  id uuid PRIMARY KEY,
  kind text NOT NULL CHECK (kind IN ('fuel','hr','dpr')),
  dedup_key text NOT NULL,
  spreadsheet_id text NOT NULL,
  tab text NOT NULL,
  width integer NOT NULL,
  rows jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  written_at timestamptz
);
GRANT SELECT ON public.bot_sheet_outbox TO authenticated;
GRANT ALL ON public.bot_sheet_outbox TO service_role;
ALTER TABLE public.bot_sheet_outbox ENABLE ROW LEVEL SECURITY;
CREATE POLICY "outbox admin finans read" ON public.bot_sheet_outbox FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans'));

CREATE TABLE public.ai_insights (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint text NOT NULL UNIQUE,
  rule_key text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('critical','warning','info')),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  title text NOT NULL,
  metric text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  source text NOT NULL DEFAULT 'rules',
  recommended_action text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);
GRANT SELECT ON public.ai_insights TO authenticated;
GRANT ALL ON public.ai_insights TO service_role;
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insights mgmt read" ON public.ai_insights FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'finans') OR public.has_role(auth.uid(),'ceo'));