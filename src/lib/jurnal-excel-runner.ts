// Background runner for Jurnal Excel upload.
// Runs independently of any React component so that navigating away
// does not cancel the in-flight upload.

import * as XLSX from "xlsx";
import { toast } from "sonner";
import type { QueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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

const CHUNK_SIZE = 60;
const CONCURRENCY = 6;
const todayStr = () => new Date().toISOString().slice(0, 10);

const paymentMethod = (v?: string | null) =>
  /bank|plastik|karta|o'?tkazma|hisob/i.test(String(v ?? "")) ? "Bank" : "Naqd";

function excelDate(v: any): string | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    if (isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (m) {
    let [, dd, mm, yy] = m;
    if (yy.length === 2) yy = "20" + yy;
    return `${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }
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

// Singleton guard — bitta vaqtda faqat bitta yuklash
let running = false;
export function isJurnalExcelUploadRunning() {
  return running;
}

type ParseFn = (arg: { data: { projectId: string; text: string } }) => Promise<any>;

// Innosite Jurnal shabloni: ustunlar Oy, Sana, T/r, Material/Xarajat nomi, Kategoriya, Miqdor, Narx, Summa, Xarajatchi, Izoh
function isJurnalTemplate(rows: Record<string, any>[]): boolean {
  if (!rows.length) return false;
  const keys = Object.keys(rows[0] ?? {}).map((k) => k.toLowerCase().trim());
  const has = (needle: string) => keys.some((k) => k.includes(needle));
  return has("sana") && (has("nomi") || has("xarajat")) && has("narx") && (has("summa") || has("miqdor"));
}

function num(v: any): number {
  if (v == null || v === "") return 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/[^\d.,-]/g, "");
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  let normalized = cleaned;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot
      ? cleaned.replace(/\./g, "").replace(",", ".")
      : cleaned.replace(/,/g, "");
  } else if (lastComma >= 0) {
    const decimals = cleaned.length - lastComma - 1;
    normalized = decimals === 3 ? cleaned.replace(/,/g, "") : cleaned.replace(",", ".");
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : 0;
}

function pick(row: Record<string, any>, ...needles: string[]): any {
  for (const n of needles) {
    const k = Object.keys(row).find((kk) => kk.toLowerCase().includes(n.toLowerCase()));
    if (k != null && row[k] !== "" && row[k] != null) return row[k];
  }
  return null;
}

function parseTemplateRows(rows: Record<string, any>[]): Item[] {
  const out: Item[] = [];
  for (const r of rows) {
    const name = String(pick(r, "nomi", "xarajat", "material") ?? "").trim();
    if (!name) continue;
    const qty = num(pick(r, "miqdor", "qty"));
    const price = num(pick(r, "narx", "price"));
    const summa = num(pick(r, "summa", "jami", "amount"));
    const kirim = num(pick(r, "kirim", "income"));
    const chiqim = num(pick(r, "chiqim", "outcome", "expense"));
    const unit = String(pick(r, "birlik", "unit") ?? "") || null;
    const category = String(pick(r, "kategoriya", "category") ?? "").trim() || "Boshqa";
    const kindText = `${pick(r, "turi", "tur", "kind") ?? ""} ${category}`.toLowerCase();
    const who = String(pick(r, "xarajatchi", "xodim", "kim") ?? "").trim() || null;
    const note = String(pick(r, "izoh", "note") ?? "").trim() || null;
    const date = excelDate(pick(r, "sana", "date"));
    const isIncome = kirim > 0 || kindText.includes("kirim");
    // amount priority: exported Jurnal columns (Kirim/Chiqim) > Summa > Miqdor*Narx > Narx
    let amount = isIncome ? kirim : chiqim;
    if (!amount) amount = summa;
    if (!amount) amount = qty && price ? qty * price : price;
    const effectiveQty = amount && (kirim || chiqim || summa) ? 1 : (qty || 1);
    const effectivePrice = amount / (effectiveQty || 1);
    out.push({
      kind: isIncome ? "income" : "expense",
      matched_zayavka_id: null,
      category,
      payment_method: null,
      name,
      unit,
      qty: effectiveQty,
      unit_price: effectivePrice,
      who,
      note,
      date,
    });
  }
  return out;
}

export async function startJurnalExcelUpload(opts: {
  projectId: string;
  file: File;
  parseFn: ParseFn;
  qc: QueryClient;
}) {
  const { projectId, file, parseFn, qc } = opts;
  if (running) {
    toast.error("Boshqa yuklash davom etmoqda — biroz kuting");
    return;
  }
  running = true;
  const toastId = toast.loading("Excel o'qilmoqda…", {
    description: file.name,
    duration: Infinity,
  });

  try {
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: false });
    const all: Record<string, any>[] = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
      for (const r of rows) {
        if (Object.values(r).every((v) => v == null || v === "")) continue;
        all.push(r);
      }
    }
    if (!all.length) throw new Error("Fayl bo'sh yoki o'qib bo'lmadi");

    const collected: Item[] = [];

    // TEZ YO'L: Innosite Jurnal shabloni bo'lsa AI'siz mahalliy parse qilamiz
    if (isJurnalTemplate(all)) {
      const items = parseTemplateRows(all);
      collected.push(...items.map((it) => ({ ...it, date: it.date ?? todayStr() })));
      toast.loading(`Shablon aniqlandi — ${items.length} ta qator`, { id: toastId, description: file.name, duration: Infinity });
    } else {

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

    let doneRows = 0;
    let firstAiError: string | null = null;
    toast.loading(`AI tahlil qilmoqda… 0 / ${all.length}`, { id: toastId, description: file.name, duration: Infinity });

    const runChunk = async (chunk: Record<string, any>[], baseIdx: number) => {
      const text = chunk
        .map((r, idx) => {
          const d = dateOf(r);
          return `${baseIdx + idx + 1}) ${d ? `[sana: ${d}] ` : ""}${rowToText(r)}`;
        })
        .join("\n");
      try {
        // 429 yoki vaqtinchalik xatolikda 1 marta qayta urinamiz
        let attempt = 0;
        while (true) {
          try {
            const res = await parseFn({ data: { projectId, text } });
            if (res?.error) throw new Error(res.error);
            const its = ((res?.items ?? []) as Item[]).map((it) => ({
              ...it,
              date: it.date ?? todayStr(),
              qty: Number(it.qty) || 1,
              unit_price: Number(it.unit_price) || 0,
            }));
            collected.push(...its);
            break;
          } catch (e: any) {
            const msg = String(e?.message ?? e);
            const retriable = /429|limit|timeout|timed?\s*out|network|fetch|5\d\d/i.test(msg);
            if (attempt === 0 && retriable) {
              attempt++;
              await new Promise((r) => setTimeout(r, 2000));
              continue;
            }
            throw e;
          }
        }
      } catch (e: any) {
        console.error("Chunk parse failed", e);
        if (!firstAiError) firstAiError = e?.message ?? String(e);
      } finally {
        doneRows += chunk.length;
        toast.loading(`AI tahlil qilmoqda… ${doneRows} / ${all.length}`, {
          id: toastId,
          description: file.name,
          duration: Infinity,
        });
      }
    };

    let cursor = 0;
    const workers = Array.from({ length: Math.min(CONCURRENCY, chunks.length) }, async () => {
      while (cursor < chunks.length) {
        const idx = cursor++;
        await runChunk(chunks[idx], idx * CHUNK_SIZE);
      }
    });
    await Promise.all(workers);
    if (!collected.length && firstAiError) {
      toast.error("AI tahlil qila olmadi", { id: toastId, description: String(firstAiError).slice(0, 200), duration: 8000 });
      return;
    }
    } // end else (AI branch)

    if (!collected.length) {
      toast.error("Hech narsa topilmadi — shablon ustunlari (Sana, Nomi, Narx, Summa/Miqdor) yo'q. Excel yuklash tugmasidagi shablonni yuklab oling.", { id: toastId, duration: 8000 });
      return;
    }

    toast.loading(`Jurnalga saqlanmoqda… (${collected.length} ta yozuv)`, {
      id: toastId,
      description: file.name,
      duration: Infinity,
    });

    const mats: any[] = [];
    const works: any[] = [];
    const exps: any[] = [];
    const incs: any[] = [];
    for (const it of collected) {
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
          category: _isContract ? "Shartnoma" : paymentMethod(it.payment_method || it.note || it.name),
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
    const failedRows: { kind: string; name: string; date: string | null; reason: string }[] = [];
    let inserted = 0;
    let skipped = 0;

    // Dedup signature: kind|date|normalized-name|rounded-amount
    const normName = (s: any) => String(s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
    const sig = (kind: string, date: any, name: any, amount: any) =>
      `${kind}|${date ?? ""}|${normName(name)}|${Math.round(Number(amount) || 0)}`;

    // Fetch existing rows to build dedup set
    const existing = new Set<string>();
    const [em, ew, ex, ei] = await Promise.all([
      supabase.from("material_receipts").select("material_name,received_at,qty,unit_price").eq("project_id", projectId),
      supabase.from("work_progress").select("work_type,work_date,qty_done,unit_price").eq("project_id", projectId),
      supabase.from("expenses").select("description,expense_date,amount").eq("project_id", projectId),
      supabase.from("incomes").select("description,income_date,amount").eq("project_id", projectId),
    ]);
    for (const r of em.data ?? []) existing.add(sig("material_receipts", (r as any).received_at, (r as any).material_name, (Number((r as any).qty)||0) * (Number((r as any).unit_price)||0)));
    for (const r of ew.data ?? []) existing.add(sig("work_progress", (r as any).work_date, (r as any).work_type, (Number((r as any).qty_done)||0) * (Number((r as any).unit_price)||0)));
    for (const r of ex.data ?? []) existing.add(sig("expenses", (r as any).expense_date, (r as any).description, (r as any).amount));
    for (const r of ei.data ?? []) existing.add(sig("incomes", (r as any).income_date, (r as any).description, (r as any).amount));

    function dedup(table: string, rows: any[], nameKey: string, dateKey: string, amountFn: (r: any) => number) {
      const out: any[] = [];
      for (const r of rows) {
        const s = sig(table, r[dateKey], r[nameKey], amountFn(r));
        if (existing.has(s)) { skipped++; continue; }
        existing.add(s); // avoid duplicates within the same file
        out.push(r);
      }
      return out;
    }

    const matsNew = dedup("material_receipts", mats, "material_name", "received_at", (r) => (Number(r.qty)||0) * (Number(r.unit_price)||0));
    const worksNew = dedup("work_progress", works, "work_type", "work_date", (r) => (Number(r.qty_done)||0) * (Number(r.unit_price)||0));
    const expsNew = dedup("expenses", exps, "description", "expense_date", (r) => Number(r.amount)||0);
    const incsNew = dedup("incomes", incs, "description", "income_date", (r) => Number(r.amount)||0);

    const BATCH = 400;
    const totalToInsert = matsNew.length + worksNew.length + expsNew.length + incsNew.length;
    let processed = 0;

    async function insertWithFallback(table: string, kind: string, rows: any[], nameKey: string, dateKey: string) {
      if (!rows.length) return;
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const { error, data } = await supabase.from(table as any).insert(batch).select("id");
        if (!error) {
          inserted += data?.length ?? batch.length;
        } else {
          console.error(`[jurnal-excel] batch insert failed for ${table}:`, error);
          // Faqat shu bo'lakni bitta-bitta qo'shamiz, xatoli qatorlarni aniqlaymiz
          for (const row of batch) {
            const { error: rowErr } = await supabase.from(table as any).insert(row).select("id").single();
            if (rowErr) {
              const reason = rowErr.message || String(rowErr);
              failedRows.push({ kind, name: String(row[nameKey] ?? "?"), date: row[dateKey] ?? null, reason });
            } else {
              inserted++;
            }
          }
          errs.push(`${kind}: ${error.message}`);
        }
        processed += batch.length;
        toast.loading(`Jurnalga saqlanmoqda… ${processed} / ${totalToInsert}`, {
          id: toastId,
          description: file.name,
          duration: Infinity,
        });
      }
    }

    await insertWithFallback("material_receipts", "Material", matsNew, "material_name", "received_at");
    await insertWithFallback("work_progress", "Ish", worksNew, "work_type", "work_date");
    await insertWithFallback("expenses", "Xarajat", expsNew, "description", "expense_date");
    await insertWithFallback("incomes", "Kirim", incsNew, "description", "income_date");


    // Har qanday holatda cache'ni yangilaymiz (qisman muvaffaqiyat bo'lsa ham)
    await qc.invalidateQueries({ queryKey: ["master-jadval"] });
    await qc.invalidateQueries({ queryKey: ["project-kpis-v3"] });
    await qc.invalidateQueries({ queryKey: ["dashboard-real-spend"] });
    await qc.invalidateQueries({ queryKey: ["dashboard-daily-spend"] });
    await qc.invalidateQueries({ queryKey: ["dashboard-plan-vs-fact"] });
    await qc.refetchQueries({ queryKey: ["master-jadval"] });
    await qc.refetchQueries({ queryKey: ["project-kpis-v3"] });

    if (errs.length && inserted === 0) {
      const detail = failedRows.length
        ? failedRows.slice(0, 3).map((f) => `[${f.kind}] "${f.name}" — ${f.reason}`).join(" | ")
        : errs.join("; ");
      throw new Error(detail);
    }

    if (failedRows.length || errs.length) {
      const preview = failedRows.slice(0, 3).map((f) => `• [${f.kind}] "${f.name}": ${f.reason}`).join("\n")
        || errs.join("; ");
      // Konsolga to'liq ro'yxatni yozamiz — F12 orqali ko'rish mumkin
      console.warn(`[jurnal-excel] ${failedRows.length} ta qator tushmadi:`, failedRows);
      toast.warning(`⚠️ ${inserted} qo'shildi, ${failedRows.length || "?"} tushmadi`, {
        id: toastId,
        description: preview + (failedRows.length > 3 ? `\n…yana ${failedRows.length - 3} ta. To'liq ro'yxat: F12 → Console` : ""),
        duration: 15000,
      });
    } else {
      const dupeMsg = skipped > 0 ? ` · ${skipped} ta takror o'tkazib yuborildi` : "";
      toast.success(`✅ ${inserted} ta yozuv jurnalga qo'shildi${dupeMsg}`, {
        id: toastId,
        description: `Material: ${matsNew.length} · Ish: ${worksNew.length} · Xarajat: ${expsNew.length} · Kirim: ${incsNew.length}${skipped ? ` · Takror: ${skipped}` : ""}`,
        duration: 6000,
      });
    }
  } catch (e: any) {
    toast.error("Excel yuklashda xato", {
      id: toastId,
      description: e?.message ?? "Qaytadan urinib ko'ring",
      duration: 8000,
    });
  } finally {
    running = false;
  }
}
