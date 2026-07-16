
-- Seed BOQ items for the 3 projects so the dashboard shows real budget/actual data

-- Asosiy obyekt (4.5B)
INSERT INTO public.boq_items (project_id, code, description, category, unit, qty, rate, planned_cost, actual_cost) VALUES
('2be461f7-8a86-49a5-b9c0-cbfaaef63aad','A-01','Yer ishlari va poydevor','Yer ishlari','m3',1200,180000,216000000,205000000),
('2be461f7-8a86-49a5-b9c0-cbfaaef63aad','A-02','Beton va armatura','Beton','m3',850,950000,807500000,845000000),
('2be461f7-8a86-49a5-b9c0-cbfaaef63aad','A-03','G''isht devorlari','G''isht','m3',420,1200000,504000000,498000000),
('2be461f7-8a86-49a5-b9c0-cbfaaef63aad','A-04','Tom va kataniya','Tom','m2',1800,420000,756000000,720000000),
('2be461f7-8a86-49a5-b9c0-cbfaaef63aad','A-05','Pol va plitka','Pol','m2',2400,280000,672000000,690000000),
('2be461f7-8a86-49a5-b9c0-cbfaaef63aad','A-06','Elektr montaj','Elektr','komp',1,520000000,520000000,485000000),
('2be461f7-8a86-49a5-b9c0-cbfaaef63aad','A-07','Santexnika','Santexnika','komp',1,380000000,380000000,365000000),
('2be461f7-8a86-49a5-b9c0-cbfaaef63aad','A-08','Pardozlash ishlari','Pardoz','m2',2400,260000,624000000,610000000),

-- Toshkent Biznes Markaz (2.8B)
('a1111111-1111-1111-1111-111111111111','T-01','Yer ishlari','Yer ishlari','m3',900,180000,162000000,170000000),
('a1111111-1111-1111-1111-111111111111','T-02','Karkas (beton)','Beton','m3',650,980000,637000000,650000000),
('a1111111-1111-1111-1111-111111111111','T-03','Fasad oynalar','Fasad','m2',1100,650000,715000000,690000000),
('a1111111-1111-1111-1111-111111111111','T-04','MEP tizimlari','Elektr','komp',1,580000000,580000000,560000000),
('a1111111-1111-1111-1111-111111111111','T-05','Pardoz va interyer','Pardoz','m2',1800,380000,684000000,720000000),

-- Samarqand Hotel (1.9B)
('a2222222-2222-2222-2222-222222222222','S-01','Yer ishlari va poydevor','Yer ishlari','m3',700,180000,126000000,128000000),
('a2222222-2222-2222-2222-222222222222','S-02','Beton ishlari','Beton','m3',480,950000,456000000,460000000),
('a2222222-2222-2222-2222-222222222222','S-03','G''isht va devor','G''isht','m3',300,1200000,360000000,355000000),
('a2222222-2222-2222-2222-222222222222','S-04','MEP','Elektr','komp',1,420000000,420000000,400000000),
('a2222222-2222-2222-2222-222222222222','S-05','Pardoz va mebel','Pardoz','m2',1400,380000,532000000,540000000);
