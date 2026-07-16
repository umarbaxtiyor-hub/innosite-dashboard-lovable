-- Zayavka status o'zgarishlari uchun log jadvali
CREATE TABLE IF NOT EXISTS public.zayavka_status_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zayavka_id uuid NOT NULL REFERENCES public.project_zayavka(id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  note text,
  changed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_zsl_zayavka ON public.zayavka_status_log(zayavka_id, created_at DESC);

ALTER TABLE public.zayavka_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY zsl_read_all ON public.zayavka_status_log FOR SELECT USING (true);
CREATE POLICY zsl_insert_all ON public.zayavka_status_log FOR INSERT WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.zayavka_status_log;