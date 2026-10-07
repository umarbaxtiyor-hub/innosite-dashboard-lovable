// Dashboard'ni chiroyli, diagrammali Excel faylga eksport qilish.
// Barcha ma'lumot eksport paytida bazadan YANGI o'qiladi (cache emas).
// @ts-ignore - brauzer uchun tayyor bundle
import ExcelJS from "exceljs/dist/exceljs.min.js";
import { supabase } from "@/integrations/supabase/client";
import { drawArea, drawDonut, drawGroupedBars } from "./dashboard-charts-canvas";

type Cat = { name: string; value: number };
type PvA = { name: string; planned: number; actual: number };
type Daily = { day: string; value: number };

const MONEY = '#,##0" so\'m"';
const PCT = "0.0%";
const NAVY = "FF0F172A";
const BLUE = "FF2563EB";
const LIGHT = "FFF1F5F9";

async function fetchAll<T>(build: (from: number, to: number) => any, size = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < size) break;
  }
  return out;
}

function styleHeader(ws: any, row: number, cols: number) {
  const r = ws.getRow(row);
  for (let i = 1; i <= cols; i++) {
    const cell = r.getCell(i);
    cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } };
    cell.alignment = { vertical: "middle", horizontal: i === 1 ? "left" : "right" };
    cell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } } };
  }
  r.height = 22;
}

function zebra(ws: any, from: number, to: number, cols: number) {
  for (let r = from; r <= to; r++) {
    const row = ws.getRow(r);
    row.height = 18;
    for (let i = 1; i <= cols; i++) {
      const cell = row.getCell(i);
      cell.font = { name: "Arial", size: 11 };
      if ((r - from) % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
      }
      cell.border = { bottom: { style: "hair", color: { argb: "FFE2E8F0" } } };
    }
  }
}

function addTableSheet(
  wb: any,
  name: string,
  headers: string[],
  rows: (string | number)[][],
  widths: number[],
  numberCols: number[] = [],
) {
  const ws = wb.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = headers.map((h, i) => ({ header: h, width: widths[i] ?? 18 }));
  styleHeader(ws, 1, headers.length);
  rows.forEach((r) => ws.addRow(r));
  zebra(ws, 2, rows.length + 1, headers.length);
  numberCols.forEach((c) => {
    ws.getColumn(c).numFmt = MONEY;
    ws.getColumn(c).alignment = { horizontal: "right" };
  });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: headers.length } };
  return ws;
}

const num = (v: any) => Number(v ?? 0) || 0;

export async function exportDashboardExcel(opts: {
  projectId: string | null;
  projectName: string;
  costByCategory?: Cat[];
  plannedVsActual?: PvA[];
  dailySpend?: Daily[];
}) {
  const { projectId, projectName } = opts;
  const pid = projectId;
  const scoped = (q: any) => (pid ? q.eq("project_id", pid) : q);

  // --- Ma'lumot yig'ish (hammasi yangi) ---
  const [
    project, expenses, incomes, zayavka, receipts, works, brigadePayments,
    brigades, employees, employeePayments, boqItems,
  ] = await Promise.all([
    pid
      ? supabase.from("projects").select("name,code,location,total_budget,start_date,end_date,status").eq("id", pid).maybeSingle().then((r) => r.data)
      : Promise.resolve(null),
    fetchAll<any>((f, t) => scoped(supabase.from("expenses").select("expense_date,category,description,amount,payment_method,paid_by,unit,qty,boq_code,source").or("source.is.null,and(source.neq.web_boq,source.neq.web_boq_mat),and(source.eq.web_boq,kind.in.(boq_work,ustalar))").order("expense_date", { ascending: false })).range(f, t)),
    fetchAll<any>((f, t) => scoped(supabase.from("incomes").select("income_date,category,description,amount,payment_method,payer").order("income_date", { ascending: false })).range(f, t)),
    fetchAll<any>((f, t) => scoped(supabase.from("project_zayavka").select("kind,name,unit,qty,qty_received,unit_price,total,off_plan,workflow_status,created_at").is("zayavka_no", null).is("parent_id", null)).range(f, t)),
    fetchAll<any>((f, t) => scoped(supabase.from("material_receipts").select("received_at,material_name,unit,qty,unit_price,total_price,supplier_name,nakladnoy_no,boq_code")).range(f, t)),
    fetchAll<any>((f, t) => scoped(supabase.from("work_progress").select("work_date,work_type,unit,qty_done,unit_price,total_value,brigade_name,boq_code")).range(f, t)),
    fetchAll<any>((f, t) => scoped(supabase.from("brigade_payments").select("payment_date,brigade_name,kind,amount,note")).range(f, t)),
    fetchAll<any>((f, t) => supabase.from("brigades").select("name,leader,member_count,notes").range(f, t)),
    fetchAll<any>((f, t) => supabase.from("employees").select("id,full_name,position,monthly_salary,active,notes").range(f, t)),
    fetchAll<any>((f, t) => scoped(supabase.from("employee_payments").select("payment_date,employee_id,kind,amount,note")).range(f, t)),
    pid
      ? fetchAll<any>((f, t) => supabase.from("boq_items").select("code,description,category,unit,qty,rate,planned_cost,actual_cost").eq("project_id", pid).range(f, t))
      : Promise.resolve([] as any[]),
  ]);

  // --- Dashboard hisob-kitoblari (index.tsx bilan bir xil mantiq) ---
  const isSalaryCat = (c: string) => {
    const s = c.toLowerCase();
    return s.includes("oylik") || s.includes("ish haqi") || s.includes("maosh");
  };
  const catMap = new Map<string, number>();
  const addCat = (k: string, v: number) => { if (v > 0) catMap.set(k, (catMap.get(k) ?? 0) + v); };
  for (const r of expenses) {
    const cat = String(r.category || "Boshqa");
    addCat(isSalaryCat(cat) ? "Xodimlar" : cat, num(r.amount));
  }
  addCat("Material (BOQ)", receipts.reduce((s, r) => s + (num(r.total_price) || num(r.qty) * num(r.unit_price)), 0));
  addCat("Ish (BOQ)", works.reduce((s, r) => s + (num(r.total_value) || num(r.qty_done) * num(r.unit_price)), 0));
  addCat("Xodimlar", brigadePayments.reduce((s, r) => s + num(r.amount), 0));
  addCat("Yordamchi (BOQ)", zayavka.filter((z) => z.off_plan).reduce(
    (s, r) => s + Math.max(num(r.paid_amount), num(r.qty_received) * num(r.unit_price)), 0));
  const costByCategory: Cat[] = Array.from(catMap, ([name, value]) => ({ name, value }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value);

  const labels: Record<string, string> = { material: "Material", work: "Ishlar", equipment: "Uskuna" };
  const pvaMap = new Map<string, { planned: number; actual: number }>();
  zayavka.filter((z) => !z.off_plan).forEach((r) => {
    const name = labels[String(r.kind)] ?? "Boshqa";
    const cur = pvaMap.get(name) ?? { planned: 0, actual: 0 };
    const up = num(r.unit_price);
    cur.planned += num(r.total) || num(r.qty) * up;
    cur.actual += num(r.qty_received) * up;
    pvaMap.set(name, cur);
  });
  boqItems.forEach((i) => {
    const name = i.category ?? "Boshqa";
    const cur = pvaMap.get(name) ?? { planned: 0, actual: 0 };
    cur.planned += num(i.planned_cost);
    cur.actual += num(i.actual_cost);
    pvaMap.set(name, cur);
  });
  const plannedVsActual: PvA[] = Array.from(pvaMap, ([name, v]) => ({ name, ...v }))
    .filter((r) => r.planned + r.actual > 0)
    .sort((a, b) => b.planned - a.planned)
    .slice(0, 6);

  const dayMap = new Map<string, number>();
  for (let i = 0; i < 30; i++) {
    const d = new Date(); d.setDate(d.getDate() - (29 - i));
    dayMap.set(d.toISOString().slice(5, 10), 0);
  }
  expenses.forEach((r) => {
    const k = String(r.expense_date ?? "").slice(5, 10);
    if (dayMap.has(k)) {
      const full = String(r.expense_date ?? "");
      const days = (Date.now() - new Date(full).getTime()) / 86400000;
      if (days <= 31) dayMap.set(k, (dayMap.get(k) ?? 0) + num(r.amount));
    }
  });
  const dailySpend: Daily[] = Array.from(dayMap, ([day, value]) => ({ day, value }));

  const totalSpend = costByCategory.reduce((s, r) => s + r.value, 0);
  const totalIncome = incomes.reduce((s, r) => s + num(r.amount), 0);
  const budget = num(project?.total_budget);
  const balance = totalIncome - expenses.reduce((s, r) => s + num(r.amount), 0);
  const usedPct = budget > 0 ? totalSpend / budget : 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = "Innosite";
  wb.created = new Date();

  // ================== DASHBOARD ==================
  const ws = wb.addWorksheet("Dashboard", {
    views: [{ showGridLines: false }],
    pageSetup: { orientation: "landscape", fitToPage: true },
  });
  ws.columns = [
    { width: 3 }, { width: 26 }, { width: 22 }, { width: 22 },
    { width: 22 }, { width: 22 }, { width: 22 }, { width: 3 },
  ];

  ws.mergeCells("B2:G3");
  const t = ws.getCell("B2");
  t.value = `${projectName} — Boshqaruv paneli`;
  t.font = { name: "Arial", size: 20, bold: true, color: { argb: "FFFFFFFF" } };
  t.alignment = { vertical: "middle", horizontal: "left", indent: 1 };
  for (let c = 2; c <= 7; c++) {
    ws.getCell(2, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
    ws.getCell(3, c).fill = { type: "pattern", pattern: "solid", fgColor: { argb: NAVY } };
  }
  ws.mergeCells("B4:G4");
  const st = ws.getCell("B4");
  st.value = `Hisobot sanasi: ${new Date().toLocaleString("uz-UZ")}${project?.location ? `  •  ${project.location}` : ""}`;
  st.font = { name: "Arial", size: 10, color: { argb: "FF64748B" } };
  st.alignment = { indent: 1 };

  // KPI kartalari
  const kpis: { label: string; value: number; fmt: string; color: string }[] = [
    { label: "Byudjet", value: budget, fmt: MONEY, color: "FF1D4ED8" },
    { label: "Fakt xarajat", value: totalSpend, fmt: MONEY, color: "FFDC2626" },
    { label: "Kirim", value: totalIncome, fmt: MONEY, color: "FF059669" },
    { label: "Kassa qoldiq", value: balance, fmt: MONEY, color: "FF0891B2" },
    { label: "Byudjet ishlatilgan", value: usedPct, fmt: PCT, color: "FFD97706" },
    { label: "Jurnal yozuvlari", value: expenses.length + incomes.length, fmt: "#,##0", color: "FF7C3AED" },
  ];
  kpis.forEach((k, i) => {
    const col = 2 + i;
    const labelCell = ws.getCell(6, col);
    labelCell.value = k.label;
    labelCell.font = { name: "Arial", size: 10, color: { argb: "FF64748B" }, bold: true };
    labelCell.alignment = { horizontal: "center" };
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: LIGHT } };
    labelCell.border = { top: { style: "thin", color: { argb: "FFCBD5E1" } }, left: { style: "thin", color: { argb: "FFCBD5E1" } }, right: { style: "thin", color: { argb: "FFCBD5E1" } } };

    const valCell = ws.getCell(7, col);
    valCell.value = k.value;
    valCell.numFmt = k.fmt;
    valCell.font = { name: "Arial", size: 13, bold: true, color: { argb: k.color } };
    valCell.alignment = { horizontal: "center", vertical: "middle" };
    valCell.border = { bottom: { style: "thin", color: { argb: "FFCBD5E1" } }, left: { style: "thin", color: { argb: "FFCBD5E1" } }, right: { style: "thin", color: { argb: "FFCBD5E1" } } };
  });
  ws.getRow(6).height = 18;
  ws.getRow(7).height = 26;

  // Diagrammalar (canvas → PNG)
  const charts = [
    drawDonut(costByCategory, "Kategoriya bo'yicha xarajat", "Fakt xarajat ulushlari"),
    drawGroupedBars(plannedVsActual, "Reja vs Fakt", "Kategoriyalar bo'yicha"),
    drawArea(dailySpend, "Oxirgi 30 kun xarajat", "Kunlik dinamika"),
  ];
  let row = 9;
  charts.forEach((dataUrl) => {
    const id = wb.addImage({ base64: dataUrl, extension: "png" });
    ws.addImage(id, { tl: { col: 1.2, row: row - 1 }, ext: { width: 760, height: 420 } });
    row += 22;
  });

  // ================== Ma'lumot varaqlari ==================
  addTableSheet(
    wb, "Kategoriya",
    ["Kategoriya", "Summa", "Ulush"],
    costByCategory.map((c) => [c.name, c.value, totalSpend ? c.value / totalSpend : 0]),
    [34, 22, 12], [2],
  ).getColumn(3).numFmt = PCT;

  addTableSheet(
    wb, "Reja-Fakt",
    ["Kategoriya", "Reja", "Fakt", "Farq", "Bajarilish"],
    plannedVsActual.map((r) => [r.name, r.planned, r.actual, r.planned - r.actual, r.planned ? r.actual / r.planned : 0]),
    [28, 20, 20, 20, 14], [2, 3, 4],
  ).getColumn(5).numFmt = PCT;

  addTableSheet(
    wb, "Kunlik xarajat",
    ["Kun", "Summa"],
    dailySpend.map((d) => [d.day, d.value]),
    [14, 22], [2],
  );

  addTableSheet(
    wb, "Jurnal - Chiqim",
    ["Sana", "Kategoriya", "Izoh", "Miqdor", "Birlik", "Summa", "To'lov", "Kim", "BOQ"],
    expenses.map((e) => [
      e.expense_date ?? "", e.category ?? "", e.description ?? "",
      num(e.qty), e.unit ?? "", num(e.amount),
      e.payment_method ?? "", e.paid_by ?? "", e.boq_code ?? "",
    ]),
    [13, 22, 42, 10, 10, 20, 12, 18, 12], [6],
  );

  addTableSheet(
    wb, "Jurnal - Kirim",
    ["Sana", "Kategoriya", "Izoh", "Summa", "To'lov", "To'lovchi"],
    incomes.map((i) => [
      i.income_date ?? "", i.category ?? "", i.description ?? "",
      num(i.amount), i.payment_method ?? "", i.payer ?? "",
    ]),
    [13, 22, 42, 20, 12, 20], [4],
  );

  const kindLabel: Record<string, string> = { material: "Material", work: "Ish", equipment: "Uskuna", extra: "Yordamchi" };
  addTableSheet(
    wb, "Smeta",
    ["Tur", "Nomi", "Birlik", "Reja hajm", "Bajarilgan", "Bajarilish %", "Narx", "Reja summa", "Fakt summa", "Holat"],
    zayavka.map((z) => {
      const qty = num(z.qty), done = num(z.qty_received), up = num(z.unit_price);
      return [
        kindLabel[String(z.kind)] ?? String(z.kind ?? ""),
        z.name ?? "", z.unit ?? "", qty, done, qty ? done / qty : 0, up,
        num(z.total) || qty * up, done * up,
        z.off_plan ? "Yordamchi" : String(z.workflow_status ?? ""),
      ];
    }),
    [12, 40, 10, 13, 13, 13, 18, 20, 20, 14], [7, 8, 9],
  ).getColumn(6).numFmt = PCT;

  if (boqItems.length) {
    addTableSheet(
      wb, "BOQ",
      ["Kod", "Tavsif", "Kategoriya", "Birlik", "Hajm", "Narx", "Reja summa", "Fakt summa"],
      boqItems.map((b) => [
        b.code ?? "", b.description ?? "", b.category ?? "", b.unit ?? "",
        num(b.qty), num(b.rate), num(b.planned_cost), num(b.actual_cost),
      ]),
      [14, 42, 20, 10, 12, 18, 20, 20], [6, 7, 8],
    );
  }

  addTableSheet(
    wb, "Material qabul",
    ["Sana", "Material", "Birlik", "Miqdor", "Narx", "Summa", "Ta'minotchi", "Nakladnoy", "BOQ"],
    receipts.map((r) => [
      r.received_at ?? "", r.material_name ?? "", r.unit ?? "",
      num(r.qty), num(r.unit_price), num(r.total_price) || num(r.qty) * num(r.unit_price),
      r.supplier_name ?? "", r.nakladnoy_no ?? "", r.boq_code ?? "",
    ]),
    [13, 34, 10, 12, 18, 20, 24, 16, 12], [5, 6],
  );

  addTableSheet(
    wb, "Ish bajarilishi",
    ["Sana", "Ish turi", "Birlik", "Hajm", "Narx", "Summa", "Brigada", "BOQ"],
    works.map((w) => [
      w.work_date ?? "", w.work_type ?? "", w.unit ?? "",
      num(w.qty_done), num(w.unit_price), num(w.total_value) || num(w.qty_done) * num(w.unit_price),
      w.brigade_name ?? "", w.boq_code ?? "",
    ]),
    [13, 34, 10, 12, 18, 20, 22, 12], [5, 6],
  );

  // ---- Xodimlar ----
  const paidByEmp = new Map<string, number>();
  employeePayments.forEach((p) => {
    if (!p.employee_id) return;
    paidByEmp.set(p.employee_id, (paidByEmp.get(p.employee_id) ?? 0) + num(p.amount));
  });
  const empName = new Map(employees.map((e) => [e.id, e.full_name]));
  addTableSheet(
    wb, "Xodimlar",
    ["F.I.Sh", "Lavozim", "Oylik", "To'langan", "Holat", "Izoh"],
    employees.map((e) => [
      e.full_name ?? "", e.position ?? "", num(e.monthly_salary),
      paidByEmp.get(e.id) ?? 0, e.active ? "Faol" : "Nofaol", e.notes ?? "",
    ]),
    [30, 22, 18, 20, 12, 30], [3, 4],
  );

  addTableSheet(
    wb, "Xodim to'lovlari",
    ["Sana", "Xodim", "Turi", "Summa", "Izoh"],
    employeePayments.map((p) => [
      p.payment_date ?? "", empName.get(p.employee_id) ?? "", String(p.kind ?? ""), num(p.amount), p.note ?? "",
    ]),
    [13, 30, 14, 20, 34], [4],
  );

  // ---- Brigadalar ----
  const paidByBrigade = new Map<string, number>();
  brigadePayments.forEach((p) => {
    const k = String(p.brigade_name ?? "—");
    paidByBrigade.set(k, (paidByBrigade.get(k) ?? 0) + num(p.amount));
  });
  addTableSheet(
    wb, "Brigadalar",
    ["Nomi", "Brigadir", "A'zolar", "To'langan", "Izoh"],
    brigades.map((b) => [
      b.name ?? "", b.leader ?? "", Number(b.member_count ?? 0),
      paidByBrigade.get(String(b.name)) ?? 0, b.notes ?? "",
    ]),
    [30, 24, 12, 20, 30], [4],
  );

  addTableSheet(
    wb, "Brigada to'lovlari",
    ["Sana", "Brigada", "Turi", "Summa", "Izoh"],
    brigadePayments.map((p) => [
      p.payment_date ?? "", p.brigade_name ?? "", String(p.kind ?? ""), num(p.amount), p.note ?? "",
    ]),
    [13, 28, 14, 20, 34], [4],
  );

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = projectName.replace(/[^\p{L}\p{N}]+/gu, "_").slice(0, 40);
  a.href = url;
  a.download = `Innosite_Dashboard_${safe}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
