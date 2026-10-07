import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fmtUZS, fmtUZSc } from "@/lib/queries";
import { isMaterialMirrorExpense } from "@/lib/boq-category-map";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowDownCircle, ArrowUpCircle, Wallet,
  Boxes, PlusCircle, Users, HardHat, Hammer, UtensilsCrossed, Truck,
} from "lucide-react";
import { ProjectHeroCard } from "./ProjectHeroCard";
import { HeroProjectPicker } from "@/components/HeroProjectPicker";
import { LockedOverlay } from "@/components/LockedOverlay";


type Project = {
  id: string; name: string; total_budget: number | null;
  start_date: string | null; end_date: string | null; status: string | null;
  firm_id?: string | null;
  pm_name?: string | null;
};

async function fetchAllRows<T>(buildQuery: (from: number, to: number) => any, pageSize = 1000): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

// Light/dark adaptiv — har bir karta uchun juda och pastel rang aralashtirilgan.
// Karta romkasi (var(--card-frame)) saqlanadi.
const FRAME = "border-2 border-[var(--card-frame)]";



type DialogKey =
  | "kirim" | "chiqim" | "kassa" | "offplan" | "salary"
  | "materials" | "works" | "progress" | "deadline" | null;

export function ProjectKpiGrid({
  projectId,
  firmId,
  scopeLabel,
  activeName,
}: {
  projectId?: string | null;
  firmId?: string | null;
  scopeLabel?: string;
  activeName?: string | null;
}) {
  const [open, setOpen] = useState<DialogKey>(null);
  const allMode = !projectId && !firmId && !!scopeLabel;
  const enabled = !!projectId || !!firmId || allMode;

  const qc = useQueryClient();
  void qc;
  const { data, isFetching } = useQuery({
    queryKey: ["project-kpis-v3", projectId ?? "x", firmId ?? "x", allMode ? "all" : "scoped"],
    enabled,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    queryFn: async () => {
      // Loyihalar ro'yxatini aniqlash
      let projects: Project[] = [];
      if (projectId) {
        const { data: p } = await supabase.from("projects").select("id,name,total_budget,start_date,end_date,status,firm_id,pm_name").eq("id", projectId).maybeSingle();
        if (p) projects = [p as Project];
      } else if (firmId) {
        const { data: ps } = await supabase.from("projects").select("id,name,total_budget,start_date,end_date,status,firm_id,pm_name").eq("firm_id", firmId);
        projects = (ps ?? []) as Project[];
      } else {
        const { data: ps } = await supabase.from("projects").select("id,name,total_budget,start_date,end_date,status,firm_id,pm_name");
        projects = (ps ?? []) as Project[];
      }
      const ids = projects.map((p) => p.id);
      const firmIds = Array.from(new Set(projects.map((p) => p.firm_id).filter(Boolean))) as string[];
      if (ids.length === 0) {
        return { projects, project: null, materials: [], works: [], expenses: [], payments: [], boq: [], zMasters: [], incomes: [], offPlan: [], employees: [], attendance: [] };
      }

      const attFrom = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
      const [mats, works, exps, pays, boqs, incs, offp, emps, zmasters, att] = await Promise.all([
        fetchAllRows<any>((from, to) => supabase.from("material_receipts").select("id,material_name,qty,unit,unit_price,total_price,supplier_name,received_at,boq_code,zayavka_id,master_material_id").in("project_id", ids).order("received_at", { ascending: false }).range(from, to)),
        fetchAllRows<any>((from, to) => supabase.from("work_progress").select("id,work_type,qty_done,unit,unit_price,total_value,brigade_name,work_date,boq_code,zayavka_id,master_work_id").in("project_id", ids).order("work_date", { ascending: false }).range(from, to)),
        fetchAllRows<any>((from, to) => supabase.from("expenses").select("id,category,description,amount,expense_date,paid_by,payment_method,source,kind").in("project_id", ids).order("expense_date", { ascending: false }).range(from, to)),
        fetchAllRows<any>((from, to) => supabase.from("brigade_payments").select("id,brigade_name,kind,amount,payment_date,note").in("project_id", ids).order("payment_date", { ascending: false }).range(from, to)),
        fetchAllRows<any>((from, to) => supabase.from("boq_items").select("id,code,description,category,qty,unit,planned_cost,actual_cost").in("project_id", ids).range(from, to)),
        fetchAllRows<any>((from, to) => supabase.from("incomes").select("id,amount,category,payment_method,income_date,description,payer,source").in("project_id", ids).order("income_date", { ascending: false }).range(from, to)),
        fetchAllRows<any>((from, to) => supabase.from("project_zayavka").select("id,name,total,paid_amount,qty,qty_received,unit_price,status,off_plan").in("project_id", ids).eq("off_plan", true).range(from, to)),
        firmIds.length
          ? fetchAllRows<any>((from, to) => supabase.from("employees").select("id,full_name,position,phone,monthly_salary,active,firm_id").in("firm_id", firmIds).eq("active", true).range(from, to))
          : Promise.resolve([] as any[]),
        fetchAllRows<any>((from, to) => supabase.from("project_zayavka").select("id,name,kind,qty,qty_received,unit_price,total,off_plan,parent_id,master_material_id,master_work_id").in("project_id", ids).is("zayavka_no", null).range(from, to)),
        fetchAllRows<any>((from, to) => supabase.from("employee_attendance").select("employee_id,employee_name,attendance_date,kind").in("project_id", ids).eq("kind", "check_in").gte("attendance_date", attFrom).range(from, to)),
      ]);

      // Aggregate "project" summary (min start, max end, sum budget)
      const contract = projects.reduce((s, p) => s + Number(p.total_budget ?? 0), 0);
      const starts = projects.map((p) => p.start_date).filter(Boolean) as string[];
      const ends = projects.map((p) => p.end_date).filter(Boolean) as string[];
      const aggProject: Project = {
        id: projectId ?? firmId ?? "agg",
        name: projects.length === 1 ? projects[0].name : `${projects.length} loyiha`,
        total_budget: contract,
        start_date: starts.length ? starts.sort()[0] : null,
        end_date: ends.length ? ends.sort().slice(-1)[0] : null,
        status: projects.length === 1 ? projects[0].status : "active",
        pm_name: projects.length === 1 ? projects[0].pm_name ?? null : null,
      };
      return {
        projects,
        project: aggProject,
        materials: mats,
        works,
        expenses: exps,
        payments: pays,
        boq: boqs,
        zMasters: zmasters,
        incomes: incs,
        offPlan: offp,
        employees: emps,
        attendance: att,
      };
    },
  });

  const k = useMemo(() => {
    const project = data?.project ?? null;
    const contract = Number(project?.total_budget ?? 0);
    const matAmt = (r: any) => Number(r.total_price) || Number(r.qty) * Number(r.unit_price) || 0;
    const workAmt = (r: any) => Number(r.total_value) || Number(r.qty_done) * Number(r.unit_price) || 0;
    // Smeta bilan bir xil mantiq: har bir qabul/ish qatorini smetadagi master
    // zayavka qatoriga bog'laymiz. Master off_plan = true bo'lsa — Yordamchi,
    // aks holda BOQ (Material / Ishlar) kartasiga tushadi.
    const allZ = (data?.zMasters ?? []) as any[];
    const zById: Record<string, any> = {};
    allZ.forEach((z) => { zById[z.id] = z; });
    const masterOf = (zid: string | null | undefined): any | null => {
      let cur = zid ? zById[zid] : null;
      let guard = 0;
      while (cur?.parent_id && zById[cur.parent_id] && guard++ < 10) cur = zById[cur.parent_id];
      return cur ?? null;
    };
    const zMastersAll = allZ.filter((z) => !z.parent_id);
    const isOffPlanRow = (r: any, kind: "material" | "work") => {
      let m = masterOf(r.zayavka_id);
      if (!m) {
        const mid = kind === "material" ? r.master_material_id : r.master_work_id;
        if (mid) m = zMastersAll.find((x) => x.kind === kind && (kind === "material" ? x.master_material_id : x.master_work_id) === mid) ?? null;
      }
      // Smetada topilmasa — rejadan tashqari deb hisoblanadi
      if (!m) return !String(r.boq_code ?? "").trim();
      return m.off_plan === true;
    };
    const matSum = (data?.materials ?? []).reduce((s: number, r: any) => s + matAmt(r), 0);
    const workSum = (data?.works ?? []).reduce((s: number, r: any) => s + workAmt(r), 0);
    // Rejaga (BOQ) bog'lanmagan — Yordamchi kartasiga tushadi
    const yordMatSum = (data?.materials ?? []).filter((r: any) => isOffPlanRow(r, "material")).reduce((s: number, r: any) => s + matAmt(r), 0);
    const yordWorkSum = (data?.works ?? []).filter((r: any) => isOffPlanRow(r, "work")).reduce((s: number, r: any) => s + workAmt(r), 0);
    // Jurnaldagi kind='operatsion' xarajatlari ham Operatsion kartasiga tushadi
    const opsExpSum = (data?.expenses ?? [])
      .filter((r: any) => String(r.kind ?? "") === "operatsion" && !isMaterialMirrorExpense(r))
      .reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const boqMatSum = matSum - yordMatSum;
    const boqWorkSum = workSum - yordWorkSum;
    // Faqat material_receipts ga takror yozilgan xarajatlar Chiqimdan chiqariladi.
    // Ish (work_progress) yozuvlari pul chiqimi sifatida sanalmaydi, shuning uchun
    // ularning jurnal qatori Chiqimda qoladi.
    const cashExpenses = (data?.expenses ?? []).filter((r: any) => !isMaterialMirrorExpense(r));

    const expSum = cashExpenses.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

    // Kirimlarni 2 ga ajratamiz:
    //  • Shartnoma kirim — category 'shartnoma' bo'lsa (hero kartada ko'rinadi, kassaga bog'lanmaydi)
    //  • Kassa kirim — qolgan barcha incomes (kassa balansiga kiradi)
    const incomesArr = (data?.incomes ?? []) as any[];
    const isContract = (r: any) => {
      const c = String(r.category ?? "").toLowerCase();
      return c.includes("shartnoma") || c.includes("kontrak");
    };
    const contractIn = incomesArr.filter(isContract).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const kassaIn = incomesArr.filter((r) => !isContract(r)).reduce((s, r) => s + Number(r.amount ?? 0), 0);

    const payIn = kassaIn; // KPI "Kirim" — kassa kirimi
    // Usta/brigada to'lovlari — BARCHASI (avans + yakuniy + boshqa)
    const payOut = (data?.payments ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    // Moliyaviy hisob Jurnal bilan aynan bir xil:
    // material qabuli + alohida xarajatlar + brigada to'lovlari.
    // work_progress bajarilgan hajmni bildiradi, alohida pul chiqimi emas.
    const totalOut = matSum + expSum + payOut;
    const balance = kassaIn - totalOut;

    // ===== Pul nazorati: har bir chiqim aynan 3 kartadan biriga tushadi =====
    // Material + Ishlar + Operatsion = Chiqim (totalOut)
    const kindOf = (e: any) => String(e.kind ?? "");
    const sumBy = (fn: (e: any) => boolean) => cashExpenses.filter(fn).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
    const spendMaterial = matSum + sumBy((e) => kindOf(e) === "boq_material");
    const spendWork = payOut + sumBy((e) => kindOf(e) === "boq_work" || kindOf(e) === "ustalar");
    const spendOperatsion = totalOut - spendMaterial - spendWork;


    // Payment-method breakdown of expenses (Naqd / Bank / Karta)
    const byMethod = { Naqd: 0, Bank: 0, Karta: 0 } as Record<string, number>;
    cashExpenses.forEach((e: any) => {
      const m = (e.payment_method as string) || "Naqd";
      byMethod[m] = (byMethod[m] ?? 0) + Number(e.amount ?? 0);
    });
    // Material / ish / usta to'lovlarida payment_method yo'q — default Naqd
    byMethod.Naqd += matSum + payOut;

    // Kassa kirim — payment_method bo'yicha (faqat shartnomadan tashqari)
    const inByMethod = { Naqd: 0, Bank: 0, Karta: 0 } as Record<string, number>;
    incomesArr.filter((r) => !isContract(r)).forEach((r: any) => {
      const m = (r.payment_method as string) || "Naqd";
      inByMethod[m] = (inByMethod[m] ?? 0) + Number(r.amount ?? 0);
    });
    const inByKind: Record<string, number> = inByMethod;

    // Kassa balansi = kassa kirim − jami chiqim
    const kassaNaqd = inByMethod.Naqd - byMethod.Naqd;
    const kassaBank = (inByMethod.Bank + inByMethod.Karta) - byMethod.Bank - byMethod.Karta;
    const kassaTotal = kassaIn - totalOut;

    // Per-BOQ progress (qty). Agar smeta juda katta bo'lsa, asosiy progress
    // smeta limitidan foydalanilgan summa bo'yicha ham hisoblanadi.
    const boq = data?.boq ?? [];
    const works = data?.works ?? [];
    const matsArr = data?.materials ?? [];
    // Normallashtirilgan nom: kichik harf + apostroflar birlashtiriladi +
    // ortiqcha bo'shliqlar olib tashlanadi. work_type ↔ smeta nomi moslashi
    // uchun ishlatiladi (masalan, "bo'yash" vs "bo'yash").
    const normName = (s: string) =>
      (s ?? "").toLowerCase().trim()
        .replace(/[\u2018\u2019\u02bc`]/g, "'")
        .replace(/\s+/g, " ");
    const doneByCode: Record<string, number> = {};
    const doneByDesc: Record<string, number> = {};
    works.forEach((w: any) => {
      const c = (w.boq_code || "").toString().trim();
      const d = normName(String(w.work_type ?? ""));
      if (c) doneByCode[c] = (doneByCode[c] ?? 0) + Number(w.qty_done ?? 0);
      if (d) doneByDesc[d] = (doneByDesc[d] ?? 0) + Number(w.qty_done ?? 0);
    });
    const matByCode: Record<string, number> = {};
    matsArr.forEach((m: any) => {
      const c = (m.boq_code || "").toString().trim();
      if (c) matByCode[c] = (matByCode[c] ?? 0) + Number(m.qty ?? 0);
    });
    const boqProgress = boq.map((b: any) => {
      const planned = Number(b.qty ?? 0);
      const done = doneByCode[b.code] ?? doneByDesc[normName(b.description ?? "")] ?? 0;
      const pct = planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0;
      return { ...b, done, pct, matQty: matByCode[b.code] ?? 0 };
    });
    // Fallback: project_zayavka masters (smeta uploaded as zayavka).
    // MUHIM: progress FAQAT ISH turlari (kind = 'work') bo'yicha hisoblanadi.
    // Material (kind='material'), uskuna (kind='equipment') va qo'shimcha
    // (kind='extra') qatorlari — ularning summasi va bajariishi — progressga
    // umuman kiritilmaydi. Shuningdek kassa, xarajat, to'lov va material
    // qabuli ham hisobga olinmaydi.
    const zMasters = ((data?.zMasters ?? []) as any[]).filter((m) => !m.parent_id);
    const zWorks = zMasters.filter(
      (m) => String(m.kind ?? "").toLowerCase() === "work" && Number(m.qty ?? 0) > 0,
    );
    const zProgress = zWorks.map((m) => {
      const planned = Number(m.qty ?? 0);
      const nameKey = normName(String(m.name ?? ""));
      // Bajarilgan hajm: zayavkada qayd etilgan qty_received yoki work_progress
      // jadvalidagi mos ish hajmi — qaysi biri kattaroq bo'lsa.
      const done = Math.max(Number(m.qty_received ?? 0), doneByDesc[nameKey] ?? 0);
      const pct = planned > 0 ? Math.min(100, (done / planned) * 100) : 0;
      const amount = Number(m.total) || planned * Number(m.unit_price ?? 0) || 0;
      return { pct, planned, amount };
    }).filter((x) => x.planned > 0);

    // Project Progress = Σ(Activity Progress % × Weight %)
    //   Activity Progress % = bajarilgan hajm ÷ shartnoma hajmi × 100
    //   Weight % = ish turi shartnoma summasi ÷ jami ish turlari shartnoma summasi
    // Faqat BOQ ish turlari (WORK). Material, uskuna, kassa, xarajat, to'lov
    // va xaridlar progress hisobiga kiritilmaydi.
    const boqWorks = boqProgress.filter((b: any) => {
      const c = String(b.category ?? "").toLowerCase();
      return c.includes("ish") || c.includes("work");
    });
    const weighted = boqWorks.length
      ? boqWorks.map((b: any) => ({
          pct: Number(b.qty ?? 0) > 0 ? Math.min(100, (Number(b.done ?? 0) / Number(b.qty)) * 100) : 0,
          amount: Number(b.planned_cost) || Number(b.qty ?? 0) * Number(b.rate ?? 0) || 0,
        }))
      : zProgress.map((z) => ({ pct: z.pct, amount: z.amount }));
    const totalWeight = weighted.reduce((s, w) => s + w.amount, 0);
    const progress = weighted.length
      ? Math.round(
          totalWeight > 0
            ? weighted.reduce((s, w) => s + w.pct * (w.amount / totalWeight), 0)
            : weighted.reduce((s, w) => s + w.pct, 0) / weighted.length,
        )
      : 0;



    // Deadline + delay
    const today = new Date();
    let daysLeft: number | null = null;
    let expectedPct: number | null = null;
    let delay: number | null = null;
    if (project?.end_date) {
      daysLeft = Math.ceil((new Date(project.end_date).getTime() - today.getTime()) / 86_400_000);
    }
    if (project?.start_date && project?.end_date) {
      const start = new Date(project.start_date).getTime();
      const end = new Date(project.end_date).getTime();
      const total = end - start;
      if (total > 0) {
        expectedPct = Math.max(0, Math.min(100, Math.round(((today.getTime() - start) / total) * 100)));
        delay = progress - expectedPct;
      }
    }

    // Off-plan (rejadan tashqari) — faqat haqiqiy ishlatilgan summa (to'langan yoki qabul qilingan)
    const offPlanArr = (data?.offPlan ?? []) as any[];
    const offPlanSum = offPlanArr.reduce((s: number, r: any) => {
      const paid = Number(r.paid_amount) || 0;
      const recv = (Number(r.qty_received) || 0) * (Number(r.unit_price) || 0);
      return s + Math.max(paid, recv);
    }, 0);

    // Oylikga ishlaydigan xodimlar
    const employees = (data?.employees ?? []) as any[];
    const salaryEmployees = employees.filter((e: any) => Number(e.monthly_salary ?? 0) > 0);
    const salaryCount = salaryEmployees.length;
    const salarySum = salaryEmployees.reduce((s: number, e: any) => s + Number(e.monthly_salary ?? 0), 0);
    // Kunbay (usta) xodimlar — oyligi yo'q bo'lganlar
    const dailyEmployees = employees.filter((e: any) => !Number(e.monthly_salary ?? 0));
    const dailyCount = dailyEmployees.length;
    // Xodimlarga to'langan (oylik/ish haqi/avans/maosh kategoriyalari — expenses jadvalidan)
    // Brigada to'lovlari alohida — Ustalar kartasida (payOut) ko'rinadi
    const salaryExpSum = cashExpenses.filter((e: any) => {
      const c = String(e.category ?? "").toLowerCase();
      return c.includes("oylik") || c.includes("ish haqi") || c.includes("maosh");
    }).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
    const otherExpSum = expSum - salaryExpSum;
    const salaryPaid = salaryExpSum;

    // ===== Ovqat (kunlik) — oxirgi 30 kun bo'yicha o'rtacha =====
    // Bozorlik bir kunda katta summaga qilinadi, lekin bir necha kun ishlatiladi.
    // Shu sabab: 30 kunlik oziq-ovqat xarajati ÷ 30 kunlik jami odam-kun.
    const foodFrom = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
    const isFoodCat = (c: string) => {
      const s = c.toLowerCase();
      return s.includes("oziq") || s.includes("ovqat") || s.includes("bozorlik");
    };
    const foodSum30 = cashExpenses
      .filter((e: any) => isFoodCat(String(e.category ?? "")) && String(e.expense_date ?? "") >= foodFrom)
      .reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
    const foodSumAll = cashExpenses
      .filter((e: any) => isFoodCat(String(e.category ?? "")))
      .reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
    // Texnika kategoriyasi bo'yicha jami
    const texnikaSum = cashExpenses
      .filter((e: any) => String(e.category ?? "").toLowerCase().includes("texnika"))
      .reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);
    const attRows = (data?.attendance ?? []) as any[];
    const manDaySet = new Set<string>();
    const dateSet = new Set<string>();
    const todayStr = new Date().toISOString().slice(0, 10);
    let todayPeople = 0;
    attRows.forEach((r: any) => {
      const d = String(r.attendance_date ?? "");
      const who = String(r.employee_id ?? r.employee_name ?? "");
      if (!d || !who) return;
      manDaySet.add(`${d}|${who}`);
      dateSet.add(d);
      if (d === todayStr) todayPeople++;
    });
    // Bugun ishda bo'lganlar: davomatdan (xodim/usta ajratib)
    const salaryIdSet = new Set(salaryEmployees.map((e: any) => String(e.id)));
    const dailyIdSet = new Set(dailyEmployees.map((e: any) => String(e.id)));
    const todayEmpSet = new Set<string>();
    const todayUstaSet = new Set<string>();
    attRows.forEach((r: any) => {
      if (String(r.attendance_date ?? "") !== todayStr) return;
      const id = r.employee_id ? String(r.employee_id) : "";
      const who = id || String(r.employee_name ?? "");
      if (!who) return;
      if (id && dailyIdSet.has(id)) todayUstaSet.add(who);
      else if (id && salaryIdSet.has(id)) todayEmpSet.add(who);
      else todayEmpSet.add(who);
    });
    const todayBrigadeSet = new Set<string>(
      works.filter((w: any) => String(w.work_date ?? "") === todayStr && w.brigade_name).map((w: any) => String(w.brigade_name)),
    );
    const todayEmpCount = todayEmpSet.size;
    const todayUstaCount = todayUstaSet.size;
    const todayBrigadeCount = todayBrigadeSet.size;

    const manDays30 = manDaySet.size;
    const foodPerManDay = manDays30 > 0 ? foodSum30 / manDays30 : 0;
    const avgPeoplePerDay = dateSet.size > 0 ? manDays30 / dateSet.size : 0;

    return {
      todayEmpCount, todayUstaCount, todayBrigadeCount,
      foodSum30, foodSumAll, manDays30, foodPerManDay, avgPeoplePerDay, todayPeople, texnikaSum,
      contract, matSum, workSum, expSum, salaryExpSum, otherExpSum,
      yordMatSum, yordWorkSum, boqMatSum, boqWorkSum, opsExpSum, yordTotal: yordMatSum + yordWorkSum + opsExpSum,
      spendMaterial, spendWork, spendOperatsion,
      payIn, contractIn, kassaIn, payOut, totalOut, balance,
      byMethod, inByKind, kassaNaqd, kassaBank, kassaTotal,
      progress, boqProgress, daysLeft, expectedPct, delay,
      offPlanSum, offPlanArr,
      salaryEmployees, salaryCount, salarySum, salaryPaid,
      dailyEmployees, dailyCount,
    };

  }, [data]);

  void scopeLabel;

  // Loyiha almashganda darrov yangi nomni ko'rsatamiz, ma'lumot kelishini kutmaymiz
  const noProject = !enabled;
  const stale = !!projectId && data?.project && data.project.id !== projectId;
  const showHeroNow = noProject || !data?.project || stale;
  const heroName = noProject
    ? "Avval loyihani tanlang"
    : (stale || !data?.project ? (activeName ?? "Yuklanmoqda…") : data.project.name);


  // Loyiha tanlanmagan bo'lsa ham — dashboard tarkibi ko'rinadi, lekin LockedOverlay
  // orqali xira ko'rsatiladi va tepada yonib-o'chuvchi picker turadi.


  return (
    <>

      {/* Vertikal ketma-ketlik (mobile va desktop bir xil) */}
      <div className="flex flex-col gap-2">
        {/* Loyiha hero kartasi */}
        <div className="relative">
          {noProject && (
            <div className="absolute top-3 left-0 right-0 z-30 flex justify-center">
              <HeroProjectPicker />
            </div>
          )}
          <LockedOverlay locked={noProject}>
            {(data?.project || showHeroNow) && (
              <ProjectHeroCard
                name={heroName}
                subtitle={noProject ? "Avval loyihani tanlang" : scopeLabel}
                startDate={stale || noProject ? null : data?.project?.start_date ?? null}
                endDate={stale || noProject ? null : data?.project?.end_date ?? null}
                adminName={null}
                daysLeft={stale || noProject ? null : k.daysLeft}
                shartnoma={stale || noProject ? 0 : k.contract}
                tushgan={stale || noProject ? 0 : k.contractIn}
                qoldiq={stale || noProject ? 0 : k.contract - k.contractIn}
                progress={stale || noProject ? 0 : k.progress}
                topSlot={noProject ? null : <HeroProjectPicker />}
              />
            )}
          </LockedOverlay>
          {isFetching && !noProject && (
            <div className="absolute right-3 top-3 rounded-full bg-black/40 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur">
              Yuklanmoqda…
            </div>
          )}
        </div>

        {/* KPI kartalar — vertikal mobile tartibi */}
        <LockedOverlay locked={noProject}>
          {/* 2-karta: Kassa / Kirim / Chiqim */}
          <section className={cn("rounded-2xl p-3 sm:p-4", FRAME, "kpi-tint-blue")}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Moliya</span>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </div>
            <button
              type="button"
              onClick={() => setOpen("kassa")}
              className="mt-2 flex w-full items-baseline justify-between gap-2 rounded-xl px-1 py-1 text-left transition-colors hover:bg-foreground/5"
            >
              <span className="text-xs font-semibold text-muted-foreground">Kassa qoldiq</span>
              <span className="text-2xl sm:text-3xl font-extrabold tabular-nums tracking-tight">
                {fmtUZS(noProject ? 0 : k.kassaTotal)}
              </span>
            </button>
            <div className="mt-2 grid grid-cols-2 divide-x divide-[var(--card-frame)] border-t-2 border-[var(--card-frame)] pt-2">
              <button type="button" onClick={() => setOpen("kirim")} className="flex flex-col items-center gap-0.5 px-2 py-1 transition-colors hover:bg-foreground/5">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <ArrowDownCircle className="h-3.5 w-3.5" /> Kirim
                </span>
                <span className="text-lg sm:text-xl font-extrabold tabular-nums text-success">{fmtUZSc(noProject ? 0 : k.payIn)}</span>
              </button>
              <button type="button" onClick={() => setOpen("chiqim")} className="flex flex-col items-center gap-0.5 px-2 py-1 transition-colors hover:bg-foreground/5">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <ArrowUpCircle className="h-3.5 w-3.5" /> Chiqim
                </span>
                <span className="text-lg sm:text-xl font-extrabold tabular-nums text-destructive">{fmtUZSc(noProject ? 0 : k.totalOut)}</span>
              </button>
            </div>
          </section>

          {/* 3-karta: Smeta */}
          <section className={cn("mt-2 rounded-2xl p-3 sm:p-4", FRAME, "kpi-tint-violet")}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Smeta</span>
              <Boxes className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2 grid grid-cols-3 divide-x divide-[var(--card-frame)] border-t-2 border-[var(--card-frame)] pt-2">
              {[
                { label: "Material", value: k.spendMaterial, icon: Boxes, to: "/master-zayavka", tab: "material" },
                { label: "Ishlar", value: k.spendWork, icon: Hammer, to: "/master-zayavka", tab: "work" },
                { label: "Operatsion", value: k.spendOperatsion, icon: PlusCircle, to: "/master-zayavka", tab: "variations" },
              ].map((it) => (
                <Link
                  key={it.label}
                  to={it.to as any}
                  search={{ tab: it.tab } as any}
                  className="flex flex-col items-center gap-0.5 px-1.5 py-1 text-center transition-colors hover:bg-foreground/5"
                >
                  <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    <it.icon className="h-3.5 w-3.5" /> {it.label}
                  </span>
                  <span className="text-base sm:text-lg font-extrabold tabular-nums">{fmtUZSc(noProject ? 0 : it.value)}</span>
                </Link>
              ))}
            </div>
          </section>

          {/* 4-karta: Jamoa */}
          <section className={cn("mt-2 rounded-2xl p-3 sm:p-4", FRAME, "kpi-tint-green")}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Jamoa</span>
              <Users className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="mt-2 grid grid-cols-3 divide-x divide-[var(--card-frame)] border-t-2 border-[var(--card-frame)] pt-2">
              <Link to={"/brigade-balance" as any} search={{ tab: "employees" } as any} className="flex flex-col items-center gap-0.5 px-1.5 py-1 text-center transition-colors hover:bg-foreground/5">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Users className="h-3.5 w-3.5" /> Xodimlar</span>
                <span className="text-base sm:text-lg font-extrabold tabular-nums">{fmtUZSc(noProject ? 0 : k.salaryPaid)}</span>
                <span className="text-[10px] text-muted-foreground">Bugun: {noProject ? 0 : k.todayEmpCount} nafar</span>
              </Link>
              <Link to={"/brigade-balance" as any} search={{ tab: "brigades" } as any} className="flex flex-col items-center gap-0.5 px-1.5 py-1 text-center transition-colors hover:bg-foreground/5">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><HardHat className="h-3.5 w-3.5" /> Ustalar</span>
                <span className="text-base sm:text-lg font-extrabold tabular-nums">{fmtUZSc(noProject ? 0 : k.payOut)}</span>
                <span className="text-[10px] text-muted-foreground">
                  Bugun: {noProject ? 0 : k.todayUstaCount} nafar{!noProject && k.todayBrigadeCount ? ` / ${k.todayBrigadeCount} brigada` : ""}
                </span>
              </Link>
              <Link to={"/master-jadval" as any} search={{ category: "Texnika" } as any} className="flex flex-col items-center gap-0.5 px-1.5 py-1 text-center transition-colors hover:bg-foreground/5">
                <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground"><Truck className="h-3.5 w-3.5" /> Texnika</span>
                <span className="text-base sm:text-lg font-extrabold tabular-nums">{fmtUZSc(noProject ? 0 : k.texnikaSum)}</span>
                <span className="text-[10px] text-muted-foreground">jami xarajat</span>
              </Link>
            </div>
          </section>
        </LockedOverlay>

      </div>





      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DetailContent which={open} data={data} k={k} />
        </DialogContent>
      </Dialog>
    </>
  );
}

function DetailContent({ which, data, k }: { which: DialogKey; data: any; k: any }) {
  const qc = useQueryClient();
  if (!which || !data) return null;
  const project = data.project as Project | null;

  if (which === "salary") {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Oylikga ishlaydigan xodimlar</DialogTitle>
          <DialogDescription>Faol xodimlar ({k.salaryCount} ta) · Oylik fond: {fmtUZS(k.salarySum)}</DialogDescription>
        </DialogHeader>
        {k.salaryEmployees.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-6">Oylikga ishlovchi xodim yo'q.</div>
        ) : (
          <div className="space-y-1.5 text-sm">
            {k.salaryEmployees.map((e: any) => (
              <div key={e.id} className="flex justify-between gap-2 border-b border-border/50 py-1.5">
                <div className="min-w-0">
                  <div className="truncate font-medium">{e.full_name}</div>
                  {e.position && <div className="text-[11px] text-muted-foreground truncate">{e.position}</div>}
                </div>
                <span className="tabular-nums font-semibold shrink-0">{fmtUZS(Number(e.monthly_salary ?? 0))}</span>
              </div>
            ))}
          </div>
        )}
      </>
    );
  }

  if (which === "kirim") {
    const kinds = Object.entries(k.inByKind) as [string, number][];
    const naqd = Number(k.inByKind.Naqd ?? 0);
    const bank = Number(k.inByKind.Bank ?? 0) + Number(k.inByKind.Karta ?? 0);
    return (
      <>
        <DialogHeader><DialogTitle>Kirim — {fmtUZS(k.payIn)}</DialogTitle><DialogDescription>To'lov usuli bo'yicha</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Naxd</div>
            <div className="font-semibold text-success">{fmtUZS(naqd)}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="text-xs text-muted-foreground">Bank</div>
            <div className="font-semibold text-success">{fmtUZS(bank)}</div>
          </div>
        </div>
        {kinds.length === 0 && <div className="mt-3 text-xs text-muted-foreground">Hozircha kirim yo'q.</div>}
      </>
    );
  }

  if (which === "chiqim") {
    const bank = Number(k.byMethod.Bank ?? 0) + Number(k.byMethod.Karta ?? 0);
    return (
      <>
        <DialogHeader><DialogTitle>Chiqim — {fmtUZS(k.totalOut)}</DialogTitle><DialogDescription>To'lov turi bo'yicha</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Naxd</div>
            <div className="mt-1 text-lg font-semibold">{fmtUZS(k.byMethod.Naqd)}</div>
          </div>
          <div className="rounded-lg border p-4">
            <div className="text-xs text-muted-foreground">Bank</div>
            <div className="mt-1 text-lg font-semibold">{fmtUZS(bank)}</div>
          </div>
        </div>
      </>
    );
  }


  if (which === "kassa") {
    return (
      <>
        <DialogHeader><DialogTitle>Kassa balansi</DialogTitle><DialogDescription>Hozirda mavjud mablag'</DialogDescription></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border p-4 text-center">
            <div className="text-xs text-muted-foreground">Naxd</div>
            <div className={cn("mt-1 text-2xl font-bold tabular-nums", k.kassaNaqd < 0 ? "text-destructive" : "text-success")}>{fmtUZS(k.kassaNaqd)}</div>
          </div>
          <div className="rounded-lg border p-4 text-center">
            <div className="text-xs text-muted-foreground">Bank</div>
            <div className={cn("mt-1 text-2xl font-bold tabular-nums", k.kassaBank < 0 ? "text-destructive" : "text-success")}>{fmtUZS(k.kassaBank)}</div>
          </div>
        </div>
      </>
    );
  }

  if (which === "offplan") {
    return (
      <>
        <DialogHeader><DialogTitle>Rejadan tashqari summa</DialogTitle><DialogDescription>Reja (BOQ) doirasidan tashqari qo'shimcha xarajatlar</DialogDescription></DialogHeader>
        <div className="rounded-lg border p-4 text-center mb-3">
          <div className="text-xs text-muted-foreground">Jami</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-warning">{fmtUZS(k.offPlanSum)}</div>
        </div>
        {k.offPlanArr.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center">Rejadan tashqari xarajatlar yo'q.</div>
        ) : (
          <div className="space-y-1.5 text-sm">
            {k.offPlanArr.map((r: any) => {
              const paid = Number(r.paid_amount) || 0;
              const recv = (Number(r.qty_received) || 0) * (Number(r.unit_price) || 0);
              const planned = Number(r.total) || (Number(r.qty) || 0) * (Number(r.unit_price) || 0);
              const val = Math.max(paid, recv, planned);
              return (
                <div key={r.id} className="flex justify-between gap-2 border-b border-border/50 py-1.5">
                  <span className="truncate">{r.name}</span>
                  <span className="tabular-nums font-medium shrink-0">{fmtUZS(val)}</span>
                </div>
              );
            })}
          </div>
        )}
      </>
    );
  }

  if (which === "materials") {
    return (
      <>
        <DialogHeader><DialogTitle>Materiallar</DialogTitle><DialogDescription>Materiallarga ketgan umumiy summa</DialogDescription></DialogHeader>
        <div className="rounded-lg border p-4 text-center">
          <div className="text-xs text-muted-foreground">Jami</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{fmtUZS(k.matSum)}</div>
        </div>
      </>
    );
  }

  if (which === "works") {
    return (
      <>
        <DialogHeader><DialogTitle>Ish summasi</DialogTitle><DialogDescription>Umumiy bajarilgan ish summasi</DialogDescription></DialogHeader>
        <div className="rounded-lg border p-4 text-center">
          <div className="text-xs text-muted-foreground">Jami</div>
          <div className="mt-1 text-2xl font-bold tabular-nums">{fmtUZS(k.workSum)}</div>
        </div>
      </>
    );
  }

  if (which === "progress") {
    const forceRefresh = async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["project-kpis-v3"] }),
        qc.invalidateQueries({ queryKey: ["boq"] }),
        qc.invalidateQueries({ queryKey: ["boq_items"] }),
        qc.invalidateQueries({ queryKey: ["smeta"] }),
        qc.invalidateQueries({ queryKey: ["material_receipts"] }),
        qc.invalidateQueries({ queryKey: ["work_progress"] }),
        qc.invalidateQueries({ queryKey: ["project_zayavka"] }),
      ]);
      await qc.refetchQueries({ queryKey: ["project-kpis-v3"] });
      toast.success("Bajarilish qayta hisoblandi");
    };
    return (
      <>
        <DialogHeader><DialogTitle>Bajarilish</DialogTitle><DialogDescription>Amaldagi bajarilish darajasi</DialogDescription></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg border p-4 text-center">
            <div className="text-xs text-muted-foreground">Amaldagi</div>
            <div className="mt-1 text-3xl font-bold tabular-nums text-primary">{k.progress}%</div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-primary" style={{ width: `${k.progress}%` }} />
          </div>
          <Button onClick={forceRefresh} variant="outline" className="w-full gap-2">
            <RefreshCw className="h-4 w-4" />
            Qayta hisoblash
          </Button>
        </div>
      </>
    );
  }

  if (which === "deadline") {
    return (
      <>
        <DialogHeader><DialogTitle>Tugash sanasi va vaqt holati</DialogTitle></DialogHeader>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">Boshlanish</dt><dd className="font-semibold">{project?.start_date ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Tugash</dt><dd className="font-semibold">{project?.end_date ?? "—"}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Qolgan kun</dt>
            <dd className={`font-semibold ${k.daysLeft != null && k.daysLeft < 0 ? "text-destructive" : ""}`}>
              {k.daysLeft == null ? "—" : k.daysLeft < 0 ? `${Math.abs(k.daysLeft)} kun kechikdi` : `${k.daysLeft} kun`}
            </dd>
          </div>
          <div><dt className="text-xs text-muted-foreground">Reja bajarilishi</dt><dd>{k.expectedPct == null ? "—" : `${k.expectedPct}%`}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Amaldagi bajarilish</dt><dd>{k.progress}%</dd></div>
          <div><dt className="text-xs text-muted-foreground">Vaqt holati</dt>
            <dd className={k.delay == null ? "" : k.delay >= 0 ? "text-success font-semibold" : "text-destructive font-semibold"}>
              {k.delay == null ? "—" : k.delay >= 0 ? `+${k.delay}% oldinda` : `${k.delay}% kechikish`}
            </dd>
          </div>
        </dl>
      </>
    );
  }

  return null;
}
