CREATE TABLE public.user_bot_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  button_key text NOT NULL CHECK (button_key IN ('project', 'fuel', 'ledger', 'dpr', 'hr', 'innoai')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, button_key)
);

GRANT SELECT ON public.user_bot_permissions TO authenticated;
GRANT ALL ON public.user_bot_permissions TO service_role;

ALTER TABLE public.user_bot_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own bot buttons"
ON public.user_bot_permissions
FOR SELECT
TO authenticated
USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert bot buttons"
ON public.user_bot_permissions
FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update bot buttons"
ON public.user_bot_permissions
FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete bot buttons"
ON public.user_bot_permissions
FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.user_bot_permissions (user_id, button_key)
SELECT ur.user_id, v.button_key
FROM public.user_roles ur
CROSS JOIN (VALUES ('project'), ('fuel'), ('ledger'), ('dpr'), ('hr'), ('innoai')) AS v(button_key)
WHERE ur.role IN ('admin', 'finans')
ON CONFLICT (user_id, button_key) DO NOTHING;

INSERT INTO public.user_bot_permissions (user_id, button_key)
SELECT ur.user_id, 'innoai'
FROM public.user_roles ur
WHERE ur.role = 'ceo'
ON CONFLICT (user_id, button_key) DO NOTHING;