
-- Restrict remaining public-role storage SELECT policies to authenticated
DROP POLICY IF EXISTS nakladnoy_read_all ON storage.objects;
CREATE POLICY nakladnoy_read_auth ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'nakladnoy');

DROP POLICY IF EXISTS procurement_public_read ON storage.objects;
CREATE POLICY procurement_read_auth ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'procurement');

-- Restrict bot_messages SELECT from public to authenticated
DROP POLICY IF EXISTS bmsg_read_all ON public.bot_messages;
CREATE POLICY bmsg_read_authenticated ON public.bot_messages
  FOR SELECT TO authenticated
  USING (true);
