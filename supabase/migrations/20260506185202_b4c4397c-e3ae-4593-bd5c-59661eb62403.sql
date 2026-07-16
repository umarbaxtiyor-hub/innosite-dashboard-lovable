
-- 1) Validation trigger: daily entries (work_progress, material_receipts, expenses) must link to an APPROVED project_zayavka row by name + project.

CREATE OR REPLACE FUNCTION public.require_zayavka_link()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ref_name text;
  has_match boolean;
BEGIN
  IF TG_TABLE_NAME = 'work_progress' THEN
    ref_name := COALESCE(NEW.work_type, '');
  ELSIF TG_TABLE_NAME = 'material_receipts' THEN
    ref_name := COALESCE(NEW.material_name, '');
  ELSIF TG_TABLE_NAME = 'expenses' THEN
    -- description is the item name for expenses; allow rows without a description (general expense)
    ref_name := COALESCE(NEW.description, '');
    IF ref_name = '' THEN
      RETURN NEW;
    END IF;
  ELSE
    RETURN NEW;
  END IF;

  IF NEW.project_id IS NULL OR ref_name = '' THEN
    RAISE EXCEPTION 'Master zayavkaga bog''lanmagan: nom yoki loyiha yo''q';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.project_zayavka z
     WHERE z.project_id = NEW.project_id
       AND z.status = 'approved'
       AND lower(trim(z.name)) = lower(trim(ref_name))
  ) INTO has_match;

  IF NOT has_match THEN
    RAISE EXCEPTION 'Master zayavkada bunday tasdiqlangan yozuv yo''q: "%". Avval Master zayavkaga qo''shing va tasdiqlang.', ref_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_require_zayavka_work ON public.work_progress;
CREATE TRIGGER trg_require_zayavka_work
BEFORE INSERT ON public.work_progress
FOR EACH ROW EXECUTE FUNCTION public.require_zayavka_link();

DROP TRIGGER IF EXISTS trg_require_zayavka_mat ON public.material_receipts;
CREATE TRIGGER trg_require_zayavka_mat
BEFORE INSERT ON public.material_receipts
FOR EACH ROW EXECUTE FUNCTION public.require_zayavka_link();

DROP TRIGGER IF EXISTS trg_require_zayavka_exp ON public.expenses;
CREATE TRIGGER trg_require_zayavka_exp
BEFORE INSERT ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.require_zayavka_link();
