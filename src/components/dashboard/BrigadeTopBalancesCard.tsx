import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUZS } from "@/lib/queries";

export function BrigadeTopBalancesCard({ projectId }: { projectId: string | null }) {
  const { data } = useQuery({
    queryKey: ["brigade-top-balances", projectId ?? "all"],
    queryFn: async () => {
      const wpQ = supabase.from("work_progress").select("brigade_id,brigade_name,qty_done,unit_price,total_value");
      const bpQ = supabase.from("brigade_payments").select("brigade_id,brigade_name,amount,kind");

      const [wp, bp] = await Promise.all([
        projectId ? wpQ.eq("project_id", projectId) : wpQ,
        projectId ? bpQ.eq("project_id", projectId) : bpQ,
      ]);

      const earned = new Map<string, { name: string; amount: number }>();
      ((wp.data ?? []) as { brigade_id: string | null; brigade_name: string | null; qty_done: number; unit_price: number; total_value: number | null }[]).forEach((r) => {
        if (!r.brigade_id) return;
        const v = Number(r.total_value) || (Number(r.qty_done) * Number(r.unit_price)) || 0;
        const cur = earned.get(r.brigade_id) ?? { name: r.brigade_name ?? "—", amount: 0 };
        cur.amount += v;
        if (r.brigade_name) cur.name = r.brigade_name;
        earned.set(r.brigade_id, cur);
      });

      const advances = new Map<string, number>();
      ((bp.data ?? []) as { brigade_id: string | null; amount: number; kind: string }[]).forEach((r) => {
        if (!r.brigade_id) return;
        if (r.kind !== "avans") return;
        advances.set(r.brigade_id, (advances.get(r.brigade_id) ?? 0) + Number(r.amount || 0));
      });

      const rows = Array.from(earned, ([id, v]) => ({
        id,
        name: v.name,
        earned: v.amount,
        advance: advances.get(id) ?? 0,
        balance: v.amount - (advances.get(id) ?? 0),
      })).sort((a, b) => b.balance - a.balance).slice(0, 5);

      return rows;
    },
    staleTime: 30_000,
  });

  const rows = data ?? [];

  return (
    <div className="rounded-xl border-2 border-[var(--card-frame)] bg-card p-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-primary" />
        <h3 className="text-xs font-semibold text-foreground">Brigada qoldiqlari (top-5)</h3>
        <Link to="/brigade-balance" className="ml-auto text-[10px] text-primary hover:underline">Barchasi →</Link>
      </div>
      <div className="mt-2 space-y-1.5">
        {rows.length === 0 && (
          <div className="text-[11px] text-muted-foreground py-4 text-center">Ma'lumot yo'q</div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="rounded-md border border-border bg-muted/30 px-2.5 py-1.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium truncate">{r.name}</span>
              <span className={`text-xs font-semibold tabular-nums ${r.balance > 0 ? "text-success" : r.balance < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {fmtUZS(r.balance)}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-3 text-[10px] text-muted-foreground tabular-nums">
              <span>Topgan: {fmtUZS(r.earned)}</span>
              <span>Avans: {fmtUZS(r.advance)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
