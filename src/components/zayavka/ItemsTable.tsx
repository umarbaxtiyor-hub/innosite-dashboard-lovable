import { useEffect, useMemo, useState } from "react";
import { Pencil, Save, X, Trash2, Loader2, History, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { fmtUZS } from "@/lib/queries";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Z } from "./types";

type ReceiptRow = { id: string; date: string; qty: number; unit_price: number; total: number; note?: string | null };

type Edit = { name: string; unit: string; qty: string; unit_price: string };

// Compact money: 1.2M / 47.7K
function fmtCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}B`;
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(Math.round(n));
}

// Single accent — sayt dizayniga moslangan (primary token).
const PALETTE = [
  { bar: "bg-primary", text: "text-primary", fill: "bg-primary" },
];

export function ItemsTable({
  rows, reqByZ, recvByZ, factByZ, onChanged, title, canEdit = true, showAmount = true,
}: {
  rows: Z[];
  reqByZ: Record<string, number>;
  recvByZ: Record<string, number>;
  factByZ?: Record<string, { qty: number; value: number; unitPrice: number }>;
  onChanged?: () => void;
  title?: string;
  canEdit?: boolean;
  showAmount?: boolean;
}) {
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<Edit>({ name: "", unit: "", qty: "", unit_price: "" });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionRow, setActionRow] = useState<Z | null>(null);
  const [history, setHistory] = useState<ReceiptRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [query, setQuery] = useState("");

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => {
      const text = [r.name, r.unit, (r as any).code, (r as any).description].filter(Boolean).join(" ").toLowerCase();
      return text.includes(q);
    });
  }, [rows, query]);

  useEffect(() => {
    if (!actionRow) { setHistory([]); return; }
    let cancelled = false;
    (async () => {
      setHistoryLoading(true);
      try {
        // Collect all related zayavka ids: this row + any sub-zayavkas (parent_id = this row)
        const { data: subs } = await supabase
          .from("project_zayavka")
          .select("id")
          .eq("parent_id", actionRow.id);
        const relatedIds = [actionRow.id, ...((subs ?? []).map((s: any) => s.id))];

        if (actionRow.kind === "work") {
          const { data } = await supabase
            .from("work_progress")
            .select("id,work_date,qty_done,unit_price,total_value,brigade_name,master_work_id,zayavka_id")
            .or(`master_work_id.in.(${relatedIds.join(",")}),zayavka_id.in.(${relatedIds.join(",")})`)
            .order("work_date", { ascending: false });
          if (!cancelled) {
            setHistory((data ?? []).map((r: any) => ({
              id: r.id,
              date: r.work_date,
              qty: Number(r.qty_done || 0),
              unit_price: Number(r.unit_price || 0),
              total: Number(r.total_value || Number(r.qty_done) * Number(r.unit_price) || 0),
              note: r.brigade_name,
            })));
          }
        } else if (actionRow.kind === "ustalar") {
          const { data } = await supabase
            .from("daily_report_lines")
            .select("id,created_at,qty_done,unit_price,brigade_name,workers_count,equipment_name,zayavka_id")
            .in("zayavka_id", relatedIds)
            .order("created_at", { ascending: false });
          if (!cancelled) {
            setHistory((data ?? []).map((r: any) => ({
              id: r.id,
              date: (r.created_at ?? "").slice(0, 10),
              qty: Number(r.qty_done || 0),
              unit_price: Number(r.unit_price || 0),
              total: Number(r.qty_done || 0) * Number(r.unit_price || 0),
              note: [r.brigade_name, r.equipment_name].filter(Boolean).join(" · "),
            })));
          }
        } else {
          const { data } = await supabase
            .from("material_receipts")
            .select("id,received_at,qty,unit_price,total_price,supplier_name,nakladnoy_no,master_material_id,zayavka_id")
            .or(`master_material_id.in.(${relatedIds.join(",")}),zayavka_id.in.(${relatedIds.join(",")})`)
            .order("received_at", { ascending: false });
          if (!cancelled) {
            setHistory((data ?? []).map((r: any) => ({
              id: r.id,
              date: r.received_at,
              qty: Number(r.qty || 0),
              unit_price: Number(r.unit_price || 0),
              total: Number(r.total_price || Number(r.qty) * Number(r.unit_price) || 0),
              note: [r.nakladnoy_no, r.supplier_name].filter(Boolean).join(" · "),
            })));
          }
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [actionRow]);


  function startEdit(r: Z) {
    setEditId(r.id);
    setEdit({ name: r.name, unit: r.unit, qty: String(r.qty ?? 0), unit_price: String(r.unit_price ?? 0) });
    setActionRow(null);
  }
  async function saveEdit(id: string) {
    setBusyId(id);
    try {
      const { error } = await supabase.from("project_zayavka").update({
        name: edit.name.trim(),
        unit: edit.unit.trim() || "dona",
        qty: Number(edit.qty) || 0,
        unit_price: Number(edit.unit_price) || 0,
      }).eq("id", id);
      if (error) throw error;
      toast.success("Saqlandi");
      setEditId(null);
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Xato");
    } finally {
      setBusyId(null);
    }
  }
  async function remove(id: string) {
    if (!confirm("Ushbu qatorni o'chirishni tasdiqlaysizmi?")) return;
    setBusyId(id);
    try {
      const { error } = await supabase.from("project_zayavka").delete().eq("id", id);
      if (error) throw error;
      toast.success("O'chirildi");
      setActionRow(null);
      onChanged?.();
    } catch (e: any) {
      toast.error(e?.message ?? "Xato");
    } finally {
      setBusyId(null);
    }
  }

  // Approved jami summa (header uchun)
  const grandTotal = rows.reduce((s, r) => s + Number(r.total || Number(r.qty) * Number(r.unit_price) || 0), 0);

  return (
    <>
      <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border/70">
          <div className="text-[11px] font-semibold tracking-[0.14em] uppercase text-muted-foreground truncate">
            {title ?? "Ro'yxat"}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="text-xs text-muted-foreground">
              Jami: <span className="font-semibold text-foreground tabular-nums">{fmtCompact(grandTotal)}</span>
            </div>
          </div>
        </div>
        <div className="px-3 py-2 border-b border-border/70 bg-muted/30">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Nomi, kodi yoki izohi bo'yicha qidirish…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="h-8 pl-8 text-sm"
            />
          </div>
        </div>


        <ul className="divide-y divide-border/60">
          {visibleRows.map((r, idx) => {
            const palette = PALETTE[idx % PALETTE.length];
            const planned = Number(r.qty || 0);
            const requested = reqByZ[r.id] ?? 0;
            const received = recvByZ[r.id] ?? 0;
            const over = requested > planned;
            const total = Number(r.total || planned * Number(r.unit_price) || 0);
            const progressPct = planned > 0 ? Math.min(999, Math.round((received / planned) * 100)) : 0;
            const barPct = Math.min(100, Math.max(received > 0 ? 2 : 0, Math.round((received / (planned || 1)) * 100)));
            const editing = editId === r.id;
            const busy = busyId === r.id;

            return (
              <li
                key={r.id}
                className={`relative flex items-stretch ${editing ? "" : "cursor-pointer hover:bg-accent/30"} transition-colors`}
                onClick={() => { if (!editing) setActionRow(r); }}
              >
                <span className={`w-1 shrink-0 ${palette.bar}`} aria-hidden="true" />
                <div className="flex-1 min-w-0 px-3 sm:px-4 py-3 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    {editing ? (
                      <div className="flex items-center gap-1">
                        <Input className="h-8" value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} onClick={(e) => e.stopPropagation()} />
                        <Input className="h-8 w-20" placeholder="birlik" value={edit.unit} onClick={(e) => e.stopPropagation()} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} />
                        <Input className="h-8 w-20" inputMode="decimal" placeholder="reja" value={edit.qty} onClick={(e) => e.stopPropagation()} onChange={(e) => setEdit({ ...edit, qty: e.target.value })} />
                        <Input className="h-8 w-24" inputMode="decimal" placeholder="narx" value={edit.unit_price} onClick={(e) => e.stopPropagation()} onChange={(e) => setEdit({ ...edit, unit_price: e.target.value })} />
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); saveEdit(r.id); }} disabled={busy}>
                          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={(e) => { e.stopPropagation(); setEditId(null); }} disabled={busy}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="text-sm font-semibold text-foreground truncate">{r.name}</div>
                        <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                          Reja: {planned} {r.unit}{showAmount && <> · {fmtUZS(Number(r.unit_price))} / {r.unit}</>}
                          {showAmount && (() => {
                            const f = factByZ?.[r.id];
                            if (!f || f.qty <= 0) return null;
                            const planPrice = Number(r.unit_price || 0);
                            const diff = planPrice > 0 ? (f.unitPrice - planPrice) / planPrice : 0;
                            const cls = Math.abs(diff) < 0.001 ? "text-foreground/80" : diff > 0 ? "text-destructive" : "text-emerald-600";
                            return <> · Fakt: <span className={`font-medium ${cls}`}>{fmtUZS(Math.round(f.unitPrice))}</span></>;
                          })()}
                          {received > 0 && <> · Qabul: <span className="text-foreground/80">{received}</span></>}
                          {over && <span className="text-destructive"> · oshib ketdi</span>}
                        </div>
                        <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted">
                          <div className={`h-full ${palette.fill} transition-all`} style={{ width: `${barPct}%` }} />
                        </div>
                      </>
                    )}
                  </div>
                  {!editing && (
                  <div className="shrink-0 flex items-center gap-2 sm:gap-3 text-right">
                    <div className={`text-[11px] font-bold tabular-nums w-12 ${progressPct > 100 ? "text-destructive" : progressPct >= 100 ? "text-emerald-500" : palette.text}`}>{progressPct}%</div>
                    {showAmount && <div className="text-sm font-semibold tabular-nums text-foreground w-14">{fmtCompact(total)}</div>}
                    {canEdit && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 shrink-0"
                        title="Tahrirlash"
                        onClick={(e) => { e.stopPropagation(); startEdit(r); }}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                  )}
                </div>
              </li>
            );
          })}
          {visibleRows.length === 0 && (
            <li className="py-10 text-center text-sm text-muted-foreground">
              {rows.length === 0 ? "Hech narsa yo'q. Excel orqali yuklang." : "Qidiruv bo'yicha hech narsa topilmadi."}
            </li>
          )}
        </ul>
      </div>

      <Dialog open={!!actionRow} onOpenChange={(o) => !o && setActionRow(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="truncate">{actionRow?.name}</DialogTitle>
            <DialogDescription>
              {actionRow?.kind === "work" ? "Bajarilgan ishlar tarixi" : actionRow?.kind === "ustalar" ? "Kunlik hisobot tarixi" : "Qabul qilingan materiallar tarixi"}
            </DialogDescription>
          </DialogHeader>

          {showAmount && actionRow && (() => {
            const planPrice = Number(actionRow.unit_price || 0);
            const f = factByZ?.[actionRow.id];
            const factPrice = f && f.qty > 0 ? f.unitPrice : 0;
            const diff = planPrice > 0 && factPrice > 0 ? (factPrice - planPrice) / planPrice : 0;
            const cls = !factPrice ? "text-muted-foreground" : Math.abs(diff) < 0.001 ? "text-foreground" : diff > 0 ? "text-destructive" : "text-emerald-600";
            return (
              <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/20 p-3 text-xs">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Reja narx</div>
                  <div className="mt-0.5 font-semibold tabular-nums">{fmtUZS(planPrice)} <span className="text-muted-foreground font-normal">/ {actionRow.unit}</span></div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Fakt narx {factPrice > 0 && diff !== 0 && <span className={cls}>({diff > 0 ? "+" : ""}{(diff * 100).toFixed(1)}%)</span>}
                  </div>
                  <div className={`mt-0.5 font-semibold tabular-nums ${cls}`}>
                    {factPrice > 0 ? <>{fmtUZS(Math.round(factPrice))} <span className="text-muted-foreground font-normal">/ {actionRow.unit}</span></> : "—"}
                  </div>
                </div>
              </div>
            );
          })()}


          <div className="rounded-lg border border-border bg-muted/30">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/70 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span className="inline-flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Tarix</span>
              {showAmount && !historyLoading && (
                <span className="normal-case tracking-normal">
                  Jami: <span className="text-foreground font-semibold tabular-nums">{fmtCompact(history.reduce((s, h) => s + h.total, 0))}</span>
                </span>
              )}
            </div>
            {historyLoading ? (
              <div className="flex items-center justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
            ) : history.length === 0 ? (
              <div className="px-3 py-6 text-center text-xs text-muted-foreground">Hali yozuv yo'q</div>
            ) : (
              <ul className="divide-y divide-border/60 max-h-64 overflow-y-auto">
                {history.map((h) => (
                  <li key={h.id} className="px-3 py-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground tabular-nums">{h.date}</span>
                      {showAmount && <span className="font-semibold tabular-nums text-foreground">{fmtUZS(h.total)}</span>}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">{h.qty} {actionRow?.unit}{showAmount && <> × {fmtUZS(h.unit_price)}</>}</span>
                      {h.note && <span className="truncate max-w-[55%] text-right">{h.note}</span>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {canEdit && (
            <div className="mt-3 flex flex-col gap-2">
              <Button variant="outline" onClick={() => actionRow && startEdit(actionRow)}>
                <Pencil className="mr-2 h-4 w-4" /> Tahrirlash
              </Button>
              <Button variant="destructive" onClick={() => actionRow && remove(actionRow.id)} disabled={!!busyId}>
                {busyId ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} O'chirish
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
