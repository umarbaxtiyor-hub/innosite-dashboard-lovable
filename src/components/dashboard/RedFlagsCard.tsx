import { useQuery } from "@tanstack/react-query";
import { AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUZS } from "@/lib/queries";

export function RedFlagsCard({ projectId }: { projectId: string | null }) {
  const { data } = useQuery({
    queryKey: ["red-flags", projectId ?? "all"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

      const boqQ = supabase.from("boq_items").select("id,code,planned_cost,actual_cost,rate");
      const expQ = supabase.from("expenses").select("id,description,amount,boq_code,expense_date").is("boq_code", null).gte("expense_date", since);
      const varQ = supabase.from("variations").select("id,title,amount,status").eq("status", "Pending");
      const matQ = supabase.from("material_receipts").select("id,material_name,unit_price,boq_code");

      const [boq, exp, vars, mats] = await Promise.all([
        projectId ? boqQ.eq("project_id", projectId) : boqQ,
        projectId ? expQ.eq("project_id", projectId) : expQ,
        projectId ? varQ.eq("project_id", projectId) : varQ,
        projectId ? matQ.eq("project_id", projectId) : matQ,
      ]);

      const boqRows = (boq.data ?? []) as { id: string; code: string; planned_cost: number; actual_cost: number; rate: number }[];
      const overruns = boqRows.filter((b) => Number(b.planned_cost) > 0 && (Number(b.actual_cost) - Number(b.planned_cost)) / Number(b.planned_cost) > 0.1);

      const noBoq = (exp.data ?? []) as { id: string; description: string | null; amount: number }[];
      const pendingVars = (vars.data ?? []) as { id: string; title: string; amount: number }[];

      const boqRate = new Map(boqRows.map((b) => [b.code, Number(b.rate)]));
      const matRows = (mats.data ?? []) as { id: string; material_name: string; unit_price: number; boq_code: string | null }[];
      const priceDiff = matRows.filter((m) => {
        if (!m.boq_code) return false;
        const r = boqRate.get(m.boq_code);
        if (!r || r === 0) return false;
        return Math.abs(Number(m.unit_price) - r) / r > 0.1;
      });

      return { overruns, noBoq, pendingVars, priceDiff };
    },
    staleTime: 30_000,
  });

  const overruns = data?.overruns ?? [];
  const noBoq = data?.noBoq ?? [];
  const pendingVars = data?.pendingVars ?? [];
  const priceDiff = data?.priceDiff ?? [];
  const total = overruns.length + noBoq.length + pendingVars.length + priceDiff.length;

  return (
    <div className="rounded-xl border border-destructive/40 bg-card p-3">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-destructive" />
        <h3 className="text-xs font-semibold text-foreground">Ogohlantirishlar (CEO)</h3>
        <span className="ml-auto text-[10px] font-medium text-destructive tabular-nums">{total} ta</span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <Row label="BOQ overrun >10%" value={overruns.length} />
        <Row label="BOQ siz xarajat (30 kun)" value={noBoq.length} />
        <Row label="Pending variations" value={pendingVars.length} />
        <Row label="Material narx farqi >10%" value={priceDiff.length} />
      </div>
      {overruns.length > 0 && (
        <div className="mt-2 space-y-1">
          {overruns.slice(0, 3).map((b) => {
            const over = Number(b.actual_cost) - Number(b.planned_cost);
            return (
              <div key={b.id} className="flex items-center justify-between text-[10px] text-muted-foreground">
                <span className="truncate">{b.code}</span>
                <span className="text-destructive font-medium tabular-nums">+{fmtUZS(over)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-2 py-1">
      <span className="text-[10px] text-muted-foreground truncate">{label}</span>
      <span className={`text-xs font-semibold tabular-nums ${value > 0 ? "text-destructive" : "text-muted-foreground"}`}>{value}</span>
    </div>
  );
}
