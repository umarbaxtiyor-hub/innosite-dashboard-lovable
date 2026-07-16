import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { fmtUZS, fmtUZSc } from "@/lib/queries";
import { cn } from "@/lib/utils";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  ArrowDownCircle, ArrowUpCircle, Wallet,
  Boxes, PlusCircle, Users, HardHat, Hammer,
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

type Tint = "green" | "red" | "blue" | "violet" | "orange" | "teal" | "default";

// Light/dark adaptiv — har bir tint uchun juda och pastel rang aralashtirilgan.
// Karta romkasi (var(--card-frame)) saqlanadi.
const FRAME = "border-2 border-[var(--card-frame)]";
const TINTS: Record<Tint, { card: string; icon: string; value: string }> = {
  green:   { card: `${FRAME} kpi-tint-green`,  icon: "bg-[color-mix(in_oklab,#34d399_22%,var(--card))] text-foreground", value: "text-foreground" },
  red:     { card: `${FRAME} kpi-tint-red`,    icon: "bg-[color-mix(in_oklab,#f87171_22%,var(--card))] text-foreground", value: "text-foreground" },
  blue:    { card: `${FRAME} kpi-tint-blue`,   icon: "bg-[color-mix(in_oklab,#60a5fa_22%,var(--card))] text-foreground", value: "text-foreground" },
  violet:  { card: `${FRAME} kpi-tint-violet`, icon: "bg-[color-mix(in_oklab,#a78bfa_22%,var(--card))] text-foreground", value: "text-foreground" },
  orange:  { card: `${FRAME} kpi-tint-orange`, icon: "bg-[color-mix(in_oklab,#fb923c_22%,var(--card))] text-foreground", value: "text-foreground" },
  teal:    { card: `${FRAME} kpi-tint-teal`,   icon: "bg-[color-mix(in_oklab,#2dd4bf_22%,var(--card))] text-foreground", value: "text-foreground" },
  default: { card: `${FRAME} bg-card`,         icon: "bg-muted text-foreground", value: "text-foreground" },
};



function KpiCard({
  label, value, hint, tint = "default", icon: Icon, onClick, to, search, full, large,
}: {
  label: string; value: string; hint?: string;
  tint?: Tint; icon: any;
  onClick?: () => void;
  to?: string;
  search?: Record<string, any>;
  full?: boolean; large?: boolean;
}) {
  const t = TINTS[tint];
  const baseFull = cn("group relative flex w-full items-center gap-3 rounded-2xl border p-4 sm:p-5 text-center transition-all hover:shadow-md hover:-translate-y-0.5", t.card);
  const baseGrid = cn("group relative block w-full rounded-2xl border p-3 sm:p-4 text-left transition-all hover:shadow-md hover:-translate-y-0.5", t.card);

  const fullInner = (
    <>
      <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-full", t.icon)}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1 text-center">
        <div className="text-[12px] font-bold uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className={cn("mt-1 text-2xl sm:text-3xl font-extrabold tabular-nums leading-tight tracking-tight", t.value)}>{value}</div>
        {hint && <div className="mt-0.5 truncate text-[10px] font-medium text-muted-foreground">{hint}</div>}
      </div>
      <div className="h-12 w-12 shrink-0" aria-hidden />
    </>
  );

  const gridInner = (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <div className={cn("flex shrink-0 items-center justify-center rounded-full h-9 w-9", t.icon)}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-muted-foreground leading-tight">{label}</div>
      <div className={cn("font-extrabold tabular-nums leading-tight tracking-tight break-words", t.value, large ? "text-xl sm:text-2xl" : "text-lg sm:text-xl")}>{value}</div>
      {hint && <div className="truncate text-[10px] font-medium text-muted-foreground">{hint}</div>}
    </div>
  );


  if (to) {
    return (
      <Link to={to as any} search={search as any} className={full ? baseFull : baseGrid}>
        {full ? fullInner : gridInner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={full ? baseFull : baseGrid}>
      {full ? fullInner : gridInner}
    </button>
  );
}

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
    staleTime: 0,
    gcTime: 10 * 60_000,
    refetchInterval: 15_000,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
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
        return { projects, project: null, materials: [], works: [], expenses: [], payments: [], boq: [], zMasters: [], incomes: [], offPlan: [], employees: [] };
      }

      const [mats, works, exps, pays, boqs, incs, offp, emps, zmasters] = await Promise.all([
        supabase.from("material_receipts").select("id,material_name,qty,unit,unit_price,total_price,supplier_name,received_at,boq_code").in("project_id", ids).order("received_at", { ascending: false }).limit(500),
        supabase.from("work_progress").select("id,work_type,qty_done,unit,unit_price,total_value,brigade_name,work_date,boq_code").in("project_id", ids).order("work_date", { ascending: false }).limit(500),
        supabase.from("expenses").select("id,category,description,amount,expense_date,paid_by,payment_method").in("project_id", ids).order("expense_date", { ascending: false }).limit(500),
        supabase.from("brigade_payments").select("id,brigade_name,kind,amount,payment_date,note").in("project_id", ids).order("payment_date", { ascending: false }).limit(500),
        supabase.from("boq_items").select("id,code,description,category,qty,unit,planned_cost,actual_cost").in("project_id", ids),
        supabase.from("incomes").select("id,amount,category,payment_method,income_date,description,payer,source").in("project_id", ids).order("income_date", { ascending: false }).limit(500),
        supabase.from("project_zayavka").select("id,name,total,paid_amount,qty,qty_received,unit_price,status,off_plan").in("project_id", ids).eq("off_plan", true),
        firmIds.length
          ? supabase.from("employees").select("id,full_name,position,phone,monthly_salary,active,firm_id").in("firm_id", firmIds).eq("active", true)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("project_zayavka").select("id,name,kind,qty,qty_received,unit_price,total,off_plan").in("project_id", ids).is("zayavka_no", null).is("parent_id", null),
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
        materials: mats.data ?? [],
        works: works.data ?? [],
        expenses: exps.data ?? [],
        payments: pays.data ?? [],
        boq: boqs.data ?? [],
        zMasters: zmasters.data ?? [],
        incomes: incs.data ?? [],
        offPlan: offp.data ?? [],
        employees: emps.data ?? [],
      };
    },
  });

  const k = useMemo(() => {
    const project = data?.project ?? null;
    const contract = Number(project?.total_budget ?? 0);
    const matSum = (data?.materials ?? []).reduce((s: number, r: any) => s + (Number(r.total_price) || Number(r.qty) * Number(r.unit_price) || 0), 0);
    const workSum = (data?.works ?? []).reduce((s: number, r: any) => s + (Number(r.total_value) || Number(r.qty_done) * Number(r.unit_price) || 0), 0);
    const expSum = (data?.expenses ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);

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
    const payOut = (data?.payments ?? []).filter((r: any) => r.kind === "avans").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const totalOut = matSum + workSum + expSum + payOut;
    const balance = contract - totalOut;

    // Payment-method breakdown of expenses (Naqd / Bank / Karta)
    const byMethod = { Naqd: 0, Bank: 0, Karta: 0 } as Record<string, number>;
    (data?.expenses ?? []).forEach((e: any) => {
      const m = (e.payment_method as string) || "Naqd";
      byMethod[m] = (byMethod[m] ?? 0) + Number(e.amount ?? 0);
    });
    // Material / ish / usta to'lovlarida payment_method yo'q — default Naqd
    byMethod.Naqd += matSum + workSum + payOut;

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
    const doneByCode: Record<string, number> = {};
    const doneByDesc: Record<string, number> = {};
    works.forEach((w: any) => {
      const c = (w.boq_code || "").toString().trim();
      const d = (w.work_type || "").toLowerCase().trim();
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
      const done = doneByCode[b.code] ?? doneByDesc[(b.description || "").toLowerCase().trim()] ?? 0;
      const pct = planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0;
      return { ...b, done, pct, matQty: matByCode[b.code] ?? 0 };
    });
    // Fallback: project_zayavka masters (smeta uploaded as zayavka)
    const zMasters = (data?.zMasters ?? []) as any[];
    const zProgress = zMasters.map((m) => {
      const planned = Number(m.qty ?? 0);
      const done = Number(m.qty_received ?? 0);
      const pct = planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0;
      return { pct, planned };
    }).filter((x) => x.planned > 0);
    const combined = boqProgress.length ? boqProgress.map((b: any) => ({ pct: b.pct })) : zProgress;
    const qtyProgress = combined.length
      ? Math.round(combined.reduce((s, b) => s + b.pct, 0) / combined.length)
      : 0;
    const activeProgress = combined.filter((b) => b.pct > 0).length
      ? Math.round(combined.filter((b) => b.pct > 0).reduce((s, b) => s + b.pct, 0) / combined.filter((b) => b.pct > 0).length)
      : 0;
    const smetaLimit = zMasters.reduce((s, m) => {
      const total = Number(m.total) || Number(m.qty ?? 0) * Number(m.unit_price ?? 0) || 0;
      return s + total;
    }, 0);
    const usedAgainstSmeta = matSum + workSum;
    const valueProgress = smetaLimit > 0 ? Math.round((usedAgainstSmeta / smetaLimit) * 100) : 0;
    const progress = Math.min(999, Math.max(qtyProgress, activeProgress, valueProgress));

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
    // Xodimlarga shu kungacha to'langan (expenses ichida oylik/ish haqi/avans kategoriyalari)
    const salaryPaid = (data?.expenses ?? []).filter((e: any) => {
      const c = String(e.category ?? "").toLowerCase();
      return c.includes("oylik") || c.includes("ish haqi") || c.includes("avans") || c.includes("maosh");
    }).reduce((s: number, e: any) => s + Number(e.amount ?? 0), 0);

    return {
      contract, matSum, workSum, expSum, payIn, contractIn, kassaIn, payOut, totalOut, balance,
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
          <KpiCard
            label="Kassa"
            value={fmtUZS(noProject ? 0 : k.kassaTotal)}
            tint="blue"
            icon={Wallet}
            onClick={() => setOpen("kassa")}
            full
            large
          />
          <div className="mt-2 grid grid-cols-2 gap-2">
            <KpiCard label="Kirim" value={fmtUZSc(noProject ? 0 : k.payIn)} tint="green" icon={ArrowDownCircle} onClick={() => setOpen("kirim")} large />
            <KpiCard label="Chiqim" value={fmtUZSc(noProject ? 0 : k.totalOut)} tint="red" icon={ArrowUpCircle} onClick={() => setOpen("chiqim")} large />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <KpiCard label="Material" value={fmtUZSc(noProject ? 0 : k.matSum)} tint="violet" icon={Boxes} to="/master-zayavka" search={{ tab: "material" }} />
            <KpiCard label="Ishlar" value={fmtUZSc(noProject ? 0 : k.workSum)} tint="teal" icon={Hammer} to="/master-zayavka" search={{ tab: "work" }} />
            <KpiCard label="Yordamchi" value={fmtUZSc(noProject ? 0 : k.offPlanSum)} tint="orange" icon={PlusCircle} to="/master-zayavka" search={{ tab: "variations" }} />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <KpiCard label="Xodimlar" value={fmtUZSc(noProject ? 0 : k.salaryPaid)} tint="green" icon={Users} to="/brigade-balance" search={{ tab: "employees" }} />
            <KpiCard label="Ustalar" value={fmtUZSc(noProject ? 0 : k.payOut)} tint="blue" icon={HardHat} to="/brigade-balance" search={{ tab: "brigades" }} />
          </div>
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
          <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Naxd</div><div className="font-semibold">{fmtUZS(k.byMethod.Naqd)}</div></div>
          <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Bank</div><div className="font-semibold">{fmtUZS(bank)}</div></div>
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
