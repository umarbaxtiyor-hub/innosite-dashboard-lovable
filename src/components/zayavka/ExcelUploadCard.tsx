import { useRef, useState } from "react";
import { Upload, Loader2, CheckCircle2, AlertCircle, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { normalizeZayavkaRows } from "@/lib/zayavka-excel-ai.functions";
import templateAsset from "@/assets/innosite-smeta-shablon.xlsx.asset.json";

const TEMPLATE_KEYS = new Set(["tur", "nomi", "birlik", "miqdor", "narx", "izoh"]);
function isTemplateRows(rows: any[]): boolean {
  if (!rows.length) return false;
  const keys = Object.keys(rows[0] ?? {}).map((k) => k.toLowerCase().trim());
  // template if at least tur+nomi+birlik+miqdor exist as exact keys
  const required = ["tur", "nomi", "birlik", "miqdor"];
  return required.every((r) => keys.includes(r)) && keys.every((k) => TEMPLATE_KEYS.has(k) || k === "");
}

type ParsedRow = {
  kind: "material" | "work";
  name: string;
  unit: string;
  qty: number;
  unit_price: number;
  notes?: string | null;
  master_id?: string | null;
  off_plan?: boolean;
};

function normKind(v: any): "material" | "work" | null {
  const s = String(v ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["material", "материал", "mat", "m"].some((k) => s.startsWith(k))) return "material";
  if (["ish", "work", "работ", "w", "i"].some((k) => s.startsWith(k))) return "work";
  return null;
}
function num(v: any): number {
  if (v == null || v === "") return 0;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

export function ExcelUploadCard({ projectId, onDone, compact }: { projectId: string; onDone?: () => void; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [result, setResult] = useState<{ ok: number; skipped: number; viaAi?: boolean } | null>(null);
  const aiNormalize = useServerFn(normalizeZayavkaRows);
  // AI doim yoqilgan — foydalanuvchiga ko'rinmaydi
  const mode: "ai" = "ai";


  function parseLocal(rows: any[]): { items: ParsedRow[]; skipped: number } {
    const out: ParsedRow[] = [];
    let skipped = 0;
    for (const r of rows) {
      const keys = Object.keys(r);
      const get = (...names: string[]) => {
        for (const n of names) {
          const k = keys.find((kk) => kk.toLowerCase().includes(n.toLowerCase()));
          if (k) return r[k];
        }
        return "";
      };
      const kind = normKind(get("turi", "tur", "kind", "тип"));
      const name = String(get("nomi", "name", "наимен", "название") ?? "").trim();
      const unit = String(get("birlik", "birim", "unit", "ед") ?? "").trim() || "dona";
      const qty = num(get("miqdor", "qty", "количеств"));
      const unit_price = num(get("narx", "price", "цен"));
      const notes = String(get("izoh", "note", "примеч") ?? "").trim() || null;
      if (!kind || !name) { skipped++; continue; }
      out.push({ kind, name, unit, qty, unit_price, notes });
    }
    return { items: out, skipped };
  }

  async function readRawRows(file: File): Promise<any[]> {
    const XLSX = await import("xlsx");
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array" });
    const all: any[] = [];
    for (const name of wb.SheetNames) {
      const sheet = wb.Sheets[name];
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: false });
      all.push(...rows);
    }
    return all;
  }

  // normalize name for dedup: lowercase, trim, collapse whitespace
  function normKey(name: string, unit: string, kind: string) {
    const n = (name || "").toLowerCase().trim().replace(/\s+/g, " ");
    const u = (unit || "dona").toLowerCase().trim();
    return `${kind}::${n}::${u}`;
  }

  async function insertItems(items: ParsedRow[], viaAi: boolean, skipped: number) {
    // 1) Excel ichida bir xil (kind + nom + birlik) qatorlarni birlashtirish
    const merged = new Map<string, {
      project_id: string; kind: string; name: string; unit: string;
      qty: number; unit_price: number; notes: string | null;
      status: "approved"; off_plan: boolean;
      master_material_id?: string | null; master_work_id?: string | null;
      _sumWeighted: number; // qty * unit_price yig'indisi (weighted avg uchun)
    }>();
    let mergedCount = 0;
    for (const p of items) {
      if (!p || !p.name) continue;
      const qty = Number(p.qty) || 0;
      const price = Number(p.unit_price) || 0;
      const key = normKey(p.name, p.unit || "dona", p.kind);
      const existing = merged.get(key);
      if (existing) {
        existing.qty += qty;
        existing._sumWeighted += qty * price;
        if (p.notes && !existing.notes?.includes(p.notes)) {
          existing.notes = [existing.notes, p.notes].filter(Boolean).join(" | ");
        }
        mergedCount++;
      } else {
        merged.set(key, {
          project_id: projectId,
          kind: p.kind,
          name: p.name,
          unit: p.unit || "dona",
          qty,
          unit_price: price,
          notes: p.notes ?? null,
          status: "approved",
          off_plan: !!p.off_plan,
          ...(p.kind === "material" ? { master_material_id: p.master_id ?? null } : { master_work_id: p.master_id ?? null }),
          _sumWeighted: qty * price,
        });
      }
    }
    // weighted average unit_price
    for (const v of merged.values()) {
      if (v.qty > 0) v.unit_price = Math.round(v._sumWeighted / v.qty);
    }

    // 2) Bazadagi mavjud qatorlar bilan ham birlashtirish (master qatorlar — zayavka_no IS NULL)
    const { data: existingRows } = await supabase
      .from("project_zayavka")
      .select("id,kind,name,unit,qty,unit_price")
      .eq("project_id", projectId)
      .is("zayavka_no", null)
      .is("parent_id", null);
    const existingMap = new Map<string, { id: string; qty: number; unit_price: number }>();
    (existingRows ?? []).forEach((r: any) => {
      existingMap.set(normKey(r.name, r.unit, r.kind), { id: r.id, qty: Number(r.qty) || 0, unit_price: Number(r.unit_price) || 0 });
    });

    const toInsert: any[] = [];
    const toUpdate: { id: string; qty: number; unit_price: number }[] = [];
    for (const [key, v] of merged.entries()) {
      const { _sumWeighted, ...row } = v;
      const ex = existingMap.get(key);
      if (ex) {
        const newQty = ex.qty + v.qty;
        const newPrice = newQty > 0 ? Math.round((ex.qty * ex.unit_price + v.qty * v.unit_price) / newQty) : v.unit_price;
        toUpdate.push({ id: ex.id, qty: newQty, unit_price: newPrice });
        mergedCount++;
      } else {
        toInsert.push(row);
      }
    }

    if (!toInsert.length && !toUpdate.length) {
      toast.error("Hech qanday qator topilmadi");
      setResult({ ok: 0, skipped, viaAi });
      return;
    }

    if (toInsert.length) {
      const { error } = await supabase.from("project_zayavka").insert(toInsert);
      if (error) throw error;
    }
    for (const u of toUpdate) {
      const { error } = await supabase.from("project_zayavka").update({ qty: u.qty, unit_price: u.unit_price }).eq("id", u.id);
      if (error) throw error;
    }

    const totalRows = toInsert.length + toUpdate.length;
    toast.success(`${totalRows} ta qator${mergedCount > 0 ? ` · ${mergedCount} ta birlashtirildi` : ""}${viaAi ? " · AI" : ""}`);
    setResult({ ok: totalRows, skipped, viaAi });
    onDone?.();
  }


  async function handleFile(file: File) {
    setBusy(true);
    setResult(null);
    try {
      const rawRows = await readRawRows(file);
      if (!rawRows.length) {
        toast.error("Excel bo'sh ko'rinadi");
        return;
      }

      // 1) TEZ YO'L: Innosite shabloni bo'lsa AI ishlatmasdan to'g'ridan-to'g'ri parse qilamiz
      if (isTemplateRows(rawRows)) {
        const { items, skipped } = parseLocal(rawRows);
        await insertItems(items, false, skipped);
        return;
      }

      // 2) AI normalizatsiya — parallel chunks
      setAiBusy(true);
      const chunkSize = 80;
      const chunks: any[][] = [];
      for (let i = 0; i < rawRows.length; i += chunkSize) chunks.push(rawRows.slice(i, i + chunkSize));
      // parallel — lekin katta fayllarda 4 tadan cheklaymiz
      const CONCURRENCY = 4;
      const allItems: ParsedRow[] = [];
      for (let i = 0; i < chunks.length; i += CONCURRENCY) {
        const batch = chunks.slice(i, i + CONCURRENCY);
        const results = await Promise.all(batch.map((ch) => aiNormalize({ data: { rows: ch } })));
        for (const res of results) {
          const items = (res?.items ?? []) as any[];
          for (const it of items) {
            const kind = it?.kind === "work" ? "work" : it?.kind === "material" ? "material" : null;
            if (!kind || !it?.name) continue;
            allItems.push({
              kind,
              name: String(it.name).trim(),
              unit: String(it.unit ?? "dona").trim() || "dona",
              qty: Number(it.qty) || 0,
              unit_price: Number(it.unit_price) || 0,
              notes: it.notes ?? null,
              master_id: it.master_id ?? null,
              off_plan: !!it.off_plan,
            });
          }
        }
      }
      await insertItems(allItems, true, Math.max(0, rawRows.length - allItems.length));
    } catch (e: any) {
      toast.error(e?.message ?? "Yuklashda xatolik");
    } finally {
      setAiBusy(false);
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const loading = busy || aiBusy;

  if (compact) {
    return (
      <>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
          }}
        />
        <Button size="sm" variant="outline" asChild>
          <a href={templateAsset.url} download="innosite-smeta-shablon.xlsx">
            <Download className="mr-1 h-4 w-4" /> Shablon
          </a>
        </Button>
        <Button size="sm" disabled={loading} onClick={() => inputRef.current?.click()}>
          {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
          {loading ? "Yuklanmoqda..." : "Excel yuklash"}
        </Button>
      </>
    );
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium">Excel orqali reja yuklash</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            Innosite shablonini yuklab oling — tez va aniq. Yoki istalgan Excel yuklang, AI o'zi tartibga soladi.
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
          <Button size="sm" variant="outline" asChild>
            <a href={templateAsset.url} download="innosite-smeta-shablon.xlsx">
              <Download className="mr-1 h-4 w-4" /> Shablon
            </a>
          </Button>
          <Button size="sm" disabled={loading} onClick={() => inputRef.current?.click()}>
            {loading ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Upload className="mr-1 h-4 w-4" />}
            {busy || aiBusy ? "Yuklanmoqda..." : "Excel yuklash"}
          </Button>
        </div>
      </div>
      {result && (
        <div className="mt-3 flex items-center gap-3 text-xs flex-wrap">
          <span className="inline-flex items-center gap-1 text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> {result.ok} qator qo'shildi
          </span>
          {result.skipped > 0 && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <AlertCircle className="h-3.5 w-3.5" /> {result.skipped} qator o'tkazib yuborildi
            </span>
          )}
        </div>
      )}
    </Card>
  );
}


