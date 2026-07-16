
CREATE OR REPLACE FUNCTION public.sync_zayavka_from_po()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- No-op: zayavka_status enum only has approved/pending/rejected.
  -- Quantity remaining is computed in the UI from purchase_orders.qty.
  RETURN NEW;
END $function$;
