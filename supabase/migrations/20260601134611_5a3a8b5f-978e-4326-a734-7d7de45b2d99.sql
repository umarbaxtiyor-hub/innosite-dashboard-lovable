
INSERT INTO public.expense_categories (name, icon)
SELECT 'Shartnoma', '📄'
WHERE NOT EXISTS (SELECT 1 FROM public.expense_categories WHERE name = 'Shartnoma');

INSERT INTO public.work_progress (project_id, boq_code, work_type, qty_done, unit, unit_price, brigade_name, work_date, source)
VALUES
  ('5b3cb769-febd-43bf-ba55-1070bb037b51', 'W-001', 'Beton quyish (qo''shimcha hajm)', 200, 'm3', 450000, 'Beton brigadasi', CURRENT_DATE - INTERVAL '3 days', 'seed'),
  ('5b3cb769-febd-43bf-ba55-1070bb037b51', 'W-002', 'G''isht terish (qo''shimcha)', 80, 'm3', 650000, 'G''isht brigadasi', CURRENT_DATE - INTERVAL '2 days', 'seed');

INSERT INTO public.project_zayavka
  (project_id, kind, name, unit, qty, unit_price, status, workflow_status, off_plan, qty_received, paid_amount, supplier_name, notes)
VALUES
  ('5b3cb769-febd-43bf-ba55-1070bb037b51', 'material', 'Qo''shimcha temir konstruksiya (rejadan tashqari)', 'dona', 6, 16000000, 'approved', 'paid', true, 6, 96000000, 'Metallstroy MChJ', 'Rejadan tashqari — qo''shimcha buyurtma'),
  ('5b3cb769-febd-43bf-ba55-1070bb037b51', 'material', 'Drenaj quvurlari (qo''shimcha)', 'm', 200, 320000, 'approved', 'paid', true, 200, 64000000, 'TashStroy', 'Rejadan tashqari');

INSERT INTO public.material_receipts
  (project_id, boq_code, material_name, qty, unit, unit_price, supplier_name, received_at, source)
VALUES
  ('5b3cb769-febd-43bf-ba55-1070bb037b51', 'M-001', 'Sement M-400 (qo''shimcha)', 150, 'tn', 1200000, 'Akhangaran Sement', CURRENT_DATE - INTERVAL '5 days', 'seed');
