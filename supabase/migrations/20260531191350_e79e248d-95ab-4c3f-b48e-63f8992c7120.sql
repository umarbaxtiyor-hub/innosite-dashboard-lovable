
-- Brigada -> Xodimlar (existing expenses + category)
UPDATE public.expenses SET category = 'Xodimlar' WHERE category = 'Brigada';
UPDATE public.expense_categories SET name = 'Xodimlar', icon = '👷' WHERE name = 'Brigada';

-- Yangi kategoriyalar qo'shish
INSERT INTO public.expense_categories (name, icon)
SELECT 'Bozorlik', '🛒' WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE name='Bozorlik');
INSERT INTO public.expense_categories (name, icon)
SELECT 'Yordamchi', '🛠️' WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE name='Yordamchi');

-- Iconlar
UPDATE public.expense_categories SET icon = '🚚' WHERE name = 'Transport' AND (icon IS NULL OR icon = '');
UPDATE public.expense_categories SET icon = '💰' WHERE name = 'Boshqa' AND (icon IS NULL OR icon = '');
UPDATE public.expense_categories SET icon = '🧱' WHERE name = 'Material (BOQ)' AND (icon IS NULL OR icon = '');
UPDATE public.expense_categories SET icon = '👷' WHERE name = 'Ish (BOQ)' AND (icon IS NULL OR icon = '');
UPDATE public.expense_categories SET icon = '➕' WHERE name = 'Qo''shimcha (BOQ)' AND (icon IS NULL OR icon = '');
