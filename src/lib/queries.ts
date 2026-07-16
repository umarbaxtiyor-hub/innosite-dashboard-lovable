import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  boqItems as dummyBoq,
  materials as dummyMaterials,
  workProgress as dummyWork,
  expenses as dummyExpenses,
  variations as dummyVariations,
  monthlyExpenses as dummyMonthly,
} from "@/data/dummy";

// Types matching Supabase tables
export type DbBoq = {
  id: string; project_id: string; code: string; description: string;
  category: string | null; unit: string | null; qty: number;
  rate: number; planned_cost: number; actual_cost: number;
};
export type DbMaterial = {
  id: string; boq_code: string | null; material_name: string; unit: string | null;
  qty: number; unit_price: number; total_price: number; supplier_name: string | null;
  received_at: string; waybill_url: string | null; invoice_url: string | null;
};
export type DbWork = {
  id: string; boq_code: string | null; work_type: string; qty_done: number;
  unit: string | null; unit_price: number; total_value: number; brigade_name: string | null;
  work_date: string; photo_url: string | null;
};
export type DbExpense = {
  id: string; boq_code: string | null; category: string; description: string | null;
  amount: number; payment_method: string; paid_by: string | null; expense_date: string;
  receipt_url: string | null;
};
export type DbVariation = {
  id: string; boq_code: string | null; title: string; reason: string | null;
  amount: number; status: "Pending" | "Approved" | "Rejected";
  requested_by_name: string | null; created_at: string; attachment_url: string | null;
};

// Fallback adapters: shape dummy data into DB shape so the UI works before any data is entered
const fallbackBoq: DbBoq[] = dummyBoq.map((b, i) => ({
  id: `dummy-${i}`, project_id: "dummy", code: b.code, description: b.description,
  category: b.category, unit: b.unit, qty: b.qty, rate: b.rate,
  planned_cost: b.plannedCost, actual_cost: b.actualCost,
}));
const fallbackMaterials: DbMaterial[] = dummyMaterials.map((m) => ({
  id: m.id, boq_code: m.boqCode, material_name: m.name, unit: m.unit,
  qty: m.qtyUsed, unit_price: m.unitCost, total_price: m.qtyUsed * m.unitCost,
  supplier_name: m.supplier, received_at: "2026-05-01", waybill_url: null, invoice_url: null,
}));
const fallbackWork: DbWork[] = dummyWork.map((w) => ({
  id: w.id, boq_code: w.boqCode, work_type: w.task,
  qty_done: w.progress, unit: "%", unit_price: 0, total_value: 0,
  brigade_name: "—", work_date: w.startDate, photo_url: null,
}));
const fallbackExpenses: DbExpense[] = dummyExpenses.map((e) => ({
  id: e.id, boq_code: e.boqCode, category: e.category, description: e.description,
  amount: e.amount, payment_method: "Naqd", paid_by: "—", expense_date: e.date, receipt_url: null,
}));
const fallbackVariations: DbVariation[] = dummyVariations.map((v) => ({
  id: v.id, boq_code: v.boqCode, title: v.title, reason: null, amount: v.amount,
  status: v.status, requested_by_name: v.requestedBy, created_at: v.date, attachment_url: null,
}));

const useDb = <T,>(
  key: unknown[],
  fetcher: () => Promise<T[]>,
  fallback: T[],
  opts: { enabled?: boolean; useFallback?: boolean } = {},
) =>
  useQuery({
    queryKey: key,
    queryFn: async () => {
      const data = await fetcher();
      // Only use dummy fallback when no project is selected (global view).
      // When a project is selected, return real (possibly empty) data.
      if (data.length) return data;
      return opts.useFallback === false ? data : fallback;
    },
    staleTime: 30_000,
    enabled: opts.enabled ?? true,
  });

export const useBoq = (projectId?: string | null) =>
  useDb<DbBoq>(["boq", projectId ?? "all"], async () => {
    let q = supabase.from("boq_items").select("*").order("code");
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DbBoq[];
  }, fallbackBoq, { useFallback: !projectId });

export const useMaterials = (projectId?: string | null) =>
  useDb<DbMaterial>(["materials", projectId ?? "all"], async () => {
    let q = supabase.from("material_receipts").select("*").order("received_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DbMaterial[];
  }, fallbackMaterials, { useFallback: !projectId });

export const useWork = (projectId?: string | null) =>
  useDb<DbWork>(["work", projectId ?? "all"], async () => {
    let q = supabase.from("work_progress").select("*").order("work_date", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DbWork[];
  }, fallbackWork, { useFallback: !projectId });

export const useExpenses = (projectId?: string | null) =>
  useDb<DbExpense>(["expenses", projectId ?? "all"], async () => {
    let q = supabase.from("expenses").select("*").order("expense_date", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DbExpense[];
  }, fallbackExpenses, { useFallback: !projectId });

export const useVariations = (projectId?: string | null) =>
  useDb<DbVariation>(["variations", projectId ?? "all"], async () => {
    let q = supabase.from("variations").select("*").order("created_at", { ascending: false });
    if (projectId) q = q.eq("project_id", projectId);
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as DbVariation[];
  }, fallbackVariations, { useFallback: !projectId });

// ===== Helpers =====
export const fmtUZS = (n: number) =>
  new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(n);

// Compact: 642 000 000 → "642 mln", 1 250 000 000 → "1.25 mlrd"
export const fmtUZSc = (n: number) => {
  const num = Number(n) || 0;
  const abs = Math.abs(num);
  if (abs >= 1_000_000_000) {
    const v = num / 1_000_000_000;
    return `${v.toFixed(abs >= 10_000_000_000 ? 1 : 2).replace(/\.?0+$/, "")} mlrd`;
  }
  if (abs >= 1_000_000) {
    return `${Math.round(num / 1_000_000)} mln`;
  }
  return fmtUZS(num);
};

export const variancePct = (planned: number, actual: number) =>
  planned === 0 ? 0 : ((actual - planned) / planned) * 100;

export const varianceLevel = (pct: number): "ok" | "warn" | "critical" => {
  if (pct > 10) return "critical";
  if (pct > 5) return "warn";
  return "ok";
};

export const monthlyFallback = dummyMonthly.map((m, i) => ({
  month: ["Yan", "Fev", "Mar", "Apr", "May", "Iyn", "Iyl", "Avg", "Sen", "Okt", "Noy", "Dek"][
    (i + 10) % 12
  ],
  amount: m.amount,
}));
