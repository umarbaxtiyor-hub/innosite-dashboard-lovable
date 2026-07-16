UPDATE incomes SET category='Shartnoma' WHERE project_id='5b3cb769-febd-43bf-ba55-1070bb037b51';

DELETE FROM work_progress WHERE project_id='5b3cb769-febd-43bf-ba55-1070bb037b51';

INSERT INTO work_progress (project_id, boq_code, work_type, qty_done, unit, unit_price, brigade_name, work_date)
SELECT 
  '5b3cb769-febd-43bf-ba55-1070bb037b51'::uuid,
  code,
  description,
  ROUND(qty * 0.85, 2),
  unit,
  CASE WHEN qty>0 THEN ROUND(planned_cost/qty, 2) ELSE 0 END,
  'Brigada-1',
  '2026-03-15'::date
FROM boq_items
WHERE project_id='5b3cb769-febd-43bf-ba55-1070bb037b51';