DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.purchase_orders; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.project_zayavka; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.material_receipts; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.work_progress; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.purchase_orders REPLICA IDENTITY FULL;
ALTER TABLE public.project_zayavka REPLICA IDENTITY FULL;
ALTER TABLE public.material_receipts REPLICA IDENTITY FULL;
ALTER TABLE public.work_progress REPLICA IDENTITY FULL;