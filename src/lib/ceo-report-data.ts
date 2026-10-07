// CEO kunlik bir betlik hisobot uchun ma'lumot yig'uvchi.
// Brauzerda (tugma bilan) ham, serverda (bot avtomatik yuborishi) ham
// bir xil supabase-client interfeysi bilan ishlaydi.

import { isMaterialMirrorExpense } from "@/lib/boq-category-map";

export type CeoReport = {
  projectId: string;
  projectName: string;
  projectCode: string | null;
  location: string | null;
  startDate: string | null;
  endDate: string | null;
  daysLeft: number | null;
  daysPassed: number | null;
  progress: number;
  expectedPct: number | null;
  contract: number;
  contractIn: number;
  contractQoldiq: number;
  kassaIn: number;
  totalOut: number;
  balance: number;
  kassaNaqd: number;
  kassaBank: number;
  spendMaterial: number;
  spendWork: number;
  spendOperatsion: number;
  salaryPaid: number;
  ustaPaid: number;
  texnikaSum: number;
  todayEmpCount: number;
  todayUstaCount: number;
  topWorks: { name: string; pct: number; amount: number }[];
  topCategories: { name: string; value: number }[];
  generatedAt: string;
};

async function all<T>(build: (from: number, to: number) => any, pageSize = 1000): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < pageSize) break;
  }
  return out;
}

const norm = (s: string) =>
  (s ?? "").toLowerCase().trim().replace(/[\u2018\u2019\u02bb\u02bc`]/g, "'").replace(/\s+/g, " ");

export async function buildCeoReport(sb: any, projectId: string): Promise<CeoReport> {
  const { data: p } = await sb
    .from("projects")
    .select("id,name,code,location,total_budget,start_date,end_date")
    .eq("id", projectId)
    .maybeSingle();
  if (!p) throw new Error("Loyiha topilmadi");

  const todayStr = new Date().toISOString().slice(0, 10);

  const [mats, works, exps, pays, incs, zAll, att, emps] = await Promise.all([
    all<any>((f, t) => sb.from("material_receipts").select("qty,unit_price,total_price,boq_code,zayavka_id,master_material_id").eq("project_id", projectId).range(f, t)),
    all<any>((f, t) => sb.from("work_progress").select("work_type,qty_done,unit_price,total_value,boq_code,zayavka_id,master_work_id,work_date").eq("project_id", projectId).range(f, t)),
    all<any>((f, t) => sb.from("expenses").select("category,amount,payment_method,source,kind,expense_date").eq("project_id", projectId).range(f, t)),
    all<any>((f, t) => sb.from("brigade_payments").select("amount").eq("project_id", projectId).range(f, t)),
    all<any>((f, t) => sb.from("incomes").select("amount,category,payment_method").eq("project_id", projectId).range(f, t)),
    all<any>((f, t) => sb.from("project_zayavka").select("id,name,kind,qty,qty_received,unit_price,total,off_plan,parent_id").eq("project_id", projectId).is("zayavka_no", null).range(f, t)),
    all<any>((f, t) => sb.from("employee_attendance").select("employee_id,employee_name,attendance_date").eq("project_id", projectId).eq("kind", "check_in").eq("attendance_date", todayStr).range(f, t)),
    all<any>((f, t) => sb.from("employees").select("id,monthly_salary,active").eq("active", true).range(f, t)),
  ]);

  const matAmt = (r: any) => Number(r.total_price) || Number(r.qty) * Number(r.unit_price) || 0;
  const matSum = mats.reduce((s, r) => s + matAmt(r), 0);
  const cashExp = exps.filter((r) => !isMaterialMirrorExpense(r));
  const expSum = cashExp.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const payOut = pays.reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const totalOut = matSum + expSum + payOut;

  const isContract = (r: any) => {
    const c = String(r.category ?? "").toLowerCase();
    return c.includes("shartnoma") || c.includes("kontrak");
  };
  const contract = Number(p.total_budget ?? 0);
  const contractIn = incs.filter(isContract).reduce((s, r) => s + Number(r.amount ?? 0), 0);
  const kassaRows = incs.filter((r) => !isContract(r));
  const kassaIn = kassaRows.reduce((s, r) => s + Number(r.amount ?? 0), 0);

  const kindOf = (e: any) => String(e.kind ?? "");
  const sumBy = (fn: (e: any) => boolean) => cashExp.filter(fn).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const spendMaterial = matSum + sumBy((e) => kindOf(e) === "boq_material");
  const spendWork = payOut + sumBy((e) => kindOf(e) === "boq_work" || kindOf(e) === "ustalar");
  const spendOperatsion = totalOut - spendMaterial - spendWork;

  const outByMethod: Record<string, number> = { Naqd: 0, Bank: 0, Karta: 0 };
  cashExp.forEach((e) => {
    const m = (e.payment_method as string) || "Naqd";
    outByMethod[m] = (outByMethod[m] ?? 0) + Number(e.amount ?? 0);
  });
  outByMethod.Naqd += matSum + payOut;
  const inByMethod: Record<string, number> = { Naqd: 0, Bank: 0, Karta: 0 };
  kassaRows.forEach((r) => {
    const m = (r.payment_method as string) || "Naqd";
    inByMethod[m] = (inByMethod[m] ?? 0) + Number(r.amount ?? 0);
  });

  // Progress — faqat BOQ ish turlari (kind = work), og'irlik summasi bo'yicha
  const doneByDesc: Record<string, number> = {};
  works.forEach((w) => {
    const d = norm(String(w.work_type ?? ""));
    if (d) doneByDesc[d] = (doneByDesc[d] ?? 0) + Number(w.qty_done ?? 0);
  });
  const zWorks = zAll
    .filter((m) => !m.parent_id && String(m.kind ?? "").toLowerCase() === "work" && Number(m.qty ?? 0) > 0)
    .map((m) => {
      const planned = Number(m.qty ?? 0);
      const done = Math.max(Number(m.qty_received ?? 0), doneByDesc[norm(String(m.name ?? ""))] ?? 0);
      return {
        name: String(m.name ?? ""),
        pct: planned > 0 ? Math.min(100, (done / planned) * 100) : 0,
        amount: Number(m.total) || planned * Number(m.unit_price ?? 0) || 0,
      };
    });
  const totalWeight = zWorks.reduce((s, w) => s + w.amount, 0);
  const progress = zWorks.length
    ? Math.round(
        totalWeight > 0
          ? zWorks.reduce((s, w) => s + w.pct * (w.amount / totalWeight), 0)
          : zWorks.reduce((s, w) => s + w.pct, 0) / zWorks.length,
      )
    : 0;

  const now = Date.now();
  const daysLeft = p.end_date ? Math.ceil((new Date(p.end_date).getTime() - now) / 86_400_000) : null;
  const daysPassed = p.start_date ? Math.floor((now - new Date(p.start_date).getTime()) / 86_400_000) : null;
  let expectedPct: number | null = null;
  if (p.start_date && p.end_date) {
    const s = new Date(p.start_date).getTime();
    const e = new Date(p.end_date).getTime();
    if (e > s) expectedPct = Math.max(0, Math.min(100, Math.round(((now - s) / (e - s)) * 100)));
  }

  const salaryPaid = cashExp.filter((e) => {
    const c = String(e.category ?? "").toLowerCase();
    return c.includes("oylik") || c.includes("ish haqi") || c.includes("maosh");
  }).reduce((s, e) => s + Number(e.amount ?? 0), 0);
  const texnikaSum = cashExp
    .filter((e) => String(e.category ?? "").toLowerCase().includes("texnika"))
    .reduce((s, e) => s + Number(e.amount ?? 0), 0);

  const salaryIds = new Set(emps.filter((e) => Number(e.monthly_salary ?? 0) > 0).map((e) => String(e.id)));
  const dailyIds = new Set(emps.filter((e) => !Number(e.monthly_salary ?? 0)).map((e) => String(e.id)));
  const empSet = new Set<string>();
  const ustaSet = new Set<string>();
  att.forEach((r) => {
    const id = r.employee_id ? String(r.employee_id) : "";
    const who = id || String(r.employee_name ?? "");
    if (!who) return;
    if (id && dailyIds.has(id)) ustaSet.add(who);
    else if (id && salaryIds.has(id)) empSet.add(who);
    else empSet.add(who);
  });

  const catMap = new Map<string, number>();
  cashExp.forEach((e) => {
    const c = String(e.category ?? "Boshqa");
    catMap.set(c, (catMap.get(c) ?? 0) + Number(e.amount ?? 0));
  });
  if (matSum > 0) catMap.set("Material (BOQ)", (catMap.get("Material (BOQ)") ?? 0) + matSum);
  if (payOut > 0) catMap.set("Ustalar", (catMap.get("Ustalar") ?? 0) + payOut);

  return {
    projectId,
    projectName: String(p.name ?? ""),
    projectCode: p.code ?? null,
    location: p.location ?? null,
    startDate: p.start_date ?? null,
    endDate: p.end_date ?? null,
    daysLeft,
    daysPassed,
    progress,
    expectedPct,
    contract,
    contractIn,
    contractQoldiq: contract - contractIn,
    kassaIn,
    totalOut,
    balance: kassaIn - totalOut,
    kassaNaqd: inByMethod.Naqd - outByMethod.Naqd,
    kassaBank: inByMethod.Bank + inByMethod.Karta - outByMethod.Bank - outByMethod.Karta,
    spendMaterial,
    spendWork,
    spendOperatsion,
    salaryPaid,
    ustaPaid: payOut,
    texnikaSum,
    todayEmpCount: empSet.size,
    todayUstaCount: ustaSet.size,
    topWorks: zWorks.sort((a, b) => b.amount - a.amount).slice(0, 8),
    topCategories: Array.from(catMap, ([name, value]) => ({ name, value }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6),
    generatedAt: new Date().toISOString(),
  };
}
