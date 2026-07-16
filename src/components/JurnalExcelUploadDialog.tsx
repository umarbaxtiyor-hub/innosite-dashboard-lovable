import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import * as XLSX from "xlsx";
import { FileSpreadsheet, Loader2, Upload, Wand2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { parseJurnalEntry } from "@/lib/jurnal-ai.functions";

type Item = {
  kind: "material" | "work" | "expense" | "income";
  matched_zayavka_id: string | null;
  boq_item_id?: string | null;
  boq_code?: string | null;
  master_material_id?: string | null;
  master_work_id?: string | null;
  category: string | null;
  payment_method?: string | null;
  name: string;
  unit: string | null;
  qty: number;
  unit_price: number;
  who: string | null;
  note: string | null;
  date: string | null;
};

const todayStr = () => new Date().toISOString().slice(0, 10);
const CHUNK_SIZE = 15;
const CONCURRENCY = 4;

const paymentMethod = (value?: string | null) =>
  /bank|plastik|karta|o'?tkazma|hisob/i.test(String(value ?? "")) ? "Bank" : "Naqd";

// Excel serial date (1900-based) -> YYYY-MM-DD
function excelDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  // DD.MM.YYYY or DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yy] = m;
    if (yy.length === 2) yy = "20" + yy;
    return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return null;
}

function rowToText(row: Record<string, any>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(row)) {
    if (v == null || v === "") continue;
    parts.push(`${k}: ${v}`);
  }
  return parts.join(" | ");
}

export function JurnalExcelUploadDialog({ projectId, disabled }: { projectId: string | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const qc = useQueryClient();
  const parseFn = useServerFn(parseJurnalEntry);

  function resetState() {
    setItems([]);
    setFileName("");
    setProgress(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  const parseM = useMutation({
    mutationFn: async (file: File) => {
      if (!projectId) throw new Error("Loyiha tanlanmagan");
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array", cellDates: false });
      const all: Record<string, any>[] = [];
      for (const sheetName of wb.SheetNames) {
        const ws = wb.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
        for (const r of rows) {
          // skip fully empty rows
          if (Object.values(r).every((v) => v == null || v === "")) continue;
          all.push(r);
        }
      }
      if (!all.length) throw new Error("Fayl bo'sh yoki o'qib bo'lmadi");

      // Try to pick a date column from the row itself
      const dateOf = (r: Record<string, any>): string | null => {
        for (const k of Object.keys(r)) {
          if (/sana|date|дата|kun/i.test(k)) {
            const d = excelDate(r[k]);
            if (d) return d;
          }
        }
        return null;
      };

      const chunks: Record<string, any>[][] = [];
      for (let i = 0; i < all.length; i += CHUNK_SIZE) chunks.push(all.slice(i, i + CHUNK_SIZE));

      const collected: Item[] = [];
      let doneRows = 0;
      setProgress({ done: 0, total: all.length });

      const runChunk = async (chunk: Record<string, any>[], baseIdx: number) => {
        const text = chunk
          .map((r, idx) => {
            const d = dateOf(r);
            return `${baseIdx + idx + 1}) ${d ? `[sana: ${d}] ` : ""}${rowToText(r)}`;
          })
          .join("\n");
        try {
          const res = await parseFn({ data: { projectId, text } });
          const its = ((res?.items ?? []) as Item[]).map((it) => ({
            ...it,
            date: it.date ?? todayStr(),
            qty: Number(it.qty) || 1,
            unit_price: Number(it.unit_price) || 0,
          }));
          collected.push(...its);
        } catch (e: any) {
          console.error("Chunk parse failed", e);
        } finally {
          doneRows += chunk.length;
          setProgress({ done: doneRows, total: all.length });
        }
      };

      // Process with limited concurrency
      let cursor = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, async () => {
        while (cursor < chunks.length) {
          const idx = cursor++;
          await runChunk(chunks[idx], idx * CHUNK_SIZE);
        }
      });
      await Promise.all(workers);

      setProgress({ done: all.length, total: all.length });
      return collected;
    },
    onSuccess: (its) => {
      setProgress(null);
      if (!its.length) {
        toast.error("AI hech narsa topa olmadi — faylni tekshiring");
        return;
      }
      setItems(its);
      toast.success(`${its.length} ta yozuv tayyorlandi`, {
        description: "Jurnalga avtomatik saqlanmoqda...",
      });
      // Avtomatik saqlash
      setTimeout(() => saveM.mutate(), 150);
    },
    onError: (e: any) => {
      setProgress(null);
      toast.error("Excel o'qishda xato", {
        description: e?.message ?? "Faylni tekshirib qaytadan urinib ko'ring",
        duration: 8000,
      });
    },
  });

  const saveM = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Loyiha tanlanmagan");
      if (!items.length) throw new Error("Yozuvlar yo'q");
      const mats: any[] = [];
      const works: any[] = [];
      const exps: any[] = [];
      const incs: any[] = [];
      for (const it of items) {
        const date = it.date || todayStr();
        if (it.kind === "material") {
          mats.push({
            project_id: projectId,
            material_name: it.name,
            qty: it.qty,
            unit: it.unit,
            unit_price: it.unit_price,
            supplier_name: it.who,
            received_at: date,
            zayavka_id: it.matched_zayavka_id ?? undefined,
            boq_item_id: it.boq_item_id ?? undefined,
            boq_code: it.boq_code ?? undefined,
            master_material_id: it.master_material_id ?? undefined,
            source: "excel",
            source_note: it.note,
          });
        } else if (it.kind === "work") {
          works.push({
            project_id: projectId,
            work_type: it.name,
            qty_done: it.qty,
            unit: it.unit,
            unit_price: it.unit_price,
            brigade_name: it.who,
            work_date: date,
            zayavka_id: it.matched_zayavka_id ?? undefined,
            boq_item_id: it.boq_item_id ?? undefined,
            boq_code: it.boq_code ?? undefined,
            master_work_id: it.master_work_id ?? undefined,
            source: "excel",
            source_note: it.note,
          });
        } else if (it.kind === "income") {
          const amount = Number(it.unit_price) || (Number(it.qty) || 1) * (Number(it.unit_price) || 0);
          const _t = `${it.name ?? ""} ${it.note ?? ""} ${it.category ?? ""}`.toLowerCase();
          const _isContract = /shartnom|kontrak|contract/.test(_t);
          incs.push({
            project_id: projectId,
            category: _isContract ? "Shartnoma" : "Kirim",
            description: it.name,
            amount,
            payment_method: paymentMethod(it.payment_method || it.note || it.name),
            payer: it.who,
            income_date: date,
            source: "excel",
            source_note: it.note,
          });
        } else {
          exps.push({
            project_id: projectId,
            category: it.category?.trim() || "Boshqa",
            description: it.name,
            qty: it.qty,
            unit: it.unit,
            unit_price: it.unit_price,
            amount: (it.qty || 1) * (it.unit_price || 0),
            payment_method: "Naqd" as const,
            paid_by: it.who,
            expense_date: date,
            zayavka_id: it.matched_zayavka_id ?? undefined,
            boq_item_id: it.boq_item_id ?? undefined,
            boq_code: it.boq_code ?? undefined,
            source: "excel",
            source_note: it.note,
          });
        }
      }
      const errs: string[] = [];
      if (mats.length) {
        const { error } = await supabase.from("material_receipts").insert(mats);
        if (error) errs.push(`Material: ${error.message}`);
      }
      if (works.length) {
        const { error } = await supabase.from("work_progress").insert(works);
        if (error) errs.push(`Ish: ${error.message}`);
      }
      if (exps.length) {
        const { error } = await supabase.from("expenses").insert(exps);
        if (error) errs.push(`Xarajat: ${error.message}`);
      }
      if (incs.length) {
        const { error } = await supabase.from("incomes").insert(incs);
        if (error) errs.push(`Kirim: ${error.message}`);
      }
      if (errs.length) throw new Error(errs.join("; "));
      return { mats: mats.length, works: works.length, exps: exps.length, incs: incs.length };
    },
    onSuccess: async (s) => {
      const total = s.mats + s.works + s.exps + s.incs;
      toast.success(`✅ ${total} ta yozuv jurnalga qo'shildi`, {
        description: `Material: ${s.mats} · Ish: ${s.works} · Xarajat: ${s.exps} · Kirim: ${s.incs}`,
        duration: 5000,
      });
      // Jurnal sahifasini avtomatik yangilash
      await qc.invalidateQueries({ queryKey: ["master-jadval"] });
      await qc.refetchQueries({ queryKey: ["master-jadval"], type: "active" });
      setOpen(false);
      resetState();
    },
    onError: (e: any) => toast.error("Saqlashda xato", {
      description: e?.message ?? "Qaytadan urinib ko'ring",
      duration: 8000,
    }),
  });

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFileName(f.name);
    setItems([]);
    parseM.mutate(f);
  }
  function patch(i: number, p: Partial<Item>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  }
  function removeAt(i: number) { setItems((arr) => arr.filter((_, idx) => idx !== i)); }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) resetState(); }}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={disabled || !projectId}>
        <FileSpreadsheet className="mr-1 h-3.5 w-3.5" /> Excel yuklash
      </Button>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" /> Jurnalga Excel yuklash
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Chalkash Excel/CSV faylni yuklang — AI har bir qatorni avtomatik aniqlaydi (material, ish, xarajat yoki kirim) va reja bilan moslaydi. Sana, summa, kim — har xil formatda bo'lishi mumkin.
          </div>

          <div className="flex items-center gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={onFile}
            />
            <Button onClick={() => fileRef.current?.click()} disabled={parseM.isPending}>
              {parseM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
              Fayl tanlash
            </Button>
            {fileName && <span className="text-xs text-muted-foreground truncate">{fileName}</span>}
            {progress && (
              <span className="text-xs text-muted-foreground">
                {progress.done} / {progress.total} qator
              </span>
            )}
          </div>

          {parseM.isPending && (
            <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3 text-xs">
              <Wand2 className="h-4 w-4 animate-pulse text-primary" />
              AI faylni tahlil qilmoqda...
            </div>
          )}

          {items.length > 0 && (
            <div className="max-h-[55vh] overflow-auto rounded-md border">
              <div className="divide-y">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 p-2 text-xs items-center">
                    <div className="col-span-2">
                      <Badge
                        variant={it.kind === "expense" ? "destructive" : it.kind === "work" ? "default" : it.kind === "income" ? "outline" : "secondary"}
                        className="cursor-pointer"
                        onClick={() => {
                          const next: Item["kind"] =
                            it.kind === "material" ? "work"
                            : it.kind === "work" ? "expense"
                            : it.kind === "expense" ? "income"
                            : "material";
                          patch(i, {
                            kind: next,
                            matched_zayavka_id: next === "expense" || next === "income" ? null : it.matched_zayavka_id,
                            category: next === "expense" ? (it.category || "Boshqa") : next === "income" ? "Kirim" : null,
                            payment_method: next === "income" ? (it.payment_method || "Naqd") : it.payment_method,
                          });
                        }}
                        title="Turini almashtirish"
                      >
                        {it.kind === "material" ? "Material" : it.kind === "work" ? "Ish" : it.kind === "income" ? "💰 Kirim" : "Xarajat"}
                        {it.matched_zayavka_id ? " ✓" : ""}
                      </Badge>
                    </div>
                    <Input className="h-8 col-span-4" value={it.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Nomi" />
                    <Input className="h-8 col-span-1 text-right" inputMode="decimal" value={String(it.qty)} onChange={(e) => patch(i, { qty: Number(e.target.value) || 0 })} />
                    <Input className="h-8 col-span-1" value={it.unit ?? ""} onChange={(e) => patch(i, { unit: e.target.value })} placeholder="dona" />
                    <Input className="h-8 col-span-2 text-right" inputMode="decimal" value={String(it.unit_price)} onChange={(e) => patch(i, { unit_price: Number(e.target.value) || 0 })} placeholder="narx" />
                    <Input className="h-8 col-span-1 text-xs" type="date" value={it.date ?? todayStr()} onChange={(e) => patch(i, { date: e.target.value })} />
                    <div className="col-span-1 flex justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeAt(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {it.kind === "expense" && (
                      <Input
                        className="h-8 col-span-3 col-start-3 text-xs"
                        value={it.category ?? ""}
                        onChange={(e) => patch(i, { category: e.target.value })}
                        placeholder="Kategoriya"
                      />
                    )}
                    {it.kind === "income" && (
                      <select
                        className="h-8 col-span-3 col-start-3 rounded-md border border-input bg-background px-2 text-xs"
                        value={paymentMethod(it.payment_method)}
                        onChange={(e) => patch(i, { payment_method: e.target.value })}
                      >
                        <option value="Naqd">Naqd</option>
                        <option value="Bank">Bank</option>
                      </select>
                    )}
                    <Input
                      className={`h-8 ${it.kind === "expense" || it.kind === "income" ? "col-span-3" : "col-span-6 col-start-3"} text-xs`}
                      value={it.who ?? ""}
                      onChange={(e) => patch(i, { who: e.target.value || null })}
                      placeholder={it.kind === "income" ? "Kimdan keldi" : "Kim"}
                    />
                    <Input className="h-8 col-span-5 text-xs" value={it.note ?? ""} onChange={(e) => patch(i, { note: e.target.value || null })} placeholder="Izoh" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); resetState(); }}>Bekor</Button>
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending || !items.length}>
            {saveM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {items.length ? `${items.length} ta yozuvni saqlash` : "Saqlash"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
