import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Check, X } from "lucide-react";
import { toast } from "sonner";
import { fmtUZS } from "@/lib/queries";

import type { Z } from "./types";

// Compact money: 1.2M / 47.7K
function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

export function VariationsTab({ items, onChanged }: { items: Z[]; onChanged: () => void }) {
  const extras = items.filter((z) => z.off_plan === true || (z.notes ?? "").startsWith("Rejadan tashqari") || (z.notes ?? "").startsWith("[AI taxmini]"));
  const [actionRow, setActionRow] = useState<Z | null>(null);

  async function setStatus(id: string, status: "approved" | "pending") {
    const { error } = await supabase.from("project_zayavka").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(status === "approved" ? "Tasdiqlandi" : "Rad etildi");
    setActionRow(null);
    onChanged();
  }

  const grandTotal = extras.reduce((s, r) => s + Number(r.total || Number(r.qty) * Number(r.unit_price) || 0), 0);

  return (
    <div className="space-y-3">


      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/70">
          <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-muted-foreground">
            Yordamchi so'rovlar
          </div>
          <div className="text-xs text-muted-foreground">
            Jami: <span className="font-semibold text-foreground tabular-nums">{fmtCompact(grandTotal)}</span>
          </div>
        </div>

        <ul className="divide-y divide-border/60">
          {extras.length === 0 ? (
            <li className="py-10 text-center text-sm text-muted-foreground">Yordamchi so'rov yo'q.</li>
          ) : extras.map((r) => {
            const qty = Number(r.qty || 0);
            const total = Number(r.total || qty * Number(r.unit_price) || 0);
            const approved = r.status === "approved";
            const pct = grandTotal > 0 ? Math.round((total / grandTotal) * 100) : 0;
            return (
              <li
                key={r.id}
                className="relative flex items-stretch cursor-pointer hover:bg-accent/30 transition-colors"
                onClick={() => setActionRow(r)}
              >
                <span className={`w-1 shrink-0 ${approved ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
                <div className="flex-1 min-w-0 px-3 sm:px-4 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-foreground truncate">{r.name}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                      {r.kind} · {qty} {r.unit} · {fmtUZS(Number(r.unit_price))} / {r.unit}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-3 sm:gap-5 text-right">
                    <div className={`text-[11px] font-bold tabular-nums ${approved ? "text-emerald-600" : "text-amber-600"}`}>
                      {pct}%
                    </div>
                    <div className="text-sm font-semibold tabular-nums text-foreground w-16">{fmtCompact(total)}</div>
                  </div>
                </div>
              </li>
            );
          })}

        </ul>
      </div>

      <Dialog open={!!actionRow} onOpenChange={(o) => !o && setActionRow(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="truncate">{actionRow?.name}</DialogTitle>
            <DialogDescription>Amalni tanlang</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {actionRow?.status !== "approved" ? (
              <>
                <Button onClick={() => actionRow && setStatus(actionRow.id, "approved")}>
                  <Check className="mr-2 h-4 w-4" /> Tasdiqlash
                </Button>
                <Button variant="outline" onClick={() => actionRow && setStatus(actionRow.id, "pending")}>
                  <X className="mr-2 h-4 w-4" /> Rad etish
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => actionRow && setStatus(actionRow.id, "pending")}>
                <X className="mr-2 h-4 w-4" /> Kutilayotganga qaytarish
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
