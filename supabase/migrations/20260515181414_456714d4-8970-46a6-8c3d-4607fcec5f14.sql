
-- Project geofence (markaz lat/lng + radius metr)
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS geo_lat double precision,
  ADD COLUMN IF NOT EXISTS geo_lng double precision,
  ADD COLUMN IF NOT EXISTS geo_radius_m integer NOT NULL DEFAULT 200;

-- Davomatga izoh + geofence ma'lumotlari
ALTER TABLE public.employee_attendance
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS is_within_geofence boolean,
  ADD COLUMN IF NOT EXISTS distance_m numeric;

-- Standart ish boshlanish vaqti (kechikishni hisoblash uchun)
INSERT INTO public.app_settings (key, value, updated_at)
VALUES ('work_start_time', '09:00', now())
ON CONFLICT (key) DO NOTHING;
