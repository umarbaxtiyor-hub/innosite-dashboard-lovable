import { useQuery } from "@tanstack/react-query";
import { Activity, Package, Hammer, ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { fmtUZS } from "@/lib/queries";

export function WeeklyActivityCard({ projectId }: { projectId?: string | null }) {
  const { data } = useQuery({
    queryKey: ["weekly-activity", projectId ?? "all"],
    staleTime: 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);

      const mr = supabase.from("material_receipts").select("id,total_price,qty,unit_price,received_at").gte("received_at", since);
      const wp = supabase.from("work_progress").select("id,total_value,qty_done,unit_price,work_date").gte("work_date", since);
      const ex = supabase.from("expenses").select("id,amount,expense_date").gte("expense_date", since);
      const inc = supabase.from("incomes").select("id,amount,income_date").gte("income_date", since);
      const bp = supabase.from("brigade_payments").select("id,amount,kind,payment_date").gte("payment_date", since);

      const [m, w, e, i, b] = await Promise.all([
        projectId ? mr.eq("project_id", projectId) : mr,
        projectId ? wp.eq("project_id", projectId) : wp,
        projectId ? ex.eq("project_id", projectId) : ex,
        projectId ? inc.eq("project_id", projectId) : inc,
        projectId ? bp.eq("project_id", projectId) : bp,
      ]);

      const matSum = (m.data ?? []).reduce((s: number, r: any) => s + (Number(r.total_price) || Number(r.qty) * Number(r.unit_price) || 0), 0);
      const workSum = (w.data ?? []).reduce((s: number, r: any) => s + (Number(r.total_value) || Number(r.qty_done) * Number(r.unit_price) || 0), 0);
      const expSum = (e.data ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const incSum = (i.data ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const avansSum = (b.data ?? []).filter((r: any) => r.kind === "avans").reduce((s: number, r: any) => s + Number(r.amount || 0), 0);

      return {
        mat: { count: m.data?.length ?? 0, sum: matSum },
        work: { count: w.data?.length ?? 0, sum: workSum },
        exp: { count: e.data?.length ?? 0, sum: expSum },
        inc: { count: i.data?.length ?? 0, sum: incSum },
        avans: { count: (b.data ?? []).filter((r: any) => r.kind === "avans").length, sum: avansSum },
      };
    },
  });

  // Haftalik xarajat trendi — so'nggi 12 hafta
  const { data: trend = [] } = useQuery({
    queryKey: ["weekly-expense-trend", projectId ?? "all"],
    staleTime: 60_000,
    queryFn: async () => {
      let q = supabase.from("expenses").select("amount,expense_date").order("expense_date", { ascending: true });
      if (projectId) q = q.eq("project_id", projectId);
      const { data } = await q;
      const rows = data ?? [];
      if (!rows.length) return [] as { week: string; amount: number }[];
      const map = new Map<string, number>();
      rows.forEach((e: any) => {
        const d = new Date(e.expense_date);
        const day = d.getUTCDay();
        const diff = day === 0 ? -6 : 1 - day;
        const monday = new Date(d);
        monday.setUTCDate(d.getUTCDate() + diff);
        const k = monday.toISOString().slice(5, 10);
        map.set(k, (map.get(k) ?? 0) + Number(e.amount));
      });
      return Array.from(map, ([week, amount]) => ({ week, amount }))
        .sort((a, b) => a.week.localeCompare(b.week))
        .slice(-12);
    },
  });

  const items = [
    { label: "Materiallar", icon: Package, count: data?.mat.count ?? 0, sum: data?.mat.sum ?? 0, tone: "text-primary" },
    { label: "Ishlar", icon: Hammer, count: data?.work.count ?? 0, sum: data?.work.sum ?? 0, tone: "text-primary" },
    { label: "Kirimlar", icon: ArrowDownCircle, count: data?.inc.count ?? 0, sum: data?.inc.sum ?? 0, tone: "text-success" },
    { label: "Xarajatlar", icon: ArrowUpCircle, count: data?.exp.count ?? 0, sum: data?.exp.sum ?? 0, tone: "text-destructive" },
    { label: "Brigada avansi", icon: Wallet, count: data?.avans.count ?? 0, sum: data?.avans.sum ?? 0, tone: "text-warning" },
  ];

  return (
    <div className="rounded-xl border-2 border-[var(--card-frame)] bg-card p-3">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">Haftalik faollik</h3>
        <span className="ml-auto text-[10px] text-muted-foreground">So'nggi 7 kun · trend 12 hafta</span>
      </div>

      <div className="mt-2 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          {items.map((it) => {
            const Icon = it.icon;
            return (
              <div key={it.label} className="flex items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
                <Icon className={`h-3.5 w-3.5 shrink-0 ${it.tone}`} />
                <span className="text-xs font-medium truncate flex-1">{it.label}</span>
                <span className="text-[10px] text-muted-foreground tabular-nums">{it.count}×</span>
                <span className={`text-xs font-semibold tabular-nums ${it.tone}`}>{fmtUZS(it.sum)}</span>
              </div>
            );
          })}
        </div>

        <div className="min-h-[180px]">
          <div className="text-[10px] text-muted-foreground mb-1">Haftalik xarajat trendi</div>
          {trend.length === 0 ? (
            <div className="flex h-[160px] items-center justify-center text-[11px] text-muted-foreground">
              Ma'lumot yo'q
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={trend} margin={{ left: -10, right: 8, top: 5, bottom: 0 }}>
                <defs>
                  <linearGradient id="weeklyAreaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="week" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(v: number) => fmtUZS(v)}
                  contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                />
                <Area type="monotone" dataKey="amount" stroke="var(--primary)" strokeWidth={2.5} fill="url(#weeklyAreaGrad)" dot={{ r: 2.5 }} activeDot={{ r: 4 }} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
  );
}
