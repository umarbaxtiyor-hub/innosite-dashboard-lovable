
-- Allow CRUD on material_receipts (warehouse acceptance)
CREATE POLICY mr_write_all ON public.material_receipts FOR INSERT WITH CHECK (true);
CREATE POLICY mr_update_all ON public.material_receipts FOR UPDATE USING (true);
CREATE POLICY mr_delete_all ON public.material_receipts FOR DELETE USING (true);
