-- 1. Drop anon read policy on storage buckets
DROP POLICY IF EXISTS "buckets_anon_read_by_key" ON storage.objects;

-- 2. app_settings: restrict SELECT to authenticated
DROP POLICY IF EXISTS app_settings_read_all ON public.app_settings;
CREATE POLICY app_settings_read_auth
  ON public.app_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. expense_categories: restrict SELECT to authenticated
DROP POLICY IF EXISTS ec_read_all ON public.expense_categories;
CREATE POLICY ec_read_auth
  ON public.expense_categories
  FOR SELECT
  TO authenticated
  USING (true);

-- 4. expense_units: restrict SELECT to authenticated
DROP POLICY IF EXISTS eu_read_all ON public.expense_units;
CREATE POLICY eu_read_auth
  ON public.expense_units
  FOR SELECT
  TO authenticated
  USING (true);