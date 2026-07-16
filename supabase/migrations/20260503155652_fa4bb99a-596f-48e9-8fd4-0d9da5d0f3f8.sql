CREATE TYPE public.brigade_payment_kind AS ENUM ('avans', 'yakuniy', 'boshqa');

CREATE TABLE public.brigade_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL,
  brigade_id uuid NOT NULL,
  brigade_name text,
  kind public.brigade_payment_kind NOT NULL DEFAULT 'avans',
  amount numeric NOT NULL,
  payment_date date NOT NULL DEFAULT CURRENT_DATE,
  note text,
  telegram_user_id bigint,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bp_brigade ON public.brigade_payments(brigade_id);
CREATE INDEX idx_bp_project ON public.brigade_payments(project_id);

ALTER TABLE public.brigade_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY read_all_bp ON public.brigade_payments FOR SELECT USING (true);
CREATE POLICY admin_all_bp ON public.brigade_payments FOR ALL
  USING (has_role(auth.uid(),'admin'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role));
