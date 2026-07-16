-- Buxalteriya oqimi: prorab so'raydi -> PM tasdiq -> snabjenchi shartnoma -> nakladnoy -> faktura -> PM to'lov so'rovi -> CEO tasdiq

-- PM/CEO tasdiq holatlari va kim qachon
ALTER TABLE public.purchase_orders
  ADD COLUMN IF NOT EXISTS pm_status text,         -- pending|approved|rejected
  ADD COLUMN IF NOT EXISTS pm_at timestamptz,
  ADD COLUMN IF NOT EXISTS pm_user_id bigint,
  ADD COLUMN IF NOT EXISTS pm_note text,
  ADD COLUMN IF NOT EXISTS ceo_status text,        -- pending|approved|rejected
  ADD COLUMN IF NOT EXISTS ceo_at timestamptz,
  ADD COLUMN IF NOT EXISTS ceo_user_id bigint,
  ADD COLUMN IF NOT EXISTS ceo_note text,
  ADD COLUMN IF NOT EXISTS payment_request_amount numeric,
  ADD COLUMN IF NOT EXISTS payment_request_to text,
  ADD COLUMN IF NOT EXISTS payment_request_at timestamptz,
  ADD COLUMN IF NOT EXISTS prorab_user_id bigint,
  ADD COLUMN IF NOT EXISTS prorab_username text;

-- Foydalanuvchi rollari uchun yordamchi: telegram_user_id ga ko'ra rolni topish
-- profiles.telegram_user_id mavjud, user_roles.user_id = profiles.id
CREATE OR REPLACE FUNCTION public.tg_user_has_role(_tg_id bigint, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    WHERE p.telegram_user_id = _tg_id AND ur.role = _role
  )
$$;