DROP POLICY IF EXISTS approve_variations ON public.variations;
CREATE POLICY approve_variations ON public.variations
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'ceo'::app_role)
  OR public.has_role(auth.uid(), 'direktor'::app_role)
  OR public.has_role(auth.uid(), 'pm'::app_role)
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.has_role(auth.uid(), 'ceo'::app_role)
  OR public.has_role(auth.uid(), 'direktor'::app_role)
  OR public.has_role(auth.uid(), 'pm'::app_role)
);