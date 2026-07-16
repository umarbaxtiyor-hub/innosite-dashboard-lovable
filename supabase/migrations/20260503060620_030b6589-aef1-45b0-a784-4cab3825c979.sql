
-- ===== Enums =====
CREATE TYPE public.app_role AS ENUM ('admin', 'project_manager', 'accountant', 'storekeeper', 'foreman', 'viewer');
CREATE TYPE public.variation_status AS ENUM ('Pending', 'Approved', 'Rejected');
CREATE TYPE public.payment_method AS ENUM ('Naqd', 'Bank', 'Karta');

-- ===== Profiles & roles =====
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  telegram_user_id BIGINT UNIQUE,
  telegram_username TEXT,
  phone TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- ===== Domain tables =====
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  location TEXT,
  start_date DATE,
  end_date DATE,
  total_budget NUMERIC(14,2) DEFAULT 0,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contact TEXT,
  phone TEXT,
  inn TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.brigades (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  leader TEXT,
  phone TEXT,
  member_count INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.boq_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT,
  unit TEXT,
  qty NUMERIC(14,3) DEFAULT 0,
  rate NUMERIC(14,2) DEFAULT 0,
  planned_cost NUMERIC(14,2) DEFAULT 0,
  actual_cost NUMERIC(14,2) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, code)
);

CREATE TABLE public.material_receipts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  boq_item_id UUID REFERENCES public.boq_items(id) ON DELETE SET NULL,
  boq_code TEXT,
  material_name TEXT NOT NULL,
  qty NUMERIC(14,3) NOT NULL,
  unit TEXT,
  unit_price NUMERIC(14,2) NOT NULL,
  total_price NUMERIC(14,2) GENERATED ALWAYS AS (qty * unit_price) STORED,
  supplier_id UUID REFERENCES public.suppliers(id) ON DELETE SET NULL,
  supplier_name TEXT,
  waybill_url TEXT,
  invoice_url TEXT,
  received_at DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id),
  telegram_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.work_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  boq_item_id UUID REFERENCES public.boq_items(id) ON DELETE SET NULL,
  boq_code TEXT,
  work_type TEXT NOT NULL,
  qty_done NUMERIC(14,3) NOT NULL,
  unit TEXT,
  unit_price NUMERIC(14,2) DEFAULT 0,
  total_value NUMERIC(14,2) GENERATED ALWAYS AS (qty_done * unit_price) STORED,
  brigade_id UUID REFERENCES public.brigades(id) ON DELETE SET NULL,
  brigade_name TEXT,
  photo_url TEXT,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id),
  telegram_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  boq_item_id UUID REFERENCES public.boq_items(id) ON DELETE SET NULL,
  boq_code TEXT,
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(14,2) NOT NULL,
  payment_method public.payment_method NOT NULL DEFAULT 'Naqd',
  paid_by TEXT,
  receipt_url TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id),
  telegram_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.variations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  boq_item_id UUID REFERENCES public.boq_items(id) ON DELETE SET NULL,
  boq_code TEXT,
  title TEXT NOT NULL,
  reason TEXT,
  qty NUMERIC(14,3),
  unit TEXT,
  amount NUMERIC(14,2) NOT NULL,
  attachment_url TEXT,
  status public.variation_status NOT NULL DEFAULT 'Pending',
  requested_by UUID REFERENCES auth.users(id),
  requested_by_name TEXT,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  telegram_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  related_table TEXT,
  related_id UUID,
  file_url TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  uploaded_by UUID REFERENCES auth.users(id),
  telegram_user_id BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== Indexes =====
CREATE INDEX idx_boq_project ON public.boq_items(project_id);
CREATE INDEX idx_mat_project ON public.material_receipts(project_id);
CREATE INDEX idx_work_project ON public.work_progress(project_id);
CREATE INDEX idx_exp_project ON public.expenses(project_id);
CREATE INDEX idx_var_project ON public.variations(project_id);
CREATE INDEX idx_exp_date ON public.expenses(expense_date);

-- ===== RLS =====
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brigades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.boq_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.variations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Read access for everyone (dashboard is internal viewer; tighten later when auth added)
CREATE POLICY "read_all_profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "read_all_roles" ON public.user_roles FOR SELECT USING (true);
CREATE POLICY "read_all_projects" ON public.projects FOR SELECT USING (true);
CREATE POLICY "read_all_suppliers" ON public.suppliers FOR SELECT USING (true);
CREATE POLICY "read_all_brigades" ON public.brigades FOR SELECT USING (true);
CREATE POLICY "read_all_boq" ON public.boq_items FOR SELECT USING (true);
CREATE POLICY "read_all_mat" ON public.material_receipts FOR SELECT USING (true);
CREATE POLICY "read_all_work" ON public.work_progress FOR SELECT USING (true);
CREATE POLICY "read_all_exp" ON public.expenses FOR SELECT USING (true);
CREATE POLICY "read_all_var" ON public.variations FOR SELECT USING (true);
CREATE POLICY "read_all_docs" ON public.documents FOR SELECT USING (true);

-- Admin write policies (other writes will go through service-role from Telegram bot edge function)
CREATE POLICY "admin_all_projects" ON public.projects FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_all_suppliers" ON public.suppliers FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_all_brigades" ON public.brigades FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_all_boq" ON public.boq_items FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "admin_all_roles" ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "self_profile" ON public.profiles FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Approve variations: admin or project_manager
CREATE POLICY "approve_variations" ON public.variations FOR UPDATE
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'project_manager'));
