import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { ArrowDown, ArrowUp, FileSignature, ArrowDownCircle, ArrowUpCircle, TrendingUp, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUZS } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Scope = { projectId?: string | null; firmId?: string | null };

function ymKey(d: string | null | undefined) {
  if (!d) return "";
  return d.slice(0, 7);
}

function fmtMonth(ym: string) {
  const m = ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"];
  const [, mm] = ym.split("-");
  return m[Number(mm) - 1] ?? ym;
}

function compact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return (n / 1e9).toFixed(1) + " mlrd";
  if (abs >= 1e6) return (n / 1e6).toFixed(1) + " mln";
  if (abs >= 1e3) return (n / 1e3).toFixed(0) + "k";
  return String(Math.round(n));
}

function ExecCard({
  label, value, delta, deltaLabel, tone = "default", icon: Icon,
}: {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  tone?: "default" | "success" | "danger" | "primary" | "warn";
  icon: any;
}) {
  const toneCls = {
    default: "text-foreground",
    success: "text-success",
    danger: "text-destructive",
    primary: "text-primary",
    warn: "text-warning",
  }[tone];
  const up = (delta ?? 0) >= 0;
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-primary/5 blur-2xl" />
      <div className="relative">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className={cn("mt-2 text-lg sm:text-xl font-extrabold tabular-nums leading-tight tracking-tight", toneCls)}>
          {value}
        </div>
        {delta != null && (
          <div className="mt-1.5 flex items-center gap-1 text-[11px] font-medium">
            <span className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5",
              up ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
              {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {Math.abs(delta).toFixed(1)}%
            </span>
            {deltaLabel && <span className="text-muted-foreground">{deltaLabel}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function ExecutiveOverview({ projectId, firmId }: Scope) {
  const enabled = projectId !== undefined || firmId !== undefined;

  const { data } = useQuery({
    queryKey: ["exec-overview", projectId ?? "x", firmId ?? "x"],
    enabled,
    staleTime: 30_000,
    queryFn: async () => {
      let ids: string[] = [];
      let contract = 0;
      if (projectId) {
        const { data: p } = await supabase.from("projects").select("id,total_budget").eq("id", projectId).maybeSingle();
        if (p) { ids = [p.id]; contract = Number(p.total_budget ?? 0); }
      } else if (firmId) {
        const { data: ps } = await supabase.from("projects").select("id,total_budget").eq("firm_id", firmId);
        (ps ?? []).forEach((p: any) => { ids.push(p.id); contract += Number(p.total_budget ?? 0); });
      } else {
        const { data: ps } = await supabase.from("projects").select("id,total_budget");
        (ps ?? []).forEach((p: any) => { ids.push(p.id); contract += Number(p.total_budget ?? 0); });
      }
      if (ids.length === 0) {
        return { contract: 0, incomes: [], expenses: [], materials: [], works: [], payments: [] };
      }
      const [inc, exp, mat, wrk, pay] = await Promise.all([
        supabase.from("incomes").select("amount,income_date,payment_method,category").in("project_id", ids).limit(5000),
        supabase.from("expenses").select("amount,expense_date,category,payment_method").in("project_id", ids).limit(5000),
        supabase.from("material_receipts").select("total_price,qty,unit_price,received_at").in("project_id", ids).limit(5000),
        supabase.from("work_progress").select("total_value,qty_done,unit_price,work_date").in("project_id", ids).limit(5000),
        supabase.from("brigade_payments").select("amount,kind,payment_date").in("project_id", ids).limit(5000),
      ]);
      return {
        contract,
        incomes: inc.data ?? [],
        expenses: exp.data ?? [],
        materials: mat.data ?? [],
        works: wrk.data ?? [],
        payments: pay.data ?? [],
      };
    },
  });

  const k = useMemo(() => {
    const incomes = data?.incomes ?? [];
    const expenses = data?.expenses ?? [];
    const materials = data?.materials ?? [];
    const works = data?.works ?? [];
    const payments = data?.payments ?? [];
    const contract = Number(data?.contract ?? 0);

    const incSum = incomes.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const expDirect = expenses.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const matSum = materials.reduce((s: number, r: any) => s + (Number(r.total_price) || Number(r.qty) * Number(r.unit_price) || 0), 0);
    const workSum = works.reduce((s: number, r: any) => s + (Number(r.total_value) || Number(r.qty_done) * Number(r.unit_price) || 0), 0);
    const avans = payments.filter((p: any) => p.kind === "avans").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const totalOut = expDirect + matSum + workSum + avans;
    const profit = incSum - totalOut;
    const kassa = incSum - totalOut;

    // Oylik agregatsiya
    const months = new Map<string, { in: number; out: number }>();
    const bump = (ym: string, key: "in" | "out", v: number) => {
      if (!ym) return;
      const row = months.get(ym) ?? { in: 0, out: 0 };
      row[key] += v;
      months.set(ym, row);
    };
    incomes.forEach((r: any) => bump(ymKey(r.income_date), "in", Number(r.amount ?? 0)));
    expenses.forEach((r: any) => bump(ymKey(r.expense_date), "out", Number(r.amount ?? 0)));
    materials.forEach((r: any) => bump(ymKey(r.received_at), "out", Number(r.total_price) || Number(r.qty) * Number(r.unit_price) || 0));
    works.forEach((r: any) => bump(ymKey(r.work_date), "out", Number(r.total_value) || Number(r.qty_done) * Number(r.unit_price) || 0));
    payments.filter((p: any) => p.kind === "avans").forEach((r: any) => bump(ymKey(r.payment_date), "out", Number(r.amount ?? 0)));

    const sorted = Array.from(months.entries()).sort(([a], [b]) => a.localeCompare(b));
    const monthly = sorted.map(([ym, v]) => ({ month: fmtMonth(ym), ym, kirim: v.in, chiqim: v.out }));
    const last6 = monthly.slice(-6);

    // MoM delta — oxirgi 2 oy
    const cur = monthly[monthly.length - 1] ?? { kirim: 0, chiqim: 0 };
    const prev = monthly[monthly.length - 2] ?? { kirim: 0, chiqim: 0 };
    const pct = (a: number, b: number) => (b === 0 ? (a > 0 ? 100 : 0) : ((a - b) / Math.abs(b)) * 100);
    const dKirim = pct(cur.kirim, prev.kirim);
    const dChiqim = pct(cur.chiqim, prev.chiqim);
    const curProfit = cur.kirim - cur.chiqim;
    const prevProfit = prev.kirim - prev.chiqim;
    const dProfit = pct(curProfit, prevProfit);

    return {
      contract, incSum, totalOut, profit, kassa,
      monthly: last6,
      dKirim, dChiqim, dProfit,
      curMonth: cur, prevMonth: prev,
    };
  }, [data]);

  return (
    <div className="space-y-3">


      {/* Bottom: Cash flow chart + Summary table */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Cash Flow — kirim vs chiqim</h3>
          <p className="text-[10px] text-muted-foreground">So'nggi 6 oy</p>
          <div className="mt-3 h-56">
            {k.monthly.length === 0 ? (
              <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">Ma'lumot yo'q</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={k.monthly} margin={{ left: -10, right: 8, top: 5, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="var(--muted-foreground)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(v) => compact(v)} />
                  <Tooltip
                    formatter={(v: number) => fmtUZS(v)}
                    contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 11 }}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="kirim" name="Kirim" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="chiqim" name="Chiqim" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-sm">
          <h3 className="text-sm font-semibold">Oylik xulosa</h3>
          <p className="text-[10px] text-muted-foreground">Joriy oy vs o'tgan oy</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="py-2 font-medium"></th>
                  <th className="py-2 font-medium text-right">Bu oy</th>
                  <th className="py-2 font-medium text-right">O'tgan oy</th>
                  <th className="py-2 font-medium text-right">O'zgarish</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <SummaryRow label="Kirim" cur={k.curMonth.kirim} prev={k.prevMonth.kirim} positiveGood />
                <SummaryRow label="Chiqim" cur={k.curMonth.chiqim} prev={k.prevMonth.chiqim} positiveGood={false} />
                <SummaryRow label="Sof foyda" cur={k.curMonth.kirim - k.curMonth.chiqim} prev={k.prevMonth.kirim - k.prevMonth.chiqim} positiveGood />
                <tr className="border-t border-border">
                  <td className="py-2 font-semibold">Kontrakt qoldig'i</td>
                  <td colSpan={2} className="py-2 text-right text-muted-foreground">{fmtUZS(k.contract - k.totalOut)}</td>
                  <td className="py-2 text-right">
                    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium",
                      (k.contract - k.totalOut) < 0 ? "bg-destructive/10 text-destructive" : "bg-success/10 text-success")}>
                      {k.contract > 0 ? Math.round(((k.contract - k.totalOut) / k.contract) * 100) : 0}%
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, cur, prev, positiveGood }: { label: string; cur: number; prev: number; positiveGood: boolean }) {
  const diff = cur - prev;
  const pct = prev === 0 ? (cur > 0 ? 100 : 0) : (diff / Math.abs(prev)) * 100;
  const up = diff >= 0;
  const good = positiveGood ? up : !up;
  return (
    <tr className="border-t border-border">
      <td className="py-2 font-medium">{label}</td>
      <td className="py-2 text-right">{fmtUZS(cur)}</td>
      <td className="py-2 text-right text-muted-foreground">{fmtUZS(prev)}</td>
      <td className="py-2 text-right">
        <span className={cn("inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium",
          good ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>
          {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
          {Math.abs(pct).toFixed(1)}%
        </span>
      </td>
    </tr>
  );
}
