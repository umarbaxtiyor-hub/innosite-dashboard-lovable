import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as XLSX from "xlsx";
import { Download, Search, ArrowUp, ArrowDown, ArrowUpDown, Tag, Layers, CalendarDays, Trash2, Pencil, Save, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { EXPENSE_KIND_LABELS, kindForCategory, categoriesForKind, EXPENSE_KINDS, isMaterialMirrorExpense, type ExpenseKind } from "@/lib/boq-category-map";
import { useActiveProject } from "@/lib/project-context";
import { fmtUZS, fmtUZSc } from "@/lib/queries";
import { AddExpenseDialog } from "@/components/AddExpenseDialog";
import { JurnalExcelUploadDialog } from "@/components/JurnalExcelUploadDialog";
import { useCurrentRoles } from "@/hooks/use-current-roles";

export const Route = createFileRoute("/master-jadval")({
  head: () => ({
    meta: [
      { title: "Jurnal — QurilishNazorat" },
      { name: "description", content: "Barcha kirim, chiqim, material, ish va to'lovlar bitta jadvalda." },
    ],
  }),
  component: MasterJadvalPage,
});

function invalidateAll(qc: ReturnType<typeof useQueryClient>) {
  const keys = [
    "master-jadval", "project-kpis-v3", "dashboard-real-spend", "dashboard-plan-vs-fact",
    "dashboard-daily-spend", "weekly-activity", "weekly-expense-trend", "red-flags",
    "global-finance", "exec-overview", "brigade-top-balances", "boq", "boq_items", "smeta",
    "material_receipts", "work_progress", "project_zayavka", "expenses", "incomes",
    "brigade_payments", "materials", "work", "variations",
  ];
  for (const k of keys) qc.invalidateQueries({ queryKey: [k] });
}

type Row = {
  id: string;
  date: string;
  category: string;
  kind: string;
  name: string;
  unit: string | null;
  qty: number | null;
  unit_price: number | null;
  total: number;
  in_amount: number;
  out_amount: number;
  payment_method?: string | null;
  who: string | null;
  project: string | null;
  source: string;
  source_label: string;
  note: string | null;
  zayavka_id?: string | null;
  zayavka_no?: number | null;
  zayavka_name?: string | null;
  zayavka_status?: string | null;
  raw: any;
};

const STATUS_LABELS: Record<string, { label: string; cls: string }> = {
  draft:        { label: "Qoralama",     cls: "bg-muted text-foreground" },
  submitted:    { label: "Yuborilgan",   cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  pm_approved:  { label: "PM tasdiq",    cls: "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300" },
  ceo_approved: { label: "CEO tasdiq",   cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  ordered:      { label: "Buyurtma",     cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  contracted:   { label: "Shartnoma",    cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  delivered:    { label: "Yetkazildi",   cls: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
  received:     { label: "Qabul",        cls: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
  waiting_ceo:  { label: "CEO kutmoqda", cls: "bg-violet-500/15 text-violet-700 dark:text-violet-300" },
  pending_pm:   { label: "PM kutmoqda",  cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  invoiced:     { label: "Faktura",      cls: "bg-cyan-500/15 text-cyan-700 dark:text-cyan-300" },
  paid:         { label: "To'landi",     cls: "bg-success/15 text-success" },
  done:         { label: "Bajarildi",    cls: "bg-success/15 text-success" },
  rejected:     { label: "Rad etilgan",  cls: "bg-destructive/15 text-destructive" },
};
function StatusBadge({ s }: { s?: string | null }) {
  if (!s) return <span className="text-muted-foreground text-xs">—</span>;
  const v = STATUS_LABELS[s] ?? { label: s, cls: "bg-muted text-foreground" };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ${v.cls}`}>{v.label}</span>;
}

const SOURCE_LABELS: Record<string, string> = {
  telegram_text: "💬 Telegram matn",
  telegram_voice: "🎤 Telegram ovoz",
  telegram_photo: "🖼 Telegram rasm",
  telegram_webapp: "📱 Telegram WebApp",
  web: "🖥 Web (qo'lda)",
  excel: "📊 Excel import",
};
function srcLabel(s?: string | null, hasTg?: boolean) {
  if (s && SOURCE_LABELS[s]) return SOURCE_LABELS[s];
  if (s) return s;
  return hasTg ? "📨 Telegram" : "🖥 Web";
}

const UZ_MONTHS = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];

async function fetchAllRows<T>(buildQuery: (from: number, to: number) => any, pageSize = 1000): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await buildQuery(from, to);
    if (error) throw error;
    const rows = (data ?? []) as T[];
    all.push(...rows);
    if (rows.length < pageSize) break;
  }
  return all;
}

function fmtUz(d?: string | null) {
  if (!d) return "—";
  const s = d.slice(0, 10);
  const [y, m, day] = s.split("-");
  if (!y || !m || !day) return s;
  return `${day}.${m}`;
}
function fmtUzDateTime(date?: string | null, ts?: string | null) {
  const datePart = fmtUz(date);
  if (!ts) return datePart;
  try {
    const d = new Date(ts);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${datePart} ${hh}:${mm}`;
  } catch { return datePart; }
}

function MasterJadvalPage() {
  const { activeProjectId, activeProject, projects } = useActiveProject() as any;
  const { hasAny } = useCurrentRoles();
  const canEdit = hasAny(["admin", "finans"]);
  const showAmount = hasAny(["admin", "finans", "ceo"]);
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  
  const [cat, setCat] = useState<string>("all");
  const [month, setMonth] = useState<string>("all");
  const [day, setDay] = useState<string>("");
  const [kind, setKind] = useState<string>("all");
  const [sortKey, setSortKey] = useState<"date" | "category" | "name" | "total">("date");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [openRow, setOpenRow] = useState<Row | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  // Auto-fit rows per page based on available viewport height
  useEffect(() => {
    const ROW_H = 28; // compact row height in px
    const calc = () => {
      const el = tableWrapRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      const bottomReserve = 96; // pagination + nav
      const available = window.innerHeight - top - bottomReserve;
      const n = Math.max(6, Math.floor(available / ROW_H));
      setPageSize(n);
    };
    calc();
    window.addEventListener("resize", calc);
    return () => window.removeEventListener("resize", calc);
  }, []);



  // Live: invalidate jurnal query when any source table changes (incl. plan status)
  useEffect(() => {
    const invalidate = () => invalidateAll(qc);
    const ch = supabase
      .channel("master-jadval-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "project_zayavka" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "material_receipts" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "work_progress" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "expenses" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "incomes" }, invalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "brigade_payments" }, invalidate)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  function toggleSort(key: "date" | "category" | "name" | "total") {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir(key === "date" || key === "total" ? "desc" : "asc"); }
  }
  

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["master-jadval", activeProjectId ?? "all"],
    queryFn: async (): Promise<Row[]> => {
      const { data: allProjects } = await supabase.from("projects").select("id,name");
      const projectsMap = new Map<string, string>(
        (allProjects ?? []).map((p: any) => [p.id, p.name]),
      );
      const projFilter = activeProjectId ? activeProjectId : null;
      const [mat, work, exp, bp, inc] = await Promise.all([
        fetchAllRows<any>((from, to) => {
          const q = supabase.from("material_receipts").select("*");
          return (projFilter ? q.eq("project_id", projFilter) : q).range(from, to);
        }),
        fetchAllRows<any>((from, to) => {
          const q = supabase.from("work_progress").select("*");
          return (projFilter ? q.eq("project_id", projFilter) : q).range(from, to);
        }),
        fetchAllRows<any>((from, to) => {
          const q = supabase.from("expenses").select("*");
          return (projFilter ? q.eq("project_id", projFilter) : q).range(from, to);
        }),
        fetchAllRows<any>((from, to) => {
          const q = supabase.from("brigade_payments").select("*");
          return (projFilter ? q.eq("project_id", projFilter) : q).range(from, to);
        }),
        fetchAllRows<any>((from, to) => {
          const q = supabase.from("incomes").select("*");
          return (projFilter ? q.eq("project_id", projFilter) : q).range(from, to);
        }),
      ]);

      // Collect referenced zayavka ids and fetch in one query
      const zIds = new Set<string>();
      for (const arr of [mat, work, exp]) {
        for (const r of arr as any[]) if (r.zayavka_id) zIds.add(r.zayavka_id);
      }
      const zMap = new Map<string, { no: number | null; name: string; status: string | null }>();
      if (zIds.size) {
        const { data: zs } = await supabase
          .from("project_zayavka")
          .select("id, zayavka_no, name, workflow_status")
          .in("id", Array.from(zIds));
        for (const z of (zs ?? []) as any[]) {
          zMap.set(z.id, { no: z.zayavka_no ?? null, name: z.name, status: z.workflow_status ?? null });
        }
      }
      const attachZ = (zid?: string | null) => {
        if (!zid) return {};
        const z = zMap.get(zid);
        if (!z) return { zayavka_id: zid };
        return { zayavka_id: zid, zayavka_no: z.no, zayavka_name: z.name, zayavka_status: z.status };
      };

      // Collect user identifiers for "Kim" lookup (telegram_user_id / created_by)
      const tgIds = new Set<number>();
      const uids = new Set<string>();
      for (const arr of [mat, work, exp, bp, inc]) {
        for (const r of arr as any[]) {
          if (r.telegram_user_id) tgIds.add(Number(r.telegram_user_id));
          if (r.created_by) uids.add(r.created_by);
        }
      }
      const tgMap = new Map<number, string>();
      const uidMap = new Map<string, string>();
      if (tgIds.size || uids.size) {
        let pq = supabase.from("profiles").select("id, full_name, telegram_username, telegram_user_id");
        if (tgIds.size && uids.size) {
          pq = pq.or(`telegram_user_id.in.(${Array.from(tgIds).join(",")}),id.in.(${Array.from(uids).join(",")})`);
        } else if (tgIds.size) {
          pq = pq.in("telegram_user_id", Array.from(tgIds));
        } else {
          pq = pq.in("id", Array.from(uids));
        }
        const { data: profs } = await pq;
        for (const p of (profs ?? []) as any[]) {
          const name = p.full_name || (p.telegram_username ? `@${p.telegram_username}` : null);
          if (p.telegram_user_id && name) tgMap.set(Number(p.telegram_user_id), name);
          if (p.id && name) uidMap.set(p.id, name);
        }
      }
      const resolveWho = (r: any, fallback: string | null | undefined) => {
        if (fallback) return fallback;
        if (r.telegram_user_id && tgMap.has(Number(r.telegram_user_id))) return tgMap.get(Number(r.telegram_user_id))!;
        if (r.created_by && uidMap.has(r.created_by)) return uidMap.get(r.created_by)!;
        if (r.telegram_user_id) return `TG: ${r.telegram_user_id}`;
        return null;
      };

      const out: Row[] = [];

      for (const r of mat as any[]) {
        const total = Number(r.total_price) || (Number(r.qty) * Number(r.unit_price)) || 0;
        const src = r.source ?? (r.telegram_user_id ? "telegram_text" : "web");
        out.push({
          id: `mat:${r.id}`,
          date: r.received_at, category: "Material (BOQ)", kind: "material",
          name: r.material_name, unit: r.unit, qty: Number(r.qty) || 0,
          unit_price: Number(r.unit_price) || 0, total,
          in_amount: 0, out_amount: total,
          who: resolveWho(r, r.supplier_name), project: projectsMap.get(r.project_id) ?? null,
          source: src, source_label: srcLabel(src, !!r.telegram_user_id),
          note: r.source_note ?? (r.supplier_name ? `Ta'minotchi: ${r.supplier_name}` : null),
          ...attachZ(r.zayavka_id),
          raw: r,
        });
      }
      for (const r of work as any[]) {
        const total = Number(r.total_value) || (Number(r.qty_done) * Number(r.unit_price)) || 0;
        const src = r.source ?? (r.telegram_user_id ? "telegram_text" : "web");
        out.push({
          id: `work:${r.id}`,
          date: r.work_date, category: "Ish (BOQ)", kind: "ish",
          name: r.work_type, unit: r.unit, qty: Number(r.qty_done) || 0,
          unit_price: Number(r.unit_price) || 0, total,
          in_amount: 0, out_amount: 0,
          who: resolveWho(r, r.brigade_name), project: projectsMap.get(r.project_id) ?? null,
          source: src, source_label: srcLabel(src, !!r.telegram_user_id),
          note: r.source_note ?? (r.brigade_name ? `Brigada: ${r.brigade_name}` : null),
          ...attachZ(r.zayavka_id),
          raw: r,
        });
      }
      for (const r of exp as any[]) {
        const total = Number(r.amount) || 0;
        const src = r.source ?? (r.telegram_user_id ? "telegram_text" : "web");
        const isMirrored = isMaterialMirrorExpense(r);
        const expKind = (r.kind as string) || kindForCategory(r.category);
        const kindLabel = (EXPENSE_KIND_LABELS as Record<string, string>)[expKind] ?? "Operatsion";
        out.push({
          id: `exp:${r.id}`,
          date: r.expense_date, category: r.category || "Xarajat", kind: kindLabel,
          name: r.description || r.category || "Xarajat",
          unit: r.unit, qty: Number(r.qty) || null,
          unit_price: Number(r.unit_price) || null, total,
          // BOQ yozuvi material/ish jadvalida ham mavjud bo'ladi; ikki marta sanamaymiz.
          in_amount: 0, out_amount: isMirrored ? 0 : total,
          who: resolveWho(r, r.paid_by), project: projectsMap.get(r.project_id) ?? null,
          source: src, source_label: srcLabel(src, !!r.telegram_user_id),
          note: r.source_note ?? r.description,
          ...attachZ(r.zayavka_id),
          raw: r,
        });
      }
      for (const r of bp as any[]) {
        const total = Number(r.amount) || 0;
        const src = r.source ?? (r.telegram_user_id ? "telegram_text" : "web");
        out.push({
          id: `bp:${r.id}`,
          date: r.payment_date, category: "Xodimlar", kind: "tolov",
          name: `${r.kind ?? "to'lov"}${r.brigade_name ? " — " + r.brigade_name : ""}`,
          unit: null, qty: null, unit_price: null, total,
          in_amount: 0, out_amount: total,
          who: resolveWho(r, r.brigade_name), project: projectsMap.get(r.project_id) ?? null,
          source: src, source_label: srcLabel(src, !!r.telegram_user_id),
          note: r.note ?? r.source_note,
          raw: r,
        });
      }

      for (const r of inc as any[]) {
        const total = Number(r.amount) || 0;
        const src = r.source ?? (r.telegram_user_id ? "telegram_text" : "web");
        const cat = `Kirim (${r.payment_method ?? "Naqd"})`;
        out.push({
          id: `inc:${r.id}`,
          date: r.income_date, category: cat, kind: "kirim",
          name: r.description || r.category || "Kirim",
          unit: null, qty: null, unit_price: null, total,
          in_amount: total, out_amount: 0,
          payment_method: r.payment_method ?? "Naqd",
          who: resolveWho(r, r.payer), project: projectsMap.get(r.project_id) ?? null,
          source: src, source_label: srcLabel(src, !!r.telegram_user_id),
          note: r.source_note ?? r.description,
          raw: r,
        });
      }

      const ts = (r: Row) => {
        const c = r.raw?.created_at ? new Date(r.raw.created_at).getTime() : 0;
        return c || (r.date ? new Date(r.date).getTime() : 0);
      };
      out.sort((a, b) => {
        if (a.date !== b.date) return a.date < b.date ? 1 : -1;
        return ts(b) - ts(a);
      });
      return out;
    },
    enabled: !!projects,
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (kind !== "all") {
        if (kind === "kirim") {
          if (r.kind !== "kirim") return false;
        } else {
          const rk = (r.raw?.kind as string) || kindForCategory(r.category);
          if ((EXPENSE_KIND_LABELS as Record<string, string>)[rk] !== kind && rk !== kind) return false;
        }
      }
      if (cat !== "all" && r.category !== cat) return false;
      if (day) {
        if (r.date?.slice(0, 10) !== day) return false;
      } else if (month !== "all") {
        const m = r.date?.slice(5, 7);
        if (m !== month) return false;
      }
      if (!ql) return true;
      return (
        (r.name ?? "").toLowerCase().includes(ql) ||
        (r.who ?? "").toLowerCase().includes(ql) ||
        (r.note ?? "").toLowerCase().includes(ql) ||
        (r.category ?? "").toLowerCase().includes(ql) ||
        (r.kind ?? "").toLowerCase().includes(ql)
      );
    });
  }, [rows, q, cat, kind, month, day]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sortDir === "asc" ? 1 : -1;
    const tsOf = (r: Row) => {
      const c = r.raw?.created_at ? new Date(r.raw.created_at).getTime() : 0;
      return c || (r.date ? new Date(r.date).getTime() : 0);
    };
    arr.sort((a, b) => {
      let av: any, bv: any;
      if (sortKey === "date") { av = a.date ?? ""; bv = b.date ?? ""; }
      else if (sortKey === "total") { av = a.total ?? 0; bv = b.total ?? 0; }
      else if (sortKey === "category") { av = (a.category ?? "").toLowerCase(); bv = (b.category ?? "").toLowerCase(); }
      else { av = (a.name ?? "").toLowerCase(); bv = (b.name ?? "").toLowerCase(); }
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      // tie-break: newest created_at first (regardless of sortDir)
      return tsOf(b) - tsOf(a);
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  useEffect(() => { setPage(0); }, [q, cat, kind, month, day, sortKey, sortDir, pageSize]);
  const paged = useMemo(
    () => sorted.slice(safePage * pageSize, safePage * pageSize + pageSize),
    [sorted, safePage, pageSize],
  );


  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => {
        // Shartnoma kirimi balansga kirmaydi (kassaga ta'sir qilmaydi)
        const incomeCategory = String(r.raw?.category ?? "").toLowerCase();
        const isContract = r.kind === "kirim" && (incomeCategory.includes("shartnoma") || incomeCategory.includes("kontrak"));
        return {
          kirim: a.kirim + (isContract ? 0 : r.in_amount),
          chiqim: a.chiqim + r.out_amount,
          count: a.count + 1,
        };
      },
      { kirim: 0, chiqim: 0, count: 0 },
    );
  }, [rows]);

  const incomesAll = useMemo(() => filtered.filter((r) => r.kind === "kirim"), [filtered]);

  const { data: dbCategories = [] } = useQuery({
    queryKey: ["expense_categories_list"],
    queryFn: async () => {
      const { data } = await supabase.from("expense_categories").select("name").order("name");
      return (data ?? []).map((r: any) => r.name as string);
    },
    staleTime: 60_000,
  });
  const categories = useMemo(() => {
    const present = new Set(rows.map((r) => r.category).filter(Boolean));
    const merged = new Set<string>();
    dbCategories.forEach((c) => merged.add(String(c)));
    present.forEach((c) => merged.add(String(c)));
    return Array.from(merged)
      .filter((c) => String(c).trim().length > 0)
      .filter((c) => !/\(boq\)/i.test(String(c)))
      .sort((a, b) => a.localeCompare(b, "uz"));
  }, [rows, dbCategories]);


  function exportExcel() {
    const moneyFmt = '#,##0;(#,##0);"-"';
    const buildSheet = (rs: Row[]) => {
      const data = rs.map((r) => {
        const d = r.date ? new Date(r.date) : null;
        return {
          Sana: r.date,
          Oy: d ? UZ_MONTHS[d.getMonth()] : "",
          Yil: d ? d.getFullYear() : "",
          Kategoriya: r.category,
          Turi: r.kind,
          Nomi: r.name,
          Miqdor: r.qty ?? null,
          Birlik: r.unit ?? "",
          Narx: r.unit_price ?? null,
          Umumiy_summa: r.total || null,
          Kirim: r.in_amount || null,
          Chiqim: r.out_amount || null,
          "To'lov": r.payment_method ?? "",
          Kim: r.who ?? "",
          Loyiha: r.project ?? "",
          Manba: r.source_label,
          Izoh: r.note ?? "",
        };
      });
      const ws = XLSX.utils.json_to_sheet(data);
      // column widths
      ws["!cols"] = [
        { wch: 11 }, { wch: 10 }, { wch: 6 }, { wch: 16 }, { wch: 10 },
        { wch: 28 }, { wch: 8 }, { wch: 8 }, { wch: 12 }, { wch: 14 },
        { wch: 14 }, { wch: 14 }, { wch: 9 }, { wch: 18 }, { wch: 18 },
        { wch: 16 }, { wch: 30 },
      ];
      // money formatting on Narx, Umumiy_summa, Kirim, Chiqim (cols I,J,K,L → 9,10,11,12)
      const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
      for (let R = 1; R <= range.e.r; R++) {
        for (const C of [8, 9, 10, 11]) {
          const addr = XLSX.utils.encode_cell({ r: R, c: C });
          const cell = ws[addr];
          if (cell && typeof cell.v === "number") cell.z = moneyFmt;
        }
      }
      return ws;
    };

    // Summary sheet (Kirim/Chiqim/Balans)
    const summary = [
      { Kategoriya: "Kirim (Naqd)", Summa: incomesAll.filter(r => r.payment_method !== "Bank").reduce((s, r) => s + r.in_amount, 0) },
      { Kategoriya: "Kirim (Bank)", Summa: incomesAll.filter(r => r.payment_method === "Bank").reduce((s, r) => s + r.in_amount, 0) },
      { Kategoriya: "Jami Kirim", Summa: totals.kirim },
      { Kategoriya: "Jami Chiqim", Summa: totals.chiqim },
      { Kategoriya: "Foyda / Zarar (P/L)", Summa: totals.kirim - totals.chiqim },
    ];
    const wsSum = XLSX.utils.json_to_sheet(summary);
    wsSum["!cols"] = [{ wch: 24 }, { wch: 18 }];
    for (let R = 1; R <= summary.length; R++) {
      const cell = wsSum[XLSX.utils.encode_cell({ r: R, c: 1 })];
      if (cell) cell.z = moneyFmt;
    }

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, wsSum, "Xulosa");
    XLSX.utils.book_append_sheet(wb, buildSheet(filtered), "Hammasi");
    XLSX.utils.book_append_sheet(wb, buildSheet(incomesAll), "Kirimlar");
    XLSX.writeFile(wb, `jurnal-${new Date().toISOString().slice(0, 10)}.xlsx`);
  }

  async function deleteAllFiltered() {
    if (!filtered.length) return;
    const tableFor = (id: string): string | null => {
      const p = id.split(":")[0];
      return ({ mat: "material_receipts", work: "work_progress", exp: "expenses", bp: "brigade_payments", inc: "incomes" } as Record<string, string>)[p] ?? null;
    };
    const grouped = new Map<string, string[]>();
    for (const r of filtered) {
      const t = tableFor(r.id);
      const raw = r.id.split(":")[1];
      if (!t || !raw) continue;
      if (!grouped.has(t)) grouped.set(t, []);
      grouped.get(t)!.push(raw);
    }
    const total = Array.from(grouped.values()).reduce((s, a) => s + a.length, 0);
    if (!total) return;
    const msg = `DIQQAT! ${total} ta yozuv butunlay o'chiriladi. Davom etilsinmi?`;
    if (!window.confirm(msg)) return;
    if (!window.confirm("Rostdan ham o'chirmoqchimisiz? Bu amalni qaytarib bo'lmaydi.")) return;
    const t = toast.loading(`O'chirilmoqda... (0/${total})`);
    let done = 0;
    let failed = 0;
    for (const [table, ids] of grouped) {
      const chunkSize = 100;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const { error } = await supabase.from(table as any).delete().in("id", chunk);
        if (error) failed += chunk.length;
        else done += chunk.length;
        toast.loading(`O'chirilmoqda... (${done}/${total})`, { id: t });
      }
    }
    if (failed) toast.error(`${done} ta o'chirildi, ${failed} ta xato`, { id: t });
    else toast.success(`${done} ta yozuv o'chirildi`, { id: t });
    invalidateAll(qc);
  }

  if (!activeProjectId) {
    return (
      <div className="space-y-3 p-3 sm:p-4">
        <PageHeader title="Jurnal" subtitle="Loyiha tanlang" />
        null
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <PageHeader
        title="Jurnal"
        subtitle={activeProject ? `${activeProject.name} — barcha hisobotlar` : "Hamma loyihalar"}
        actions={
          <div className="flex flex-wrap gap-1.5">
            {canEdit && <AddExpenseDialog projectId={activeProjectId ?? null} />}
            {canEdit && <JurnalExcelUploadDialog projectId={activeProjectId ?? null} />}
            {showAmount && (
              <Button variant="outline" size="sm" onClick={exportExcel} disabled={!filtered.length}>
                <Download className="mr-1 h-3.5 w-3.5" /> Excel
              </Button>
            )}
            {canEdit && (
              <Button variant="destructive" size="sm" onClick={deleteAllFiltered} disabled={!filtered.length}>
                <Trash2 className="mr-1 h-3.5 w-3.5" /> Hammasini o'chirish
              </Button>
            )}
          </div>
        }
      />


      {showAmount && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-card p-2.5 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">💰 Kirim</div>
            <div className="mt-0.5 text-base sm:text-xl font-extrabold text-success tabular-nums">{fmtUZSc(totals.kirim)}</div>
          </div>
          <div className="rounded-2xl bg-card p-2.5 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">💸 Chiqim</div>
            <div className="mt-0.5 text-base sm:text-xl font-extrabold text-destructive tabular-nums">{fmtUZSc(totals.chiqim)}</div>
          </div>
          <div className="rounded-2xl bg-card p-2.5 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">⚖️ Balans</div>
            <div className={`mt-0.5 text-base sm:text-xl font-extrabold tabular-nums ${totals.kirim - totals.chiqim >= 0 ? "text-success" : "text-destructive"}`}>
              {fmtUZSc(totals.kirim - totals.chiqim)}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex w-full min-w-0 flex-row items-center gap-1.5">
          <div className="relative min-w-0 flex-1 basis-0">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Qidirish..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 w-full rounded-xl border-0 bg-muted/50 pl-8 text-sm shadow-sm focus-visible:ring-1"
            />
          </div>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger className="h-9 w-[104px] shrink-0 justify-start overflow-hidden rounded-xl border-0 bg-muted/50 pl-2 pr-2 text-xs shadow-sm [&>svg:last-child]:hidden gap-1.5 [&>span]:truncate sm:w-[132px]">
              <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Kategoriya" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Kategoriya</SelectItem>
              {categories.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={kind} onValueChange={setKind}>
            <SelectTrigger className="h-9 w-[104px] shrink-0 justify-start overflow-hidden rounded-xl border-0 bg-muted/50 pl-2 pr-2 text-xs shadow-sm [&>svg:last-child]:hidden gap-1.5 [&>span]:truncate sm:w-[128px]">
              <Layers className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Turi" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha tur</SelectItem>
              <SelectItem value="kirim">Kirim</SelectItem>
              {EXPENSE_KINDS.map((k) => (<SelectItem key={k} value={(EXPENSE_KIND_LABELS as Record<string, string>)[k]}>{EXPENSE_KIND_LABELS[k]}</SelectItem>))}
            </SelectContent>
          </Select>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="h-9 w-[88px] shrink-0 justify-start overflow-hidden rounded-xl border-0 bg-muted/50 pl-2 pr-2 text-xs shadow-sm [&>svg:last-child]:hidden gap-1.5 [&>span]:truncate sm:w-[112px]">

              <CalendarDays className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <SelectValue placeholder="Oy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Oylar</SelectItem>
              {UZ_MONTHS.map((m, i) => (<SelectItem key={m} value={String(i + 1).padStart(2, "0")}>{m}</SelectItem>))}
            </SelectContent>
          </Select>
        </div>


        <div ref={tableWrapRef} className="overflow-hidden rounded-2xl bg-card shadow-sm">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <TableRow className="border-0 hover:bg-transparent">
                <SortHead label="Sana" k="date" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="h-8 whitespace-nowrap text-[10px] uppercase tracking-wide text-muted-foreground" />
                <SortHead label="Nomi" k="name" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="h-8 text-[10px] uppercase tracking-wide text-muted-foreground" />
                {showAmount && <SortHead label="Summa" k="total" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} className="h-8 text-right text-[10px] uppercase tracking-wide text-muted-foreground" align="right" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (<TableRow className="border-0"><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">Yuklanmoqda...</TableCell></TableRow>)}
              {!isLoading && sorted.length === 0 && (<TableRow className="border-0"><TableCell colSpan={3} className="py-8 text-center text-muted-foreground">Yozuvlar topilmadi</TableCell></TableRow>)}
              {paged.map((r) => {
                const sub = [
                  r.qty != null && r.qty > 0 ? `${r.qty}${r.unit ? " " + r.unit : ""}` : null,
                  showAmount && r.unit_price ? `${fmtUZSc(r.unit_price)}/${r.unit || "dona"}` : null,
                  r.category,
                ].filter(Boolean).join(" • ");
                return (
                  <RevealRow key={r.id} onClick={() => setOpenRow(r)}>
                    <TableCell className="whitespace-nowrap py-2 text-[11px] text-muted-foreground align-top border-0">{fmtUz(r.date)}</TableCell>
                    <TableCell className="min-w-0 max-w-0 py-2 align-top border-0">
                      <div className="truncate text-[12px] font-medium leading-tight" title={r.name}>{r.name}</div>
                      {sub && <div className="mt-0.5 truncate text-[10px] text-muted-foreground leading-tight">{sub}</div>}
                    </TableCell>

                    {showAmount && (
                      <TableCell className={`py-2 text-right text-[12px] font-semibold tabular-nums align-top border-0 ${r.in_amount ? "text-success" : ""}`}>
                        {fmtUZSc(r.total)}
                      </TableCell>
                    )}
                  </RevealRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        {sorted.length > pageSize && (
          <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-muted-foreground">
            <span>
              {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} / {sorted.length}
            </span>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-[11px]" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>‹ Oldingi</Button>
              <span className="px-1 tabular-nums">{safePage + 1} / {totalPages}</span>
              <Button variant="ghost" size="sm" className="h-7 rounded-lg px-2 text-[11px]" disabled={safePage >= totalPages - 1} onClick={() => setPage(safePage + 1)}>Keyingi ›</Button>
            </div>
          </div>
        )}
      </div>




      <RowDetailDialog
        row={openRow}
        onClose={() => setOpenRow(null)}
        showAmount={showAmount}
        canEdit={canEdit}
        onChanged={() => {
          setOpenRow(null);
          invalidateAll(qc);
        }}
      />
    </div>
  );
}

function SortHead({
  label, k, sortKey, sortDir, onClick, className, align,
}: {
  label: string;
  k: "date" | "category" | "name" | "total";
  sortKey: string;
  sortDir: "asc" | "desc";
  onClick: (k: "date" | "category" | "name" | "total") => void;
  className?: string;
  align?: "right";
}) {
  const active = sortKey === k;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => onClick(k)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${active ? "text-foreground font-medium" : ""} ${align === "right" ? "ml-auto" : ""}`}
      >
        {label}
        <Icon className="h-3 w-3 opacity-70" />
      </button>
    </TableHead>
  );
}

function RowDetailDialog({ row, onClose, showAmount = true, canEdit = false, onChanged }: { row: Row | null; onClose: () => void; showAmount?: boolean; canEdit?: boolean; onChanged?: () => void }) {
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editCategory, setEditCategory] = useState<string>("");
  const [editKind, setEditKind] = useState<ExpenseKind>("operatsion");
  const [editDesc, setEditDesc] = useState<string>("");
  const [editQty, setEditQty] = useState<string>("");
  const [editAmount, setEditAmount] = useState<string>("");

  const { data: rawCategories = [] } = useQuery({
    queryKey: ["expense_categories_list_names"],
    queryFn: async () => {
      const { data } = await supabase.from("expense_categories").select("name").order("name");
      return (data ?? []).map((r: any) => r.name as string);
    },
    staleTime: 60_000,
  });
  const categories = useMemo(
    () => rawCategories.filter((c) => String(c).trim().length > 0),
    [rawCategories],
  );

  const tableFor = (id: string): string | null => {
    const p = id.split(":")[0];
    return ({ mat: "material_receipts", work: "work_progress", exp: "expenses", bp: "brigade_payments", inc: "incomes" } as Record<string, string>)[p] ?? null;
  };

  useEffect(() => {
    if (!row) { setEditing(false); return; }
    setEditCategory(row.category ?? "");
    setEditKind((row.raw?.kind as ExpenseKind) || kindForCategory(row.category));
    setEditDesc(row.name ?? "");
    setEditQty(row.qty != null ? String(row.qty) : "");
    setEditAmount(String(row.total ?? 0));
  }, [row?.id]);

  const isExpense = row?.id.startsWith("exp:");
  const isIncome = row?.id.startsWith("inc:");
  const incomeCategories = ["Naqd", "Bank", "Shartnoma"];

  async function handleDelete() {
    if (!row) return;
    const table = tableFor(row.id);
    const rawId = row.id.split(":")[1];
    if (!table || !rawId) { toast.error("O'chirib bo'lmadi"); return; }
    if (!window.confirm("Ushbu yozuv o'chirilsinmi?")) return;
    setDeleting(true);
    const { error } = await supabase.from(table as any).delete().eq("id", rawId);
    setDeleting(false);
    if (error) { toast.error("Xatolik: " + error.message); return; }
    toast.success("O'chirildi");
    onChanged?.();
  }

  async function handleSave() {
    if (!row) return;
    const table = tableFor(row.id);
    const rawId = row.id.split(":")[1];
    if (!table || !rawId) { toast.error("Saqlab bo'lmadi"); return; }
    const patch: Record<string, any> = {};
    const qty = editQty ? Number(editQty) : null;
    const amt = editAmount ? Number(editAmount) : null;
    if (table === "expenses") {
      patch.category = editCategory || row.category;
      patch.kind = editKind || kindForCategory(patch.category);
      patch.description = editDesc;
      if (qty != null && !Number.isNaN(qty)) patch.qty = qty;
      if (amt != null && !Number.isNaN(amt)) patch.amount = amt;
    } else if (table === "material_receipts") {
      patch.material_name = editDesc;
      if (qty != null && !Number.isNaN(qty)) patch.qty = qty;
      if (amt != null && !Number.isNaN(amt)) patch.total_price = amt;
    } else if (table === "work_progress") {
      patch.work_type = editDesc;
      if (qty != null && !Number.isNaN(qty)) patch.qty_done = qty;
      if (amt != null && !Number.isNaN(amt)) patch.total_value = amt;
    } else if (table === "brigade_payments") {
      patch.note = editDesc;
      if (amt != null && !Number.isNaN(amt)) patch.amount = amt;
    } else if (table === "incomes") {
      patch.description = editDesc;
      if (editCategory) patch.category = editCategory;
      if (amt != null && !Number.isNaN(amt)) patch.amount = amt;
    }
    setSaving(true);
    const { error } = await supabase.from(table as any).update(patch).eq("id", rawId);
    setSaving(false);
    if (error) { toast.error("Xatolik: " + error.message); return; }
    toast.success("Saqlandi");
    setEditing(false);
    onChanged?.();
  }

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-auto">
        <DialogHeader>
          <DialogTitle className="text-base">
            {row?.category} — {row?.name}
          </DialogTitle>
        </DialogHeader>
        {row && (
          <div className="space-y-4 text-sm">
            {editing ? (
              <div className="space-y-3">
                {(isExpense || isIncome) && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Kategoriya</div>
                    <Select value={editCategory} onValueChange={setEditCategory}>
                      <SelectTrigger><SelectValue placeholder="Kategoriya tanlang" /></SelectTrigger>
                      <SelectContent>
                        {(isIncome ? incomeCategories : categoriesForKind(editKind, categories)).map((c) => (
                          <SelectItem key={c} value={c}>{c}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                {isExpense && (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Tur</div>
                    <Select value={editKind} onValueChange={(v) => {
                      const k = v as ExpenseKind;
                      setEditKind(k);
                      setEditCategory((cur) => categoriesForKind(k, categories).includes(cur) ? cur : (categoriesForKind(k, categories)[0] ?? cur));
                    }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {EXPENSE_KINDS.map((k) => <SelectItem key={k} value={k}>{EXPENSE_KIND_LABELS[k]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div>
                  <div className="text-xs text-muted-foreground mb-1">Tavsif / Nomi</div>
                  <Input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Miqdor</div>
                    <Input type="number" step="0.01" value={editQty} onChange={(e) => setEditQty(e.target.value)} />
                  </div>
                  {showAmount && (
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">Jami summa</div>
                      <Input type="number" step="1" value={editAmount} onChange={(e) => setEditAmount(e.target.value)} />
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                <Field label="Sana" value={fmtUzDateTime(row.date, row.raw?.created_at)} />
                <Field label="Kategoriya" value={row.category} />
                <Field label="Turi" value={row.kind} />
                <Field label="Loyiha" value={row.project ?? "Tanlanmagan"} />
                <Field label="Kim" value={row.who ?? "—"} />
                <Field label="Manba" value={row.source_label} />
                <Field label="Birim" value={row.unit ?? "—"} />
                <Field label="Miqdor" value={row.qty != null ? String(row.qty) : "—"} />
                {showAmount && <Field label="Narxi" value={row.unit_price ? fmtUZS(row.unit_price) : "—"} />}
                {showAmount && <Field label="Jami narx" value={fmtUZS(row.total)} />}
              </div>
            )}
            {row.note && row.source === "web" && !editing && (
              <div>
                <div className="text-xs text-muted-foreground mb-1">Izoh</div>
                <div className="rounded-md border border-border bg-muted/30 p-2">{row.note}</div>
              </div>
            )}
            {canEdit && (
              <div className="flex justify-end gap-2 pt-2 border-t border-border">
                {editing ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setEditing(false)} disabled={saving}>
                      <X className="h-4 w-4 mr-1" /> Bekor
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={saving}>
                      <Save className="h-4 w-4 mr-1" />
                      {saving ? "Saqlanmoqda..." : "Saqlash"}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                      <Pencil className="h-4 w-4 mr-1" /> Tahrirlash
                    </Button>
                    <Button variant="destructive" size="sm" onClick={handleDelete} disabled={deleting}>
                      <Trash2 className="h-4 w-4 mr-1" />
                      {deleting ? "O'chirilmoqda..." : "O'chirish"}
                    </Button>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}


function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function RevealRow({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  const ref = useRef<HTMLTableRowElement | null>(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
          } else if (e.boundingClientRect.top > 0) {
            // re-trigger animation when scrolling back up past the row
            setShown(false);
          }
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <TableRow
      ref={ref}
      onClick={onClick}
      className={`cursor-pointer transition-all duration-300 ease-out will-change-transform ${
        shown ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
      }`}
    >
      {children}
    </TableRow>
  );
}


