import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Loader2, Trash2, ChevronDown, ChevronUp, Check, ChevronsUpDown } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { autoMatchBoqByText, boqCandidatesFor, categoryNeedsBoq, type BoqLite } from "@/lib/boq-category-map";

const PAY = ["Naqd", "Plastik", "O'tkazma", "Hisob", "Bank"];

function BoqCombobox({
  value,
  items,
  onPick,
  onClear,
  className,
  placeholder = "BOQ kodi",
}: {
  value: string | null;
  items: BoqLite[];
  onPick: (item: BoqLite) => void;
  onClear: () => void;
  className?: string;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = value ? items.find((i) => i.id === value) : null;
  const label = selected ? `${selected.code}${selected.description ? ` — ${selected.description}` : ""}` : "";
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between font-normal", className)}
          title={label || placeholder}
        >
          <span className="truncate text-left">{label || placeholder}</span>
          <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(92vw,420px)] p-0" align="start">
        <Command shouldFilter>
          <CommandInput placeholder="Qidirish (kod yoki nom)…" />
          <CommandList>
            <CommandEmpty>Topilmadi</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__none"
                onSelect={() => { onClear(); setOpen(false); }}
              >
                <Check className={cn("mr-2 h-4 w-4", !value ? "opacity-100" : "opacity-0")} />
                — yo'q —
              </CommandItem>
              {items.map((b) => {
                const text = `${b.code} ${b.description ?? ""}`.trim();
                return (
                  <CommandItem
                    key={b.id}
                    value={text}
                    onSelect={() => { onPick(b); setOpen(false); }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", value === b.id ? "opacity-100" : "opacity-0")} />
                    <span className="truncate">{b.code}{b.description ? ` — ${b.description}` : ""}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}



type Row = {
  id: string;
  date: string;
  category: string;
  description: string;
  qty: string;
  unit: string;
  unit_price: string;
  amount: string;
  payment: string;
  note: string;
  boq_code: string;
  boq_item_id: string | null;
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const newRow = (cat = ""): Row => ({
  id: crypto.randomUUID(),
  date: todayStr(),
  category: cat,
  description: "",
  qty: "",
  unit: "",
  unit_price: "",
  amount: "",
  payment: "Naqd",
  note: "",
  boq_code: "",
  boq_item_id: null,
});

const normBoqText = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().replace(/[^a-z0-9а-яёғқўҳ]+/gi, "").trim();


export function AddExpenseDialog({ projectId, disabled }: { projectId: string | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [units, setUnits] = useState<string[]>([]);
  const [boqItems, setBoqItems] = useState<BoqLite[]>([]);
  const [fallbackBoqIds, setFallbackBoqIds] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<Row[]>(() => [newRow()]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const qc = useQueryClient();

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [c, u, b] = await Promise.all([
        supabase.from("expense_categories").select("name").order("name"),
        supabase.from("expense_units").select("name").order("name"),
        projectId
          ? supabase.from("boq_items").select("id, code, description, category").eq("project_id", projectId).order("code")
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const cats = (c.data ?? []).map((x: any) => x.name as string);
      const uns = (u.data ?? []).map((x: any) => x.name as string);
      let boq = (b.data ?? []) as BoqLite[];
      let fallbackIds = new Set<string>();
      // Agar boq_items bo'sh bo'lsa — smeta (project_zayavka) qatorlarini BOQ ro'yxati sifatida ko'rsatamiz
      if (boq.length === 0 && projectId) {
        const { data: smeta } = await supabase
          .from("project_zayavka")
          .select("id,name,kind")
          .eq("project_id", projectId)
          .is("zayavka_no", null)
          .is("parent_id", null)
          .eq("off_plan", false)
          .order("name")
          .limit(500);
        boq = (smeta ?? []).map((s: any) => ({
          id: s.id,
          code: s.name?.slice(0, 24) || "—",
          description: s.name,
          category: s.kind === "material" ? "material" : s.kind === "work" ? "ish" : null,
        }));
        fallbackIds = new Set(boq.map((it) => it.id));
      }
      setCategories(cats);
      setUnits(uns);
      setBoqItems(boq);
      setFallbackBoqIds(fallbackIds);
      // ensure default category
      setRows((rs) => rs.map((r) => r.category ? r : { ...r, category: cats[0] ?? "" }));
    })();
  }, [open, projectId]);

  // Qator uchun BOQ nomzodlari (kategoriya bo'yicha filtrlangan)
  function candidatesFor(category: string): BoqLite[] {
    return boqCandidatesFor(category, boqItems);
  }

  function update(id: string, patch: Partial<Row>) {
    setRows((rs) =>
      rs.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...patch };
        if ((patch.qty != null || patch.unit_price != null) && next.qty && next.unit_price) {
          const q = Number(next.qty);
          const p = Number(next.unit_price);
          if (Number.isFinite(q) && Number.isFinite(p)) next.amount = String(q * p);
        }
        // Kategoriya yoki tavsif o'zgarganda — BOQ kodini avtomatik tanlashga urinish.
        const catChanged = patch.category != null && patch.category !== r.category;
        const descChanged = patch.description != null && patch.description !== r.description;
        const userPickedBoq = patch.boq_code != null || patch.boq_item_id != null;
        if (!userPickedBoq && (catChanged || descChanged)) {
          if (!categoryNeedsBoq(next.category)) {
            next.boq_code = "";
            next.boq_item_id = null;
          } else {
            const cands = boqCandidatesFor(next.category, boqItems);
            const hit = autoMatchBoqByText(next.description, cands);
            if (hit) {
              next.boq_code = hit.code;
              next.boq_item_id = hit.id;
            } else if (catChanged) {
              // Kategoriya o'zgardi-yu mos kelmasa — eski tanlovni tozalaymiz.
              next.boq_code = "";
              next.boq_item_id = null;
            }
          }
        }
        return next;
      }),
    );
  }
  function remove(id: string) { setRows((rs) => rs.filter((r) => r.id !== id)); }
  function addBlank() { setRows((rs) => [...rs, newRow(rs[rs.length - 1]?.category ?? categories[0] ?? "")]); }


  const m = useMutation({
    mutationFn: async () => {
      const valid = rows
        .map((r) => ({ r, amt: Number(String(r.amount).replace(/[^\d.-]/g, "")) }))
        .filter(({ r, amt }) => amt > 0 && r.category);
      if (!valid.length) throw new Error("Kamida bitta to'liq qator kiriting (kategoriya va summa)");
      if (!projectId) {
        const ok = typeof window !== "undefined" && window.confirm(
          "Loyiha tanlanmagan. Xarajatni loyihasiz saqlashni tasdiqlaysizmi?",
        );
        if (!ok) throw new Error("Bekor qilindi — loyiha tanlang");
      }


      const isIncomeCat = (c: string) => {
        const x = (c ?? "").toLowerCase();
        return x === "kirim" || x.includes("shartnoma");
      };
      const incomeRows = valid.filter(({ r }) => isIncomeCat(r.category));
      const expenseRows = valid.filter(({ r }) => !isIncomeCat(r.category));

      if (expenseRows.length) {
        const pickBoq = (r: Row) => {
          if (r.boq_item_id) {
            const byId = boqItems.find((b) => b.id === r.boq_item_id);
            if (byId) return byId;
          }
          const code = normBoqText(r.boq_code);
          const desc = normBoqText(r.description);
          if (!code && !desc) return null;
          return boqItems.find((b) => {
            const bCode = normBoqText(b.code);
            const bDesc = normBoqText(b.description);
            return (code && (bCode === code || bDesc === code)) || (desc && (bCode === desc || bDesc === desc));
          }) ?? null;
        };

        const linked = expenseRows
          .map(({ r, amt }) => ({ r, amt, picked: pickBoq(r) }))
          .filter(({ r, picked }) => picked && categoryNeedsBoq(r.category) && Number(r.qty) > 0);

        const boqMap = new Map<string, { zayavkaId: string; kind: "material" | "work" }>();
        for (const it of boqItems) {
          if (fallbackBoqIds.has(it.id)) {
            const kind: "material" | "work" = it.category === "ish" ? "work" : "material";
            boqMap.set(it.id, { zayavkaId: it.id, kind });
          }
        }
        const realIds = Array.from(new Set(
          linked.map(({ picked }) => picked!.id).filter((id) => !fallbackBoqIds.has(id)),
        ));
        if (projectId && realIds.length) {
          const { data: zs } = await supabase
            .from("project_zayavka")
            .select("id,kind,boq_item_id")
            .eq("project_id", projectId)
            .is("zayavka_no", null)
            .is("parent_id", null)
            .in("boq_item_id", realIds);
          for (const z of (zs ?? []) as any[]) {
            if (z.boq_item_id) {
              boqMap.set(z.boq_item_id, {
                zayavkaId: z.id,
                kind: z.kind === "work" ? "work" : "material",
              });
            }
          }
        }

        const payload = expenseRows.map(({ r, amt }) => {
          const needsBoq = categoryNeedsBoq(r.category);
          const picked = needsBoq ? pickBoq(r) : null;
          const info = picked ? boqMap.get(picked.id) : null;
          const safeBoqItemId = picked && !fallbackBoqIds.has(picked.id)
            ? picked.id
            : null;
          return {
            project_id: projectId,
            category: r.category,
            description: r.description?.trim() || null,
            qty: r.qty ? Number(r.qty) : 0,
            unit: r.unit?.trim() || null,
            unit_price: r.unit_price ? Number(r.unit_price) : 0,
            amount: amt,
            payment_method: r.payment as any,
            expense_date: r.date,
            source: "web",
            source_note: r.note?.trim() || null,
            boq_code: needsBoq ? (r.boq_code?.trim() || picked?.code || null) : null,
            boq_item_id: safeBoqItemId,
            zayavka_id: info?.zayavkaId ?? null,
          };
        });
        const { error } = await supabase.from("expenses").insert(payload);
        if (error) throw error;

        // Smeta (B.O.Q) fakt qiymatlarini yangilash: material_receipts/work_progress qatorlari
        if (projectId) {
          if (linked.length) {
            const matRows: any[] = [];
            const workRows: any[] = [];
            for (const { r, amt, picked } of linked) {
              const info = picked ? boqMap.get(picked.id) : null;
              if (!info) continue;
              const q = Number(r.qty);
              const up = r.unit_price ? Number(r.unit_price) : (q > 0 ? amt / q : 0);
              if (info.kind === "work") {
                workRows.push({
                  project_id: projectId,
                  zayavka_id: info.zayavkaId,
                  boq_code: r.boq_code?.trim() || picked?.code || null,
                  boq_item_id: picked && !fallbackBoqIds.has(picked.id) ? picked.id : null,
                  work_type: r.description?.trim() || picked?.description || picked?.code || "Ish",
                  qty_done: q,
                  unit: r.unit?.trim() || null,
                  unit_price: up,
                  work_date: r.date,
                  source: "web",
                  source_note: r.description?.trim() || null,
                });
              } else {
                matRows.push({
                  project_id: projectId,
                  zayavka_id: info.zayavkaId,
                  boq_code: r.boq_code?.trim() || picked?.code || null,
                  boq_item_id: picked && !fallbackBoqIds.has(picked.id) ? picked.id : null,
                  material_name: r.description?.trim() || picked?.description || picked?.code || "Material",
                  qty: q,
                  unit: r.unit?.trim() || null,
                  unit_price: up,
                  received_at: r.date,
                  source: "web",
                  source_note: r.description?.trim() || null,
                });
              }
            }
            if (matRows.length) {
              const { error: e1 } = await supabase.from("material_receipts").insert(matRows);
              if (e1) console.warn("material_receipts insert:", e1.message);
            }
            if (workRows.length) {
              const { error: e2 } = await supabase.from("work_progress").insert(workRows);
              if (e2) console.warn("work_progress insert:", e2.message);
            }
          }
        }
      }


      if (incomeRows.length) {
        const payload = incomeRows.map(({ r, amt }) => ({
          project_id: projectId,
          // Kategoriya saqlanadi — "Shartnoma" hero kartaning Kirim'iga, "Kirim" esa pastdagi Kassa Kirim'iga tushadi
          category: r.category,
          description: r.description?.trim() || null,
          amount: amt,
          payment_method: (r.payment === "Plastik" || r.payment === "O'tkazma" || r.payment === "Hisob" || r.payment === "Bank") ? "Bank" : "Naqd",
          income_date: r.date,
          source: "web",
          source_note: r.note?.trim() || null,
        }));
        const { error } = await supabase.from("incomes").insert(payload);
        if (error) throw error;
      }
      return valid.length;
    },
    onSuccess: (n) => {
      toast.success(`Saqlandi: ${n} ta xarajat`);
      qc.invalidateQueries({ queryKey: ["master-jadval"] });
      qc.invalidateQueries({ queryKey: ["project-kpis-v3"] });
      setOpen(false);
      setRows([newRow(categories[0] ?? "")]);
      setExpanded({});
    },
    onError: (e: any) => toast.error(e?.message ?? "Xato"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)} disabled={disabled}>
        <Plus className="mr-1 h-3.5 w-3.5" /> Xarajat
      </Button>

      <DialogContent className="max-w-6xl p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="text-base sm:text-lg">Kunlik xarajat</DialogTitle>
        </DialogHeader>

        {categories.length === 0 && (
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            Hech qanday kategoriya yo'q. <a href="/settings" className="underline">Sozlamalar</a> bo'limidan kategoriya qo'shing.
          </div>
        )}

        {/* Desktop / tablet: jadval */}
        <div className="hidden md:block max-h-[60vh] overflow-auto rounded-md border">
          <Table className="min-w-[900px]">
            <TableHeader className="bg-muted/40 sticky top-0">
              <TableRow>
                <TableHead className="w-[110px]">Sana</TableHead>
                <TableHead className="w-[140px]">Kategoriya</TableHead>
                <TableHead className="w-[120px]">BOQ kodi</TableHead>
                <TableHead className="min-w-[180px]">Nomi</TableHead>
                <TableHead className="w-[70px]">Miq.</TableHead>
                <TableHead className="w-[90px]">Birlik</TableHead>
                <TableHead className="w-[110px]">Narx</TableHead>
                <TableHead className="w-[120px]">Jami</TableHead>
                <TableHead className="w-[110px]">To'lov</TableHead>
                <TableHead className="w-[40px]"></TableHead>
              </TableRow>

            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="p-1"><Input className="h-8" type="date" value={r.date} onChange={(e) => update(r.id, { date: e.target.value })} /></TableCell>
                  <TableCell className="p-1">
                    <Select value={r.category} onValueChange={(v) => update(r.id, { category: v })}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Tanlang" /></SelectTrigger>
                      <SelectContent>
                        {categories.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">Sozlamalardan qo'shing</div>
                        ) : categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1">
                    {categoryNeedsBoq(r.category) ? (
                      candidatesFor(r.category).length === 0 ? (
                        <span className="text-[11px] text-muted-foreground">Loyihada BOQ yo'q</span>
                      ) : (
                        <BoqCombobox
                          className="h-8"
                          value={r.boq_item_id}
                          items={candidatesFor(r.category)}
                          onPick={(b) => update(r.id, { boq_code: b.code, boq_item_id: b.id })}
                          onClear={() => update(r.id, { boq_code: "", boq_item_id: null })}
                        />
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="p-1">
                    <Input className="h-8" placeholder="Nomi" value={r.description} onChange={(e) => update(r.id, { description: e.target.value })} />
                  </TableCell>

                  <TableCell className="p-1"><Input className="h-8 text-right" inputMode="decimal" value={r.qty} onChange={(e) => update(r.id, { qty: e.target.value })} /></TableCell>
                  <TableCell className="p-1">
                    <Select value={r.unit || undefined} onValueChange={(v) => update(r.id, { unit: v })}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {units.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">Sozlamalardan qo'shing</div>
                        ) : units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1"><Input className="h-8 text-right" inputMode="decimal" value={r.unit_price} onChange={(e) => update(r.id, { unit_price: e.target.value })} /></TableCell>
                  <TableCell className="p-1"><Input className="h-8 text-right font-medium" inputMode="decimal" value={r.amount} onChange={(e) => update(r.id, { amount: e.target.value })} /></TableCell>
                  <TableCell className="p-1">
                    <Select value={r.payment} onValueChange={(v) => update(r.id, { payment: v })}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>{PAY.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="p-1 text-center">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobil: ixcham kartalar */}
        <div className="md:hidden max-h-[60vh] overflow-auto space-y-2 pr-1 -mx-1 px-1">
          {rows.map((r, idx) => {
            const isOpen = !!expanded[r.id];
            return (
              <div key={r.id} className="rounded-xl border border-border bg-card/50 p-2.5 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground">#{idx + 1}</span>
                  <div className="flex items-center gap-1">
                    <Input className="h-7 text-[11px] w-[120px]" type="date" value={r.date} onChange={(e) => update(r.id, { date: e.target.value })} />
                    {rows.length > 1 && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(r.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <Select value={r.category} onValueChange={(v) => update(r.id, { category: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Kategoriya" /></SelectTrigger>
                  <SelectContent>
                    {categories.length === 0 ? (
                      <div className="px-2 py-1.5 text-xs text-muted-foreground">Sozlamalardan qo'shing</div>
                    ) : categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
                {categoryNeedsBoq(r.category) && (
                  candidatesFor(r.category).length === 0 ? (
                    <div className="text-[11px] text-muted-foreground px-1">Loyihada BOQ yo'q</div>
                  ) : (
                    <BoqCombobox
                      className="h-9 text-sm"
                      value={r.boq_item_id}
                      items={candidatesFor(r.category)}
                      onPick={(b) => update(r.id, { boq_code: b.code, boq_item_id: b.id })}
                      onClear={() => update(r.id, { boq_code: "", boq_item_id: null })}
                      placeholder="BOQ kodi"
                    />
                  )
                )}
                <Input className="h-9 text-sm" placeholder="Nomi / izoh" value={r.description} onChange={(e) => update(r.id, { description: e.target.value })} />

                <div className="grid grid-cols-2 gap-1.5">
                  <Input className="h-9 text-sm text-right font-semibold" placeholder="Summa" inputMode="decimal" value={r.amount} onChange={(e) => update(r.id, { amount: e.target.value })} />
                  <Select value={r.payment} onValueChange={(v) => update(r.id, { payment: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>{PAY.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <button
                  type="button"
                  onClick={() => setExpanded((e) => ({ ...e, [r.id]: !isOpen }))}
                  className="w-full flex items-center justify-center gap-1 text-[11px] text-muted-foreground hover:text-foreground py-1"
                >
                  {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  {isOpen ? "Yopish" : "Batafsil (miqdor, birlik, narx)"}
                </button>
                {isOpen && (
                  <div className="grid grid-cols-3 gap-1.5">
                    <Input className="h-8 text-xs text-right" placeholder="Miq." inputMode="decimal" value={r.qty} onChange={(e) => update(r.id, { qty: e.target.value })} />
                    <Select value={r.unit || undefined} onValueChange={(v) => update(r.id, { unit: v })}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Birlik" /></SelectTrigger>
                      <SelectContent>
                        {units.length === 0 ? (
                          <div className="px-2 py-1.5 text-xs text-muted-foreground">Sozlamalardan qo'shing</div>
                        ) : units.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Input className="h-8 text-xs text-right" placeholder="Narx" inputMode="decimal" value={r.unit_price} onChange={(e) => update(r.id, { unit_price: e.target.value })} />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between gap-2">
          <Button variant="outline" size="sm" onClick={addBlank}><Plus className="mr-1 h-3.5 w-3.5" /> Qator qo'shish</Button>
          <div className="text-xs text-muted-foreground">
            Jami: <span className="font-medium tabular-nums">{rows.reduce((s, r) => s + (Number(r.amount) || 0), 0).toLocaleString("uz-UZ")}</span>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Bekor</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Hammasini saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
