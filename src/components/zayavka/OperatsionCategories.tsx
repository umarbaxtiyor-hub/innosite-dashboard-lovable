import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUZSc } from "@/lib/queries";
import { Loader2 } from "lucide-react";

type Row = { name: string; icon: string | null; amount: number };

export function OperatsionCategories({
  projectId,
  limit,
  showAmount = true,
}: {
  projectId: string;
  limit: number;
  showAmount?: boolean;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const [cats, exp] = await Promise.all([
        supabase.from("expense_categories").select("name, icon").eq("kind", "operatsion"),
        supabase
          .from("expenses")
          .select("category, amount")
          .eq("project_id", projectId)
          .eq("kind", "operatsion"),
      ]);
      if (!alive) return;
      const iconBy = new Map<string, string | null>(
        (cats.data ?? []).map((c: any) => [String(c.name), c.icon ?? null]),
      );
      const sums = new Map<string, number>();
      (exp.data ?? []).forEach((e: any) => {
        const k = String(e.category ?? "Boshqa").trim() || "Boshqa";
        sums.set(k, (sums.get(k) ?? 0) + Number(e.amount || 0));
      });
      (cats.data ?? []).forEach((c: any) => {
        const k = String(c.name);
        if (!sums.has(k)) sums.set(k, 0);
      });
      const list: Row[] = Array.from(sums.entries())
        .map(([name, amount]) => ({ name, icon: iconBy.get(name) ?? null, amount }))
        .sort((a, b) => b.amount - a.amount);
      setRows(list);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [projectId]);

  const total = rows.reduce((s, r) => s + r.amount, 0);
  const pct = limit > 0 ? Math.round((total / limit) * 100) : 0;

  return (
    <div className="rounded-2xl border-2 border-[var(--card-frame)] bg-card p-3 sm:p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold">Kategoriyalar</h3>
        {showAmount && (
          <div className="text-xs text-muted-foreground tabular-nums">
            {fmtUZSc(total)} {limit > 0 ? `/ ${fmtUZSc(limit)}` : ""}{" "}
            <span className={pct > 100 ? "font-bold text-rose-600" : "font-bold text-foreground"}>{pct}%</span>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
        </div>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Kategoriyalar yo'q.</p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const p = total > 0 ? Math.round((r.amount / total) * 100) : 0;
            return (
              <div key={r.name} className="rounded-xl border border-border bg-muted/30 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">
                    {r.icon ? `${r.icon} ` : ""}
                    {r.name}
                  </span>
                  <span className="shrink-0 text-sm font-bold tabular-nums">
                    {showAmount ? fmtUZSc(r.amount) : `${p}%`}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-emerald-600" style={{ width: `${Math.min(100, p)}%` }} />
                  </div>
                  {showAmount && <span className="w-9 text-right text-[11px] tabular-nums text-muted-foreground">{p}%</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
