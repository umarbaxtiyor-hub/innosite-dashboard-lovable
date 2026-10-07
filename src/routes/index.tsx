import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import {
  ResponsiveContainer, Tooltip,
  PieChart, Pie, Cell, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  AreaChart, Area,
} from "recharts";

import { useActiveProject } from "@/lib/project-context";
import { useBoq, fmtUZS } from "@/lib/queries";
import { ProjectKpiGrid } from "@/components/dashboard/ProjectKpiGrid";
import { LockedOverlay } from "@/components/LockedOverlay";





export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard — QurilishNazorat" },
      { name: "description", content: "Loyiha KPI'lari: byudjet, fakt xarajat, ish bajarilishi, qo'shimcha ishlar va xarajatlar." },
    ],
  }),
  component: DashboardPage,
});

const CHART_COLORS = [
  "var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)",
  "var(--chart-5)", "var(--chart-6)", "var(--chart-7)", "var(--chart-8)",
];

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

function DashboardPage() {
  const { activeProjectId, activeProject } = useActiveProject();
  const qc = useQueryClient();

  const { data: allProjects = [] } = useQuery({
    queryKey: ["projects-with-firm"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("projects")
        .select("id,firm_id")
        .order("name");
      if (error) throw error;
      return (data ?? []) as { id: string; firm_id: string | null }[];
    },
  });

  const effectiveFirmId = allProjects.find((p) => p.id === activeProjectId)?.firm_id ?? null;

  const boq = useBoq(activeProjectId).data ?? [];

  const { data: realSpend } = useQuery({
    queryKey: ["dashboard-real-spend", activeProjectId ?? "all"],
    staleTime: 2 * 60_000,
    gcTime: 10 * 60_000,
    queryFn: async () => {
      const [ex, mat, wp, bp, off] = await Promise.all([
        fetchAllRows<any>((from, to) => {
          const q = supabase.from("expenses").select("category,amount,project_id").or("source.is.null,and(source.neq.web_boq,source.neq.web_boq_mat),and(source.eq.web_boq,kind.in.(boq_work,ustalar))");
          return (activeProjectId ? q.eq("project_id", activeProjectId) : q).range(from, to);
        }),
        fetchAllRows<any>((from, to) => {
          const q = supabase.from("material_receipts").select("total_price,qty,unit_price,project_id");
          return (activeProjectId ? q.eq("project_id", activeProjectId) : q).range(from, to);
        }),
        fetchAllRows<any>((from, to) => {
          const q = supabase.from("work_progress").select("total_value,qty_done,unit_price,project_id");
          return (activeProjectId ? q.eq("project_id", activeProjectId) : q).range(from, to);
        }),
        fetchAllRows<any>((from, to) => {
          const q = supabase.from("brigade_payments").select("amount,kind,project_id");
          return (activeProjectId ? q.eq("project_id", activeProjectId) : q).range(from, to);
        }),
        fetchAllRows<any>((from, to) => {
          const q = supabase.from("project_zayavka").select("total,paid_amount,qty,qty_received,unit_price,project_id,off_plan").eq("off_plan", true);
          return (activeProjectId ? q.eq("project_id", activeProjectId) : q).range(from, to);
        }),
      ]);

      const m = new Map<string, number>();
      const add = (k: string, v: number) => { if (v > 0) m.set(k, (m.get(k) ?? 0) + v); };

      // Xodimlarga tegishli xarajat kategoriyalari — Xodimlar guruhiga birlashtiramiz
      const isSalaryCat = (c: string) => {
        const s = c.toLowerCase();
        return s.includes("oylik") || s.includes("ish haqi") || s.includes("maosh");
      };
      for (const r of ex) {
        const cat = String(r.category || "Boshqa");
        const key = isSalaryCat(cat) ? "Xodimlar" : cat;
        add(key, Number(r.amount) || 0);
      }
      const matSum = mat.reduce(
        (s: number, r: any) => s + (Number(r.total_price) || Number(r.qty) * Number(r.unit_price) || 0), 0,
      );
      add("Material (BOQ)", matSum);
      const wpSum = wp.reduce(
        (s: number, r: any) => s + (Number(r.total_value) || Number(r.qty_done) * Number(r.unit_price) || 0), 0,
      );
      add("Ish (BOQ)", wpSum);
      const bpSum = bp.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      add("Xodimlar", bpSum);
      const offSum = off.reduce((s: number, r: any) => {
        const paid = Number(r.paid_amount) || 0;
        const recv = (Number(r.qty_received) || 0) * (Number(r.unit_price) || 0);
        return s + Math.max(paid, recv);
      }, 0);
      add("Yordamchi (BOQ)", offSum);

      // Barcha haqiqiy kategoriyalarni ko'rsatamiz, katta summadan boshlab
      return Array.from(m, ([name, value]) => ({ name, value }))
        .filter((r) => r.value > 0)
        .sort((a, b) => b.value - a.value);
    },
  });

  const costByCategory = (() => {
    if (realSpend && realSpend.length) return realSpend;
    const m = new Map<string, number>();
    boq.forEach((i) => m.set(i.category ?? "Boshqa", (m.get(i.category ?? "Boshqa") ?? 0) + Number(i.actual_cost)));
    return Array.from(m, ([name, value]) => ({ name, value })).filter((r) => r.value > 0);
  })();

  // Reja vs Fakt — smeta (project_zayavka master) bo'yicha. boq_items bo'sh bo'lganda ham ishlaydi.
  const { data: plannedVsActual = [] } = useQuery({
    queryKey: ["dashboard-plan-vs-fact", activeProjectId ?? "all"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const q = supabase
        .from("project_zayavka")
        .select("kind,qty,qty_received,unit_price,total,off_plan")
        .eq("off_plan", false)
        .is("zayavka_no", null)
        .is("parent_id", null);
        const { data } = activeProjectId ? await q.eq("project_id", activeProjectId) : await q;
      const labels: Record<string, string> = { material: "Material", work: "Ishlar", equipment: "Uskuna" };
      const m = new Map<string, { planned: number; actual: number }>();
      (data ?? []).forEach((r: any) => {
        const name = labels[String(r.kind)] ?? "Boshqa";
        const cur = m.get(name) ?? { planned: 0, actual: 0 };
        const up = Number(r.unit_price) || 0;
        cur.planned += Number(r.total) || Number(r.qty ?? 0) * up;
        cur.actual += Number(r.qty_received ?? 0) * up;
        m.set(name, cur);
      });
      // BOQ items fallback (agar bo'lsa, qo'shamiz)
      if (activeProjectId) {
        const { data: boqRows } = await supabase
          .from("boq_items").select("category,planned_cost,actual_cost")
          .eq("project_id", activeProjectId);
        (boqRows ?? []).forEach((i: any) => {
          const name = i.category ?? "Boshqa";
          const cur = m.get(name) ?? { planned: 0, actual: 0 };
          cur.planned += Number(i.planned_cost ?? 0);
          cur.actual += Number(i.actual_cost ?? 0);
          m.set(name, cur);
        });
      }
      return Array.from(m, ([name, v]) => ({ name, ...v }))
        .filter((r) => r.planned + r.actual > 0)
        .sort((a, b) => b.planned - a.planned)
        .slice(0, 6);
    },
  });


  // 30-kunlik xarajat dinamikasi — 3-chart
  const { data: dailySpend } = useQuery({
    queryKey: ["dashboard-daily-spend", activeProjectId ?? "all"],
    staleTime: 2 * 60_000,
    enabled: !!activeProjectId,
    queryFn: async () => {
      const from = new Date(); from.setDate(from.getDate() - 30);
      const fromStr = from.toISOString().slice(0, 10);
      const data = await fetchAllRows<any>((fromIdx, toIdx) => {
        const q = supabase.from("expenses").select("amount,expense_date").or("source.is.null,and(source.neq.web_boq,source.neq.web_boq_mat),and(source.eq.web_boq,kind.in.(boq_work,ustalar))").gte("expense_date", fromStr);
        return (activeProjectId ? q.eq("project_id", activeProjectId) : q).range(fromIdx, toIdx);
      });
      const m = new Map<string, number>();
      for (let i = 0; i < 30; i++) {
        const d = new Date(); d.setDate(d.getDate() - (29 - i));
        m.set(d.toISOString().slice(5, 10), 0);
      }
      data.forEach((r: any) => {
        const k = String(r.expense_date ?? "").slice(5, 10);
        if (m.has(k)) m.set(k, (m.get(k) ?? 0) + Number(r.amount ?? 0));
      });
      return Array.from(m, ([day, v]) => ({ day, value: v }));
    },
  });

  const chartCardCls = "relative overflow-hidden rounded-xl border-2 border-[var(--card-frame)] bg-card p-3 shadow-sm";


  return (
    <div className="pastel-canvas flex flex-col gap-3 p-3 sm:p-4 lg:p-6 lg:max-w-[1600px] lg:mx-auto w-full">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">

        {/* Chap: hero + KPI vertikal */}
        <div className="lg:col-span-7">
          <ProjectKpiGrid projectId={activeProjectId} activeName={activeProject?.name ?? null} />
        </div>

        {/* O'ng: 3 ta diagramma (desktop). Mobile'da pastga tushadi. */}
        {activeProjectId && (
          <div className="lg:col-span-5 flex flex-col gap-3">
            <LockedOverlay locked={!activeProjectId && effectiveFirmId !== null}>
              <div className={chartCardCls}>
                <div className="mb-1">
                  <h3 className="text-sm font-semibold text-foreground">Kategoriya bo'yicha xarajat</h3>
                  <p className="text-[10px] text-muted-foreground">Fakt xarajat ulushlari</p>
                </div>
                <div className="h-56">
                  {costByCategory.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">Ma'lumot yo'q</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={[...costByCategory].sort((a, b) => b.value - a.value)} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius="75%" innerRadius="45%" paddingAngle={2} stroke="var(--background)" strokeWidth={2}>
                          {costByCategory.map((_, i) => (<Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />))}
                        </Pie>
                        <Tooltip formatter={(v: number) => fmtUZS(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11, color: "var(--foreground)" }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            </LockedOverlay>

            <div className={chartCardCls}>
              <div className="mb-1">
                <h3 className="text-sm font-semibold text-foreground">Reja vs Fakt</h3>
                <p className="text-[10px] text-muted-foreground">BOQ kategoriyalari bo'yicha</p>
              </div>
              <div className="h-56">
                {plannedVsActual.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">Ma'lumot yo'q</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={plannedVsActual}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
                      <Tooltip formatter={(v: number) => fmtUZS(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="planned" name="Reja" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="actual" name="Fakt" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className={chartCardCls}>
              <div className="mb-1">
                <h3 className="text-sm font-semibold text-foreground">Oxirgi 30 kun xarajat</h3>
                <p className="text-[10px] text-muted-foreground">Kunlik dinamika</p>
              </div>
              <div className="h-56">
                {!dailySpend || dailySpend.length === 0 ? (
                  <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">Ma'lumot yo'q</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={dailySpend}>
                      <defs>
                        <linearGradient id="gradSpend" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor="var(--chart-3)" stopOpacity={0.6} />
                          <stop offset="100%" stopColor="var(--chart-3)" stopOpacity={0.05} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="day" tick={{ fontSize: 9 }} interval={4} />
                      <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `${Math.round(v / 1e6)}M`} />
                      <Tooltip formatter={(v: number) => fmtUZS(v)} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }} />
                      <Area type="monotone" dataKey="value" stroke="var(--chart-3)" fill="url(#gradSpend)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
