-- Davomat (attendance) table for employees checking in/out via Telegram
CREATE TABLE IF NOT EXISTS public.employee_attendance (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID REFERENCES public.employees(id) ON DELETE SET NULL,
  employee_name TEXT,
  project_id UUID,
  telegram_user_id BIGINT,
  kind TEXT NOT NULL CHECK (kind IN ('check_in','check_out')),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  address TEXT,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON public.employee_attendance(employee_id, attendance_date);
CREATE INDEX IF NOT EXISTS idx_attendance_date ON public.employee_attendance(attendance_date DESC);

ALTER TABLE public.employee_attendance ENABLE ROW LEVEL SECURITY;

CREATE POLICY "att_read_all" ON public.employee_attendance FOR SELECT USING (true);
CREATE POLICY "att_insert_all" ON public.employee_attendance FOR INSERT WITH CHECK (true);
CREATE POLICY "att_update_all" ON public.employee_attendance FOR UPDATE USING (true);
CREATE POLICY "att_delete_all" ON public.employee_attendance FOR DELETE USING (true);