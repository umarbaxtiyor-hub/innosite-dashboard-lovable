-- 1) Enable trigram similarity for fuzzy matching
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 2) Add link columns to journal tables
ALTER TABLE public.material_receipts ADD COLUMN IF NOT EXISTS zayavka_id uuid;
ALTER TABLE public.work_progress     ADD COLUMN IF NOT EXISTS zayavka_id uuid;
ALTER TABLE public.expenses          ADD COLUMN IF NOT EXISTS zayavka_id uuid;

CREATE INDEX IF NOT EXISTS idx_mr_zayavka  ON public.material_receipts(zayavka_id);
CREATE INDEX IF NOT EXISTS idx_wp_zayavka  ON public.work_progress(zayavka_id);
CREATE INDEX IF NOT EXISTS idx_exp_zayavka ON public.expenses(zayavka_id);

-- 3) Normalization helper: lowercase + cyrillic -> latin (uz)
CREATE OR REPLACE FUNCTION public.norm_name(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT regexp_replace(
    translate(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      lower(coalesce(s,'')),
                      'ё','yo','g'),
                    'ж','j','g'),
                  'ц','ts','g'),
                'ч','ch','g'),
              'ш','sh','g'),
            'щ','sh','g'),
          'ю','yu','g'),
        'я','ya','g'),
      'абвгғдезийкқлмнңоөўпрстуфхҳъыьэ',
      'abvgg''dezijkqlmnngooopr''stufxh'''
    ),
    '[^a-z0-9]+','','g'
  );
$$;

-- 4) Trigram indexes on plan + journal for fast similarity search
CREATE INDEX IF NOT EXISTS idx_pz_norm_name_trgm
  ON public.project_zayavka USING gin (public.norm_name(name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_mr_norm_name_trgm
  ON public.material_receipts USING gin (public.norm_name(material_name) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_wp_norm_name_trgm
  ON public.work_progress USING gin (public.norm_name(work_type) gin_trgm_ops);

-- 5) Backfill MATERIAL receipts -> project_zayavka(kind=material)
WITH best AS (
  SELECT DISTINCT ON (mr.id)
    mr.id  AS row_id,
    pz.id  AS pz_id,
    similarity(public.norm_name(mr.material_name), public.norm_name(pz.name)) AS score
  FROM public.material_receipts mr
  JOIN public.project_zayavka pz
    ON pz.project_id = mr.project_id
   AND pz.kind = 'material'
   AND pz.status = 'approved'
   AND length(public.norm_name(mr.material_name)) >= 3
   AND similarity(public.norm_name(mr.material_name), public.norm_name(pz.name)) >= 0.45
  ORDER BY mr.id, score DESC
)
UPDATE public.material_receipts mr
   SET zayavka_id = best.pz_id
  FROM best
 WHERE mr.id = best.row_id
   AND mr.zayavka_id IS DISTINCT FROM best.pz_id;

-- 6) Backfill WORK progress -> project_zayavka(kind=work)
WITH best AS (
  SELECT DISTINCT ON (wp.id)
    wp.id AS row_id,
    pz.id AS pz_id,
    similarity(public.norm_name(wp.work_type), public.norm_name(pz.name)) AS score
  FROM public.work_progress wp
  JOIN public.project_zayavka pz
    ON pz.project_id = wp.project_id
   AND pz.kind = 'work'
   AND pz.status = 'approved'
   AND length(public.norm_name(wp.work_type)) >= 3
   AND similarity(public.norm_name(wp.work_type), public.norm_name(pz.name)) >= 0.45
  ORDER BY wp.id, score DESC
)
UPDATE public.work_progress wp
   SET zayavka_id = best.pz_id
  FROM best
 WHERE wp.id = best.row_id
   AND wp.zayavka_id IS DISTINCT FROM best.pz_id;

-- 7) Backfill EXPENSES -> any plan kind (material/work) when description matches
WITH best AS (
  SELECT DISTINCT ON (ex.id)
    ex.id AS row_id,
    pz.id AS pz_id,
    similarity(public.norm_name(ex.description), public.norm_name(pz.name)) AS score
  FROM public.expenses ex
  JOIN public.project_zayavka pz
    ON pz.project_id = ex.project_id
   AND pz.status = 'approved'
   AND pz.kind IN ('material','work')
   AND length(public.norm_name(ex.description)) >= 3
   AND similarity(public.norm_name(ex.description), public.norm_name(pz.name)) >= 0.55
  ORDER BY ex.id, score DESC
)
UPDATE public.expenses ex
   SET zayavka_id = best.pz_id
  FROM best
 WHERE ex.id = best.row_id
   AND ex.zayavka_id IS DISTINCT FROM best.pz_id;