DROP TRIGGER IF EXISTS trg_sync_zayavka_from_po ON public.purchase_orders;
CREATE TRIGGER trg_sync_zayavka_from_po
AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders
FOR EACH ROW EXECUTE FUNCTION public.sync_zayavka_workflow_from_po();