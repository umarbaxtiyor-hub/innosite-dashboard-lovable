
CREATE TABLE IF NOT EXISTS public.telegram_sessions (
  chat_id BIGINT PRIMARY KEY,
  telegram_user_id BIGINT NOT NULL,
  username TEXT,
  flow TEXT,
  step TEXT,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.telegram_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin_sessions" ON public.telegram_sessions FOR ALL
  USING (has_role(auth.uid(),'admin'::app_role)) WITH CHECK (has_role(auth.uid(),'admin'::app_role));

INSERT INTO storage.buckets (id, name, public) VALUES ('telegram-files','telegram-files', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "tg_files_read" ON storage.objects FOR SELECT USING (bucket_id='telegram-files');
CREATE POLICY "tg_files_write" ON storage.objects FOR INSERT WITH CHECK (bucket_id='telegram-files');
