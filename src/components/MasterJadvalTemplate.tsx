import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Download, Upload, Loader2, Printer, FileSpreadsheet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// Stable hash for dedup (FNV-1a 64-bit -> hex)
function rowHash(parts: Array<string | number | null | undefined>): string {
  const s = parts.map((p) => String(p ?? "").trim().toLowerCase()).join("|");
  let h1 = 0xcbf29ce4, h2 = 0x84222325;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 ^= c; h2 ^= c;
    h1 = (h1 * 0x01000193) >>> 0;
    h2 = (h2 * 0x01000193) >>> 0;
  }
  return h1.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}

// Master jadval qaysi kategoriyalarni qo'llab-quvvatlasa, shu yerda ko'rsatilgan.
// Shablonda foydalanuvchiga ko'rsatib, importda mos jadvalga yozamiz.
export const KATEGORIYALAR = [
  "Qurilish materiali",
  "Oziq-ovqat",
  "Benzin",
  "Salyarka",
  "Texnika",
  "Ofis/Lager",
  "Oylik",
  "Avans",
  "Boshqa",
] as const;

export const BIRLIKLAR = [
  "dona", "qop", "m", "m2", "m3", "kg", "tn", "litr",
  "kun", "soat", "smena", "oy", "rulon", "quti", "to'plam", "komplekt",
  "metr", "santimetr", "shtuk", "paket", "tonna", "gramm", "tube", "set",
] as const;

const SHEETS = [
  {
    name: "1. Materiallar",
    table: "material_receipts",
    headers: ["Sana (YYYY-MM-DD)", "BOQ kodi", "Material nomi", "Birlik", "Miqdor", "Birim narx", "Jami summa", "Ta'minotchi", "Izoh"],
    sample: [
      ["2026-05-09", "M-001", "Sement M400", "qop", 100, 65000, 6500000, "ABC ta'minot", "Birinchi partiya"],
      ["2026-05-09", "M-002", "G'isht qizil", "dona", 5000, 1200, 6000000, "G'isht zavodi", ""],
    ],
    map: (r: any, projectId: string) => {
      const date = r["Sana (YYYY-MM-DD)"] || new Date().toISOString().slice(0, 10);
      const code = String(r["BOQ kodi"] ?? "").trim() || null;
      const name = String(r["Material nomi"] ?? "").trim();
      const unit = String(r["Birlik"] ?? "").trim() || null;
      const qty = Number(r["Miqdor"]) || 0;
      const price = Number(r["Birim narx"]) || 0;
      const total = Number(r["Jami summa"]) || qty * price;
      const supplier = String(r["Ta'minotchi"] ?? "").trim() || null;
      const note = String(r["Izoh"] ?? "").trim() || null;
      const hash = String(r["import_hash"] ?? "").trim() ||
        rowHash(["mat", date, code, name, unit, qty, price, supplier]);
      return {
        project_id: projectId, received_at: date, boq_code: code, material_name: name,
        unit, qty, unit_price: price, total_price: total, supplier_name: supplier,
        source_note: note, source: "excel", import_hash: hash,
      };
    },
    required: ["Material nomi"],
    boqColumn: "BOQ kodi",
  },
  {
    name: "2. Ishlar",
    table: "work_progress",
    headers: ["Sana (YYYY-MM-DD)", "BOQ kodi", "Ish turi", "Birlik", "Bajarilgan miqdor", "Birim narx", "Jami qiymat", "Brigada", "Izoh"],
    sample: [
      ["2026-05-09", "W-001", "Devor suvash", "m2", 250, 25000, 6250000, "Brigada-1", ""],
    ],
    map: (r: any, projectId: string) => {
      const date = r["Sana (YYYY-MM-DD)"] || new Date().toISOString().slice(0, 10);
      const code = String(r["BOQ kodi"] ?? "").trim() || null;
      const wt = String(r["Ish turi"] ?? "").trim();
      const unit = String(r["Birlik"] ?? "").trim() || null;
      const qty = Number(r["Bajarilgan miqdor"]) || 0;
      const price = Number(r["Birim narx"]) || 0;
      const total = Number(r["Jami qiymat"]) || qty * price;
      const brig = String(r["Brigada"] ?? "").trim() || null;
      const note = String(r["Izoh"] ?? "").trim() || null;
      const hash = String(r["import_hash"] ?? "").trim() ||
        rowHash(["work", date, code, wt, unit, qty, price, brig]);
      return {
        project_id: projectId, work_date: date, boq_code: code, work_type: wt,
        unit, qty_done: qty, unit_price: price, total_value: total,
        brigade_name: brig, source_note: note, source: "excel", import_hash: hash,
      };
    },
    required: ["Ish turi"],
    boqColumn: "BOQ kodi",
  },
  {
    name: "3. Xarajatlar",
    table: "expenses",
    headers: ["Sana (YYYY-MM-DD)", "BOQ kodi", "Kategoriya", "Tavsif", "Birlik", "Miqdor", "Birim narx", "Summa", "To'lovchi", "To'lov usuli", "Izoh"],
    sample: [
      ["2026-05-09", "X-001", "Texnika", "Yuk tashish", "kun", 1, 500000, 500000, "Akromjon", "Naqd", ""],
      ["2026-05-09", "", "Benzin", "Benzin AI-92", "litr", 50, 12000, 600000, "Direktor", "Plastik", ""],
    ],
    map: (r: any, projectId: string) => {
      const date = r["Sana (YYYY-MM-DD)"] || new Date().toISOString().slice(0, 10);
      const code = String(r["BOQ kodi"] ?? "").trim() || null;
      const cat = String(r["Kategoriya"] ?? "Boshqa").trim() || "Boshqa";
      const desc = String(r["Tavsif"] ?? "").trim() || null;
      const unit = String(r["Birlik"] ?? "").trim() || null;
      const qty = Number(r["Miqdor"]) || 0;
      const price = Number(r["Birim narx"]) || 0;
      const amount = Number(r["Summa"]) || qty * price;
      const paidBy = String(r["To'lovchi"] ?? "").trim() || null;
      const pm = String(r["To'lov usuli"] ?? "Naqd").trim() || "Naqd";
      const note = String(r["Izoh"] ?? "").trim() || null;
      const hash = String(r["import_hash"] ?? "").trim() ||
        rowHash(["exp", date, code, cat, desc, qty, price, amount, paidBy, pm]);
      return {
        project_id: projectId, expense_date: date, boq_code: code, category: cat,
        description: desc, unit, qty, unit_price: price, amount,
        paid_by: paidBy, payment_method: pm, source_note: note, source: "excel", import_hash: hash,
      };
    },
    required: ["Kategoriya"],
    boqColumn: "BOQ kodi",
  },
  {
    name: "4. Brigada to'lovlari",
    table: "brigade_payments",
    headers: ["Sana (YYYY-MM-DD)", "Brigada nomi", "Turi (avans/oylik/bonus)", "Summa", "Izoh"],
    sample: [
      ["2026-05-09", "Brigada-1", "avans", 2000000, ""],
    ],
    map: (r: any, projectId: string) => {
      const date = r["Sana (YYYY-MM-DD)"] || new Date().toISOString().slice(0, 10);
      const name = String(r["Brigada nomi"] ?? "").trim() || null;
      const kind = String(r["Turi (avans/oylik/bonus)"] ?? "avans").trim().toLowerCase();
      const amount = Number(r["Summa"]) || 0;
      const note = String(r["Izoh"] ?? "").trim() || null;
      const hash = String(r["import_hash"] ?? "").trim() ||
        rowHash(["bp", date, name, kind, amount]);
      return {
        project_id: projectId,
        brigade_id: "00000000-0000-0000-0000-000000000000",
        brigade_name: name, kind: kind as any, amount, payment_date: date,
        note, source: "excel", import_hash: hash,
      };
    },
    required: ["Brigada nomi", "Summa"],
  },
];

function downloadTemplate() {
  const wb = XLSX.utils.book_new();

  // Yo'riqnoma sahifasi
  const guideRows = [
    ["MASTER JADVAL — IMPORT SHABLONI"],
    [""],
    ["Har bir varaqni tegishli ma'lumotlar bilan to'ldiring."],
    ["Sana formati: YYYY-MM-DD (masalan 2026-05-09)"],
    ["Bo'sh qatorlarni qoldirmang. Faqat to'ldirilgan qatorlar import qilinadi."],
    [""],
    ["KATEGORIYALAR (xarajatlar uchun):"],
    ...KATEGORIYALAR.map((k) => [k]),
    [""],
    ["BIRLIKLAR ro'yxati:"],
    ...BIRLIKLAR.map((u) => [u]),
  ];
  const guide = XLSX.utils.aoa_to_sheet(guideRows);
  guide["!cols"] = [{ wch: 60 }];
  XLSX.utils.book_append_sheet(wb, guide, "Yo'riqnoma");

  for (const s of SHEETS) {
    const ws = XLSX.utils.aoa_to_sheet([s.headers, ...s.sample]);
    ws["!cols"] = s.headers.map((h) => ({ wch: Math.max(16, h.length + 2) }));
    XLSX.utils.book_append_sheet(wb, ws, s.name);
  }
  XLSX.writeFile(wb, "master-jadval-shablon.xlsx");
}

async function exportCurrentData(projectId: string | null) {
  const wb = XLSX.utils.book_new();
  const eq = (b: any) => (projectId ? b.eq("project_id", projectId) : b);

  const [mat, work, exp, bp] = await Promise.all([
    eq(supabase.from("material_receipts").select("*")),
    eq(supabase.from("work_progress").select("*")),
    eq(supabase.from("expenses").select("*")),
    eq(supabase.from("brigade_payments").select("*")),
  ]);

  const matRows = (mat.data ?? []).map((r: any) => ({
    "Sana (YYYY-MM-DD)": r.received_at, "BOQ kodi": r.boq_code, "Material nomi": r.material_name, "Birlik": r.unit,
    "Miqdor": r.qty, "Birim narx": r.unit_price,
    "Jami summa": r.total_price ?? Number(r.qty) * Number(r.unit_price),
    "Ta'minotchi": r.supplier_name, "Izoh": r.source_note,
    "import_hash": r.import_hash ?? "",
  }));
  const workRows = (work.data ?? []).map((r: any) => ({
    "Sana (YYYY-MM-DD)": r.work_date, "BOQ kodi": r.boq_code, "Ish turi": r.work_type, "Birlik": r.unit,
    "Bajarilgan miqdor": r.qty_done, "Birim narx": r.unit_price,
    "Jami qiymat": r.total_value ?? Number(r.qty_done) * Number(r.unit_price),
    "Brigada": r.brigade_name, "Izoh": r.source_note,
    "import_hash": r.import_hash ?? "",
  }));
  const expRows = (exp.data ?? []).map((r: any) => ({
    "Sana (YYYY-MM-DD)": r.expense_date, "BOQ kodi": r.boq_code, "Kategoriya": r.category, "Tavsif": r.description,
    "Birlik": r.unit, "Miqdor": r.qty, "Birim narx": r.unit_price, "Summa": r.amount,
    "To'lovchi": r.paid_by, "To'lov usuli": r.payment_method, "Izoh": r.source_note,
    "import_hash": r.import_hash ?? "",
  }));
  const bpRows = (bp.data ?? []).map((r: any) => ({
    "Sana (YYYY-MM-DD)": r.payment_date, "Brigada nomi": r.brigade_name,
    "Turi (avans/oylik/bonus)": r.kind, "Summa": r.amount, "Izoh": r.note,
    "import_hash": r.import_hash ?? "",
  }));

  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(matRows), "1. Materiallar");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(workRows), "2. Ishlar");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(expRows), "3. Xarajatlar");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(bpRows), "4. Brigada to'lovlari");
  XLSX.writeFile(wb, `master-jadval-eksport-${new Date().toISOString().slice(0, 10)}.xlsx`);
}

function printPaperTemplate() {
  const w = window.open("", "_blank");
  if (!w) { toast.error("Pop-up bloklangan"); return; }
  const blank = Array.from({ length: 18 }, (_, i) => i + 1);
  const tableHtml = (title: string, headers: string[]) => `
    <h2 style="margin:18px 0 6px;font-family:Arial,sans-serif;font-size:14px">${title}</h2>
    <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;font-size:11px">
      <thead><tr>${headers.map((h) => `<th style="border:1px solid #333;padding:6px;background:#eee;text-align:left">${h}</th>`).join("")}</tr></thead>
      <tbody>${blank.map(() => `<tr>${headers.map(() => `<td style="border:1px solid #999;padding:10px">&nbsp;</td>`).join("")}</tr>`).join("")}</tbody>
    </table>`;
  w.document.write(`<!doctype html><html><head><title>Master jadval — qo'lda to'ldirish shabloni</title>
    <style>@page{size:A4 landscape;margin:10mm} body{margin:0;padding:10mm;font-family:Arial,sans-serif} h1{font-size:16px;margin:0 0 8px}</style>
    </head><body>
    <h1>Master jadval — qo'lda to'ldirish shabloni</h1>
    <div style="font-size:11px;color:#444">Loyiha: ____________________________  Sana: ____________  Mas'ul: ____________________</div>
    ${SHEETS.map((s) => tableHtml(s.name, s.headers)).join("")}
    <script>window.onload = () => setTimeout(() => window.print(), 300);</script>
    </body></html>`);
  w.document.close();
}

export function MasterJadvalTemplatePanel({ projectId }: { projectId: string | null }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function handleImport(file: File) {
    if (!projectId) { toast.error("Avval loyiha tanlang"); return; }
    setBusy(true);
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      let total = 0;
      let skipped = 0;
      const errors: string[] = [];

      const { data: boqRows } = await supabase
        .from("boq_items")
        .select("id, code")
        .eq("project_id", projectId);
      const boqMap = new Map<string, string>(
        (boqRows ?? []).map((b: any) => [String(b.code).trim().toLowerCase(), b.id]),
      );

      for (const s of SHEETS) {
        const ws = wb.Sheets[s.name];
        if (!ws) continue;
        const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: "" });
        const valid = rows
          .filter((r) => s.required.every((k) => String(r[k] ?? "").trim()))
          .map((r) => s.map(r, projectId));
        if (!valid.length) continue;

        // BOQ kodini boq_item_id ga bog'lash
        if ((s as any).boqColumn) {
          for (const v of valid as any[]) {
            const code = String(v.boq_code ?? "").trim();
            if (!code) continue;
            const id = boqMap.get(code.toLowerCase());
            if (id) v.boq_item_id = id;
            else errors.push(`${s.name}: BOQ kodi topilmadi "${code}"`);
          }
        }

        if (s.table === "brigade_payments") {
          const names = Array.from(new Set(valid.map((v: any) => v.brigade_name).filter(Boolean) as string[]));
          const { data: brs } = await supabase.from("brigades").select("id, name").in("name", names);
          const map = new Map((brs ?? []).map((b) => [b.name, b.id]));
          for (const v of valid as any[]) {
            const bid = v.brigade_name ? map.get(v.brigade_name) : null;
            if (!bid) { errors.push(`Brigada topilmadi: ${v.brigade_name}`); continue; }
            v.brigade_id = bid;
          }
        }
        let inserts = (valid as any[]).filter((v: any) => v.brigade_id !== "00000000-0000-0000-0000-000000000000");
        if (!inserts.length) continue;

        // Dublikat himoyasi: mavjud import_hash larni o'tkazib yubor
        const hashes = inserts.map((v: any) => v.import_hash).filter(Boolean);
        if (hashes.length) {
          const { data: existing } = await supabase
            .from(s.table as any)
            .select("import_hash")
            .eq("project_id", projectId)
            .in("import_hash", hashes);
          const existSet = new Set((existing ?? []).map((e: any) => e.import_hash));
          const before = inserts.length;
          inserts = inserts.filter((v: any) => !existSet.has(v.import_hash));
          skipped += before - inserts.length;
        }
        if (!inserts.length) continue;

        const { error } = await supabase.from(s.table as any).insert(inserts as any);
        if (error) errors.push(`${s.name}: ${error.message}`);
        else total += inserts.length;
      }
      const desc = [
        skipped ? `${skipped} ta dublikat o'tkazildi` : null,
        ...errors,
      ].filter(Boolean).join("\n");
      if (errors.length) toast.warning(`${total} ta yangi yozuv qo'shildi`, { description: desc });
      else toast.success(`${total} ta yangi yozuv qo'shildi`, { description: desc || undefined });
    } catch (e: any) {
      toast.error("Import xatosi", { description: e?.message ?? String(e) });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <FileSpreadsheet className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Master jadval shablonlari</h3>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        Materiallar, ishlar, xarajatlar va brigada to'lovlari bitta shablon orqali Master jadvalga kiritiladi.
        Excel orqali yuklash, eksport qilish yoki qog'ozda qo'lda to'ldirish uchun chop etish mumkin.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Button variant="outline" onClick={downloadTemplate} className="justify-start">
          <Download className="mr-2 h-4 w-4" /> Excel shablonni yuklash
        </Button>
        <Button variant="outline" onClick={printPaperTemplate} className="justify-start">
          <Printer className="mr-2 h-4 w-4" /> Qog'ozli (qo'lda) shablonni chop etish
        </Button>
        <Button
          variant="outline"
          onClick={() => exportCurrentData(projectId)}
          className="justify-start"
        >
          <Download className="mr-2 h-4 w-4" /> Joriy ma'lumotlarni eksport qilish
        </Button>
        <label className={`inline-flex items-center justify-start gap-2 rounded-md border bg-card px-3 py-2 text-sm font-medium hover:bg-muted cursor-pointer ${busy || !projectId ? "opacity-50 pointer-events-none" : ""}`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Yuklanmoqda..." : "Excel shablonni import qilish"}
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            disabled={busy || !projectId}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImport(f); }}
          />
        </label>
      </div>

      {!projectId && (
        <p className="mt-3 text-xs text-warning-foreground">
          ⚠️ Import uchun yuqori o'ng burchakdan loyiha tanlang.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="font-medium mb-1">Kategoriyalar ({KATEGORIYALAR.length})</div>
          <div className="text-muted-foreground">{KATEGORIYALAR.join(", ")}</div>
        </div>
        <div className="rounded-md border border-border bg-muted/30 p-3">
          <div className="font-medium mb-1">Birliklar ({BIRLIKLAR.length})</div>
          <div className="text-muted-foreground">{BIRLIKLAR.join(", ")}</div>
        </div>
      </div>
    </div>
  );
}
