import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fmtUZS } from "@/lib/queries";
import { ArrowDownCircle, ArrowUpCircle, Wallet, Banknote } from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type DKey = "kirim" | "chiqim" | "kassa" | null;

export function GlobalFinanceCard({ firmId }: { firmId: string | null }) {
  const [open, setOpen] = useState<DKey>(null);

  const { data } = useQuery({
    queryKey: ["global-finance", firmId ?? "all"],
    staleTime: 30_000,
    queryFn: async () => {
      // Loyihalarni firma bo'yicha filtrlash
      let projIds: string[] | null = null;
      if (firmId) {
        const { data: ps } = await supabase.from("projects").select("id").eq("firm_id", firmId);
        projIds = (ps ?? []).map((p) => p.id);
        if (projIds.length === 0) projIds = ["00000000-0000-0000-0000-000000000000"];
      }

      const expQ = supabase.from("expenses").select("id,amount,payment_method,expense_date,category,description,project_id").order("expense_date", { ascending: false }).limit(2000);
      const payQ = supabase.from("brigade_payments").select("id,amount,kind,payment_date,brigade_name,note,project_id").order("payment_date", { ascending: false }).limit(2000);
      const matQ = supabase.from("material_receipts").select("total_price,qty,unit_price,project_id").limit(5000);
      const wrkQ = supabase.from("work_progress").select("total_value,qty_done,unit_price,project_id").limit(5000);

      const [exps, pays, mats, wrks] = await Promise.all([
        projIds ? expQ.in("project_id", projIds) : expQ,
        projIds ? payQ.in("project_id", projIds) : payQ,
        projIds ? matQ.in("project_id", projIds) : matQ,
        projIds ? wrkQ.in("project_id", projIds) : wrkQ,
      ]);

      return {
        expenses: exps.data ?? [],
        payments: pays.data ?? [],
        materials: mats.data ?? [],
        works: wrks.data ?? [],
      };
    },
  });

  const k = useMemo(() => {
    const expSum = (data?.expenses ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const matSum = (data?.materials ?? []).reduce((s: number, r: any) => s + (Number(r.total_price) || Number(r.qty) * Number(r.unit_price) || 0), 0);
    const workSum = (data?.works ?? []).reduce((s: number, r: any) => s + (Number(r.total_value) || Number(r.qty_done) * Number(r.unit_price) || 0), 0);
    const payIn = (data?.payments ?? []).filter((r: any) => r.kind !== "avans").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const payOut = (data?.payments ?? []).filter((r: any) => r.kind === "avans").reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0);
    const totalOut = matSum + workSum + expSum + payOut;

    const byMethod = { Naqd: 0, Bank: 0, Karta: 0 } as Record<string, number>;
    (data?.expenses ?? []).forEach((e: any) => {
      const m = (e.payment_method as string) || "Naqd";
      byMethod[m] = (byMethod[m] ?? 0) + Number(e.amount ?? 0);
    });

    const inByKind: Record<string, number> = {};
    (data?.payments ?? []).filter((r: any) => r.kind !== "avans").forEach((r: any) => {
      const t = r.kind || "boshqa";
      inByKind[t] = (inByKind[t] ?? 0) + Number(r.amount ?? 0);
    });

    const kassaNaqd = -byMethod.Naqd;
    const kassaBank = payIn - byMethod.Bank - byMethod.Karta;

    return { expSum, matSum, workSum, payIn, payOut, totalOut, byMethod, inByKind, kassaNaqd, kassaBank };
  }, [data]);

  const Card = ({ label, value, hint, tone, icon: Icon, onClick }: any) => (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border-2 border-[var(--card-frame)] bg-card p-4 text-left hover:bg-accent/40 hover:border-primary/40 transition-colors",
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className={cn("mt-2 text-xl font-semibold tabular-nums", tone)}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground mt-1">{hint}</div>}
    </button>
  );

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Kirim" value={fmtUZS(k.payIn)} hint="Manbalar bo'yicha" tone="text-success" icon={ArrowDownCircle} onClick={() => setOpen("kirim")} />
        <Card label="Chiqim" value={fmtUZS(k.totalOut)} hint={`Naxd: ${fmtUZS(k.byMethod.Naqd)} · Bank: ${fmtUZS(k.byMethod.Bank + k.byMethod.Karta)}`} tone="text-destructive" icon={ArrowUpCircle} onClick={() => setOpen("chiqim")} />
        <Card label="Kassa" value={fmtUZS(k.kassaNaqd + k.kassaBank)} hint={`Naxd: ${fmtUZS(k.kassaNaqd)} · Bank: ${fmtUZS(k.kassaBank)}`} tone={(k.kassaNaqd + k.kassaBank) < 0 ? "text-destructive" : "text-foreground"} icon={Wallet} onClick={() => setOpen("kassa")} />
        <Card label="Sof natija" value={fmtUZS(k.payIn - k.totalOut)} hint="Kirim − Chiqim" tone={(k.payIn - k.totalOut) < 0 ? "text-destructive" : "text-success"} icon={Banknote} onClick={() => setOpen("kassa")} />
      </div>

      <Dialog open={open !== null} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          {open === "kirim" && (
            <>
              <DialogHeader><DialogTitle>Kirim — {fmtUZS(k.payIn)}</DialogTitle><DialogDescription>Barcha loyihalar bo'yicha</DialogDescription></DialogHeader>
              <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                {Object.entries(k.inByKind).map(([kind, sum]) => (
                  <div key={kind} className="rounded-lg border p-3">
                    <div className="text-xs text-muted-foreground capitalize">{kind}</div>
                    <div className="font-semibold text-success">{fmtUZS(sum as number)}</div>
                  </div>
                ))}
                {Object.keys(k.inByKind).length === 0 && <div className="col-span-3 text-xs text-muted-foreground">Hozircha kirim yo'q</div>}
              </div>
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground"><tr><th className="py-1">Sana</th><th>Tur</th><th>Izoh</th><th className="text-right">Summa</th></tr></thead>
                <tbody>
                  {(data?.payments as any[] ?? []).filter((r) => r.kind !== "avans").slice(0, 50).map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-1.5">{r.payment_date}</td>
                      <td>{r.kind}</td>
                      <td className="truncate max-w-[220px]">{r.note ?? r.brigade_name ?? "—"}</td>
                      <td className="text-right tabular-nums">{fmtUZS(Number(r.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {open === "chiqim" && (
            <>
              <DialogHeader><DialogTitle>Chiqim — {fmtUZS(k.totalOut)}</DialogTitle><DialogDescription>To'lov turi bo'yicha</DialogDescription></DialogHeader>
              <div className="grid grid-cols-3 gap-3 text-sm mb-4">
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Naxd</div><div className="font-semibold">{fmtUZS(k.byMethod.Naqd)}</div></div>
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Bank</div><div className="font-semibold">{fmtUZS(k.byMethod.Bank)}</div></div>
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Karta</div><div className="font-semibold">{fmtUZS(k.byMethod.Karta)}</div></div>
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Materiallar</div><div>{fmtUZS(k.matSum)}</div></div>
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Ish</div><div>{fmtUZS(k.workSum)}</div></div>
                <div className="rounded-lg border p-3"><div className="text-xs text-muted-foreground">Brigada avans</div><div>{fmtUZS(k.payOut)}</div></div>
              </div>
              <table className="w-full text-xs">
                <thead className="text-left text-muted-foreground"><tr><th className="py-1">Sana</th><th>Kategoriya</th><th>Usul</th><th>Izoh</th><th className="text-right">Summa</th></tr></thead>
                <tbody>
                  {(data?.expenses as any[] ?? []).slice(0, 50).map((r) => (
                    <tr key={r.id} className="border-t border-border">
                      <td className="py-1.5">{r.expense_date}</td>
                      <td>{r.category}</td>
                      <td>{r.payment_method}</td>
                      <td className="truncate max-w-[180px]">{r.description ?? "—"}</td>
                      <td className="text-right tabular-nums">{fmtUZS(Number(r.amount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {open === "kassa" && (
            <>
              <DialogHeader><DialogTitle>Kassa qoldig'i</DialogTitle><DialogDescription>Naxd va bank bo'yicha sof balans</DialogDescription></DialogHeader>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Naxd kassa</div>
                  <div className={`font-semibold ${k.kassaNaqd < 0 ? "text-destructive" : "text-success"}`}>{fmtUZS(k.kassaNaqd)}</div>
                </div>
                <div className="rounded-lg border p-3">
                  <div className="text-xs text-muted-foreground">Bank / Karta</div>
                  <div className={`font-semibold ${k.kassaBank < 0 ? "text-destructive" : "text-success"}`}>{fmtUZS(k.kassaBank)}</div>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
