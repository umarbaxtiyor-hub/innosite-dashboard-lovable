DELETE FROM public.role_permissions WHERE path = '/';
INSERT INTO public.role_permissions (path, role) VALUES
  ('/', 'admin'),
  ('/', 'ceo'),
  ('/', 'finans'),
  ('/', 'pm');