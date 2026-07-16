
-- ============================================================
-- PHASE 1: Safe schema improvements (no UI changes)
-- 1) New cost-tracking columns on expenses
-- 2) Indexes for reporting performance
-- 3) Foreign keys (validated: 0 orphans across all relations)
-- ============================================================

-- 1) New columns on expenses
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS brigade_id uuid,
  ADD COLUMN IF NOT EXISTS work_progress_id uuid,
  ADD COLUMN IF NOT EXISTS master_work_id uuid;

-- 2) Reporting indexes
CREATE INDEX IF NOT EXISTS idx_wp_boq_item        ON public.work_progress(boq_item_id);
CREATE INDEX IF NOT EXISTS idx_wp_brigade         ON public.work_progress(brigade_id);
CREATE INDEX IF NOT EXISTS idx_wp_master_work     ON public.work_progress(master_work_id);
CREATE INDEX IF NOT EXISTS idx_wp_project_date    ON public.work_progress(project_id, work_date);
CREATE INDEX IF NOT EXISTS idx_wp_zayavka         ON public.work_progress(zayavka_id);

CREATE INDEX IF NOT EXISTS idx_mr_boq_item        ON public.material_receipts(boq_item_id);
CREATE INDEX IF NOT EXISTS idx_mr_master_material ON public.material_receipts(master_material_id);
CREATE INDEX IF NOT EXISTS idx_mr_project_date    ON public.material_receipts(project_id, received_at);
CREATE INDEX IF NOT EXISTS idx_mr_zayavka         ON public.material_receipts(zayavka_id);
CREATE INDEX IF NOT EXISTS idx_mr_supplier        ON public.material_receipts(supplier_id);

CREATE INDEX IF NOT EXISTS idx_mu_boq_item        ON public.material_usage(boq_item_id);
CREATE INDEX IF NOT EXISTS idx_mu_brigade         ON public.material_usage(brigade_id);
CREATE INDEX IF NOT EXISTS idx_mu_master_material ON public.material_usage(master_material_id);
CREATE INDEX IF NOT EXISTS idx_mu_project_date    ON public.material_usage(project_id, used_at);
CREATE INDEX IF NOT EXISTS idx_mu_zayavka         ON public.material_usage(zayavka_id);

CREATE INDEX IF NOT EXISTS idx_exp_boq_item       ON public.expenses(boq_item_id);
CREATE INDEX IF NOT EXISTS idx_exp_brigade        ON public.expenses(brigade_id);
CREATE INDEX IF NOT EXISTS idx_exp_work_progress  ON public.expenses(work_progress_id);
CREATE INDEX IF NOT EXISTS idx_exp_master_work    ON public.expenses(master_work_id);
CREATE INDEX IF NOT EXISTS idx_exp_project_date   ON public.expenses(project_id, expense_date);
CREATE INDEX IF NOT EXISTS idx_exp_zayavka        ON public.expenses(zayavka_id);

CREATE INDEX IF NOT EXISTS idx_bp_brigade_date    ON public.brigade_payments(brigade_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_bp_project_date    ON public.brigade_payments(project_id, payment_date);

CREATE INDEX IF NOT EXISTS idx_boq_project        ON public.boq_items(project_id);
CREATE INDEX IF NOT EXISTS idx_pz_project         ON public.project_zayavka(project_id);
CREATE INDEX IF NOT EXISTS idx_pz_boq_item        ON public.project_zayavka(boq_item_id);

-- 3) Foreign keys (ON DELETE SET NULL for optional links, CASCADE for ownership)

-- work_progress
ALTER TABLE public.work_progress
  ADD CONSTRAINT wp_project_fk      FOREIGN KEY (project_id)     REFERENCES public.projects(id)        ON DELETE CASCADE,
  ADD CONSTRAINT wp_boq_item_fk     FOREIGN KEY (boq_item_id)    REFERENCES public.boq_items(id)       ON DELETE SET NULL,
  ADD CONSTRAINT wp_brigade_fk      FOREIGN KEY (brigade_id)     REFERENCES public.brigades(id)        ON DELETE SET NULL,
  ADD CONSTRAINT wp_master_work_fk  FOREIGN KEY (master_work_id) REFERENCES public.master_works(id)    ON DELETE SET NULL,
  ADD CONSTRAINT wp_zayavka_fk      FOREIGN KEY (zayavka_id)     REFERENCES public.project_zayavka(id) ON DELETE SET NULL;

-- material_receipts
ALTER TABLE public.material_receipts
  ADD CONSTRAINT mr_project_fk         FOREIGN KEY (project_id)         REFERENCES public.projects(id)         ON DELETE CASCADE,
  ADD CONSTRAINT mr_boq_item_fk        FOREIGN KEY (boq_item_id)        REFERENCES public.boq_items(id)        ON DELETE SET NULL,
  ADD CONSTRAINT mr_master_material_fk FOREIGN KEY (master_material_id) REFERENCES public.master_materials(id) ON DELETE SET NULL,
  ADD CONSTRAINT mr_supplier_fk        FOREIGN KEY (supplier_id)        REFERENCES public.suppliers(id)        ON DELETE SET NULL,
  ADD CONSTRAINT mr_zayavka_fk         FOREIGN KEY (zayavka_id)         REFERENCES public.project_zayavka(id)  ON DELETE SET NULL;

-- material_usage
ALTER TABLE public.material_usage
  ADD CONSTRAINT mu_project_fk         FOREIGN KEY (project_id)         REFERENCES public.projects(id)         ON DELETE CASCADE,
  ADD CONSTRAINT mu_boq_item_fk        FOREIGN KEY (boq_item_id)        REFERENCES public.boq_items(id)        ON DELETE SET NULL,
  ADD CONSTRAINT mu_brigade_fk         FOREIGN KEY (brigade_id)         REFERENCES public.brigades(id)         ON DELETE SET NULL,
  ADD CONSTRAINT mu_master_material_fk FOREIGN KEY (master_material_id) REFERENCES public.master_materials(id) ON DELETE SET NULL,
  ADD CONSTRAINT mu_zayavka_fk         FOREIGN KEY (zayavka_id)         REFERENCES public.project_zayavka(id)  ON DELETE SET NULL;

-- expenses (project_id is nullable, so SET NULL is safe)
ALTER TABLE public.expenses
  ADD CONSTRAINT exp_project_fk       FOREIGN KEY (project_id)       REFERENCES public.projects(id)         ON DELETE SET NULL,
  ADD CONSTRAINT exp_boq_item_fk      FOREIGN KEY (boq_item_id)      REFERENCES public.boq_items(id)        ON DELETE SET NULL,
  ADD CONSTRAINT exp_zayavka_fk       FOREIGN KEY (zayavka_id)       REFERENCES public.project_zayavka(id)  ON DELETE SET NULL,
  ADD CONSTRAINT exp_brigade_fk       FOREIGN KEY (brigade_id)       REFERENCES public.brigades(id)         ON DELETE SET NULL,
  ADD CONSTRAINT exp_work_progress_fk FOREIGN KEY (work_progress_id) REFERENCES public.work_progress(id)    ON DELETE SET NULL,
  ADD CONSTRAINT exp_master_work_fk   FOREIGN KEY (master_work_id)   REFERENCES public.master_works(id)     ON DELETE SET NULL;

-- brigade_payments
ALTER TABLE public.brigade_payments
  ADD CONSTRAINT bp_brigade_fk FOREIGN KEY (brigade_id) REFERENCES public.brigades(id) ON DELETE CASCADE,
  ADD CONSTRAINT bp_project_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- brigade_members
ALTER TABLE public.brigade_members
  ADD CONSTRAINT bmem_brigade_fk FOREIGN KEY (brigade_id) REFERENCES public.brigades(id) ON DELETE CASCADE;

-- employee_payments
ALTER TABLE public.employee_payments
  ADD CONSTRAINT ep_employee_fk FOREIGN KEY (employee_id) REFERENCES public.employees(id) ON DELETE CASCADE,
  ADD CONSTRAINT ep_project_fk  FOREIGN KEY (project_id)  REFERENCES public.projects(id)  ON DELETE SET NULL;

-- boq_items
ALTER TABLE public.boq_items
  ADD CONSTRAINT boq_project_fk FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;

-- project_zayavka
ALTER TABLE public.project_zayavka
  ADD CONSTRAINT pz_project_fk         FOREIGN KEY (project_id)         REFERENCES public.projects(id)         ON DELETE CASCADE,
  ADD CONSTRAINT pz_boq_item_fk        FOREIGN KEY (boq_item_id)        REFERENCES public.boq_items(id)        ON DELETE SET NULL,
  ADD CONSTRAINT pz_master_material_fk FOREIGN KEY (master_material_id) REFERENCES public.master_materials(id) ON DELETE SET NULL,
  ADD CONSTRAINT pz_master_work_fk     FOREIGN KEY (master_work_id)     REFERENCES public.master_works(id)     ON DELETE SET NULL,
  ADD CONSTRAINT pz_supplier_fk        FOREIGN KEY (supplier_id)        REFERENCES public.suppliers(id)        ON DELETE SET NULL;
