import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FileText, Truck, Receipt, Wallet, PackageCheck, Upload, Loader2, ExternalLink, Plus, Search, ClipboardList, TrendingUp, TrendingDown, CircleDollarSign, PackageMinus, Link2 } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/lib/project-context";
import { fmtUZS, fmtUZSc } from "@/lib/queries";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/buxalteriya")({
  head: () => ({
    meta: [
      { title: "Buxgalteriya — QurilishNazorat" },
      { name: "description", content: "Buyurtma, shartnoma, nakladnoy, faktura, to'lov va ombor qabul bitta joyda." },
    ],
  }),
  component: BuxgalteriyaPage,
});

type TabKey = "orders" | "contracts" | "waybills" | "invoices" | "payments" | "warehouse";

const TAB_DEFS: { key: TabKey; label: string; icon: any; tint: string }[] = [
  { key: "orders",    label: "Buyurtma",    icon: FileText,      tint: "text-sky-600 bg-sky-100 dark:bg-sky-500/15 dark:text-sky-300" },
  { key: "contracts", label: "Shartnoma",   icon: ClipboardList, tint: "text-violet-600 bg-violet-100 dark:bg-violet-500/15 dark:text-violet-300" },
  { key: "waybills",  label: "Nakladnoy",   icon: Truck,         tint: "text-amber-600 bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300" },
  { key: "invoices",  label: "Faktura",     icon: Receipt,       tint: "text-rose-600 bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300" },
  { key: "payments",  label: "To'lovlar",   icon: Wallet,        tint: "text-emerald-600 bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300" },
  { key: "warehouse", label: "Omborda",     icon: PackageCheck,  tint: "text-indigo-600 bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300" },
];

function BuxKpiStrip({ projectId }: { projectId: string }) {
  const { data } = useQuery({
    queryKey: ["bx-kpi", projectId],
    queryFn: async () => {
      const { data: zs } = await supabase
        .from("project_zayavka")
        .select("total,qty,unit_price,paid_amount")
        .eq("project_id", projectId);
      const rows = zs ?? [];
      let totalOrders = 0, totalPaid = 0;
      rows.forEach((r: any) => {
        const sum = Number(r.total) || (Number(r.qty) * Number(r.unit_price)) || 0;
        totalOrders += sum;
        totalPaid += Number(r.paid_amount) || 0;
      });
      return { totalOrders, totalPaid, debt: Math.max(0, totalOrders - totalPaid) };
    },
  });
  const s = data ?? { totalOrders: 0, totalPaid: 0, debt: 0 };
  const items = [
    { label: "Buyurtma",   value: s.totalOrders, icon: TrendingUp,       tint: "text-sky-600" },
    { label: "To'langan",  value: s.totalPaid,   icon: CircleDollarSign, tint: "text-emerald-600" },
    { label: "Qarzdorlik", value: s.debt,        icon: TrendingDown,     tint: "text-rose-600" },
  ];
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((it) => (
        <div key={it.label} className="rounded-2xl bg-card p-2.5 shadow-sm">
          <div className="flex items-center gap-1.5">
            <it.icon className={cn("h-3.5 w-3.5", it.tint)} />
            <span className="text-[10px] font-medium text-muted-foreground">{it.label}</span>
          </div>
          <div className="mt-1 truncate text-sm font-bold tabular-nums text-foreground">{fmtUZSc(it.value)}</div>
        </div>
      ))}
    </div>
  );
}

function BuxgalteriyaPage() {
  const { activeProjectId, activeProject } = useActiveProject();
  const [tab, setTab] = useState<TabKey>("orders");

  return (
    <div className="space-y-3 p-3 sm:p-4 pb-24">
      <PageHeader
        title="Buxgalteriya"
        subtitle={activeProject ? `${activeProject.name} — moliyaviy hujjatlar` : "Loyiha tanlang"}
      />
      {!activeProjectId ? (
        <div className="rounded-2xl bg-card p-10 text-center text-sm text-muted-foreground shadow-sm">
          Yuqori o'ng burchakdan loyiha tanlang.
        </div>
      ) : (
        <>
          <BuxKpiStrip projectId={activeProjectId} />

          <div className="grid grid-cols-3 gap-2 rounded-2xl bg-card p-2 shadow-sm">
            {TAB_DEFS.map((t) => {
              const active = tab === t.key;
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTab(t.key)}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-[11px] font-medium transition-all",
                    active ? "bg-primary/10 text-primary shadow-sm" : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <div className={cn("flex h-7 w-7 items-center justify-center rounded-lg", active ? t.tint : "bg-muted text-muted-foreground")}>
                    <t.icon className="h-3.5 w-3.5" />
                  </div>
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)} className="space-y-3">
            <TabsContent value="orders" className="mt-0 space-y-3"><OrdersTab projectId={activeProjectId} /></TabsContent>
            <TabsContent value="contracts" className="mt-0"><ContractsTab /></TabsContent>
            <TabsContent value="waybills" className="mt-0"><WaybillsTab projectId={activeProjectId} /></TabsContent>
            <TabsContent value="invoices" className="mt-0"><InvoicesTab projectId={activeProjectId} /></TabsContent>
            <TabsContent value="payments" className="mt-0"><PaymentsTab projectId={activeProjectId} /></TabsContent>
            <TabsContent value="warehouse" className="mt-0"><WarehouseTab projectId={activeProjectId} /></TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

// ===== Ixcham kartochka ro'yxati uchun yordamchi =====
function CompactRow({ icon: Icon, tint, title, sub, right, onClick }: {
  icon: any; tint: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left shadow-sm transition-all active:scale-[0.99] hover:shadow-md"
    >
      <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl", tint)}>
        <Icon className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">{title}</div>
        {sub && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{sub}</div>}
      </div>
      {right && <div className="shrink-0 text-right">{right}</div>}
    </button>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">{text}</div>;
}

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  return `${String(dt.getDate()).padStart(2, "0")}.${String(dt.getMonth() + 1).padStart(2, "0")}.${dt.getFullYear()}`;
}



function DetailDialog({ open, onOpenChange, title, data }: { open: boolean; onOpenChange: (v: boolean) => void; title: string; data: any | null }) {
  if (!data) return null;
  const FIELD_LABELS: Record<string, string> = {
    zayavka_no: "№", name: "Nomi", notes: "Izoh", created_at: "Yaratilgan",
    workflow_status: "Holat", excel_url: "Excel", supplier_name: "Kompaniya / Ta'minotchi",
    contract_no: "Shartnoma №", contract_date: "Shartnoma sanasi", amount: "Summa",
    file_url: "Hujjat", note: "Izoh", received_at: "Qabul sanasi", nakladnoy_no: "Nakladnoy №",
    material_name: "Material", qty: "Miqdor", unit: "Birlik", unit_price: "Birim narx",
    total_price: "Jami narx", pdf_url: "PDF", photo_url: "Rasm", waybill_url: "Hujjat",
    invoice_no: "Faktura №", invoice_date: "Faktura sanasi", invoice_url: "Faktura",
    paid_amount: "To'langan", paid_at: "To'lov sanasi", payment_proof_url: "To'lov cheki",
  };
  const HIDE = new Set(["id", "project_id", "supplier_id", "boq_item_id", "master_material_id", "receipt_group_id", "telegram_user_id", "created_by", "import_hash", "source", "source_note", "zayavka_id", "boq_code", "items"]);
  const isUrl = (k: string) => k.endsWith("_url");
  const isMoney = (k: string) => /(price|amount|total)/i.test(k);
  const fmt = (k: string, v: any) => {
    if (v === null || v === undefined || v === "") return "—";
    if (isUrl(k) && typeof v === "string") return <a href={v} target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-1">Ochish <ExternalLink className="h-3 w-3" /></a>;
    if (isMoney(k) && !isNaN(Number(v))) return <span className="tabular-nums">{fmtUZS(Number(v))}</span>;
    if (typeof v === "object") return <pre className="text-[11px] max-h-40 overflow-auto bg-muted rounded p-2">{JSON.stringify(v, null, 2)}</pre>;
    return String(v);
  };
  const entries = Object.entries(data).filter(([k, v]) => !HIDE.has(k) && v !== null && v !== "" && v !== undefined);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm max-h-[70vh] overflow-auto">
          {entries.map(([k, v]) => (
            <div key={k} className="rounded-md border bg-muted/20 p-2">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{FIELD_LABELS[k] ?? k}</div>
              <div className="mt-0.5 break-words">{fmt(k, v)}</div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function useDetail() {
  const [row, setRow] = useState<any | null>(null);
  return { row, open: !!row, openRow: setRow, close: () => setRow(null) };
}

function OrdersTab({ projectId }: { projectId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["bx-orders", projectId],
    queryFn: async () => {
      const { data: heads, error } = await supabase
        .from("project_zayavka")
        .select("id,zayavka_no,name,notes,created_at,workflow_status,excel_url")
        .eq("project_id", projectId)
        .not("zayavka_no", "is", null)
        .order("zayavka_no", { ascending: false });
      if (error) throw error;
      const ids = (heads ?? []).map((h: any) => h.id);
      const { data: items } = ids.length
        ? await supabase.from("project_zayavka_items").select("*").in("zayavka_id", ids).order("line_no")
        : { data: [] as any[] };
      const byZ = new Map<string, any[]>();
      (items ?? []).forEach((it: any) => {
        const arr = byZ.get(it.zayavka_id) ?? [];
        arr.push(it);
        byZ.set(it.zayavka_id, arr);
      });
      return (heads ?? []).map((h: any) => ({ ...h, items: byZ.get(h.id) ?? [] }));
    },
  });
  const detail = useDetail();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return data;
    return data.filter((z: any) =>
      String(z.zayavka_no ?? "").includes(term) ||
      (z.name ?? "").toLowerCase().includes(term) ||
      z.items.some((it: any) => (it.name ?? "").toLowerCase().includes(term)),
    );
  }, [data, q]);

  function statusMeta(s?: string | null) {
    const v = (s ?? "").toLowerCase();
    if (["received", "paid", "completed", "done"].includes(v)) return { label: "Bajarildi", dot: "bg-emerald-500", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300", iconBg: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300" };
    if (["rejected", "cancelled"].includes(v))                  return { label: "Bekor qilingan", dot: "bg-rose-500",    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",       iconBg: "bg-rose-100 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300" };
    if (["new", "draft", "", "pending"].includes(v))            return { label: "Yangi",        dot: "bg-sky-500",     chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",           iconBg: "bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300" };
    return                                                              { label: "Jarayonda",   dot: "bg-orange-500",  chip: "bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300", iconBg: "bg-orange-100 text-orange-600 dark:bg-orange-500/15 dark:text-orange-300" };
  }

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buyurtma qidirish..." className="h-11 rounded-2xl border-border bg-card pl-9" />
        </div>
      </div>

      <div className="flex items-center justify-between px-1">
        <h3 className="text-sm font-bold text-foreground">Buyurtmalar ro'yxati</h3>
        <span className="text-[11px] text-muted-foreground">Yangi birinchi</span>
      </div>

      {isLoading && <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">Yuklanmoqda...</div>}
      {!isLoading && list.length === 0 && (
        <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">Buyurtmalar yo'q. Telegram bot → 💼 Buxgalteriya → 📝 Buyurtma.</div>
      )}

      <div className="space-y-2">
        {list.map((z: any) => {
          const meta = statusMeta(z.workflow_status);
          const d = new Date(z.created_at);
          const dateStr = `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}.${d.getFullYear()}`;
          const timeStr = `${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
          const totalSum = z.items.reduce((s: number, it: any) => s + (Number(it.total) || Number(it.qty) * Number(it.unit_price) || 0), 0);
          return (
            <button
              key={z.id}
              type="button"
              onClick={() => detail.openRow(z)}
              className="flex w-full items-center gap-3 rounded-2xl bg-card p-3 text-left shadow-sm transition-all active:scale-[0.99] hover:shadow-md"
            >
              <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-xl", meta.iconBg)}>
                <ClipboardList className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold text-foreground">#{z.zayavka_no}</span>
                </div>
                <div className="mt-0.5 truncate text-[11px] text-muted-foreground">
                  {dateStr} · {timeStr} · {z.items.length} ta material
                </div>
                <div className="mt-0.5 truncate text-[11px] font-semibold text-foreground tabular-nums">
                  {fmtUZSc(totalSum)}
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.chip)}>
                  <span className={cn("h-1.5 w-1.5 rounded-full", meta.dot)} />
                  {meta.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <DetailDialog open={detail.open} onOpenChange={(v) => !v && detail.close()} title={`Buyurtma #${detail.row?.zayavka_no ?? ""}`} data={detail.row} />
    </div>
  );
}


function ContractsTab() {
  const qc = useQueryClient();
  const { activeProjectId } = useActiveProject();
  const { data = [], isLoading } = useQuery({
    queryKey: ["bx-contracts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("supplier_contracts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const [linksFor, setLinksFor] = useState<any | null>(null);
  const detail = useDetail();
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-end">
        <NewContractDialog onDone={() => qc.invalidateQueries({ queryKey: ["bx-contracts"] })} />
      </div>
      {isLoading && <EmptyState text="Yuklanmoqda..." />}
      {!isLoading && data.length === 0 && <EmptyState text="Shartnomalar yo'q" />}
      {data.map((c: any) => (
        <div key={c.id} className="flex items-stretch gap-2">
          <button
            type="button"
            onClick={() => detail.openRow(c)}
            className="flex flex-1 items-center gap-3 rounded-2xl bg-card p-3 text-left shadow-sm transition-all active:scale-[0.99] hover:shadow-md min-w-0"
          >
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-violet-600 bg-violet-100 dark:bg-violet-500/15 dark:text-violet-300">
              <ClipboardList className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-foreground">{c.supplier_name ?? "—"}</div>
              <div className="mt-0.5 truncate text-[11px] text-muted-foreground">№{c.contract_no ?? "—"} • {fmtDate(c.contract_date)}</div>
            </div>
            <span className="shrink-0 text-sm font-bold tabular-nums text-foreground">{c.amount ? fmtUZSc(c.amount) : "—"}</span>
          </button>
          <button
            type="button"
            onClick={() => setLinksFor(c)}
            title="Bog'liq hujjatlar"
            className="flex w-11 shrink-0 items-center justify-center rounded-2xl bg-card text-primary shadow-sm transition-all active:scale-95 hover:shadow-md"
          >
            <Link2 className="h-4 w-4" />
          </button>
        </div>
      ))}
      <DetailDialog open={detail.open} onOpenChange={(v) => !v && detail.close()} title={`Shartnoma ${detail.row?.contract_no ?? ""}`} data={detail.row} />
      <SupplierLinksDialog
        open={!!linksFor}
        onOpenChange={(v) => !v && setLinksFor(null)}
        contract={linksFor}
        projectId={activeProjectId}
      />
    </div>
  );
}

function SupplierLinksDialog({ open, onOpenChange, contract, projectId }: {
  open: boolean; onOpenChange: (v: boolean) => void; contract: any | null; projectId: string | null;
}) {
  const supplierId = contract?.supplier_id ?? null;
  const supplierName = contract?.supplier_name ?? null;
  const { data, isLoading } = useQuery({
    queryKey: ["bx-supplier-links", supplierId, supplierName, projectId],
    enabled: open && !!contract,
    queryFn: async () => {
      const filterMR = supabase.from("material_receipts").select("id,nakladnoy_no,received_at,qty,unit_price,material_name,waybill_url,supplier_id,supplier_name").eq("project_id", projectId!);
      const filterPZ = supabase.from("project_zayavka").select("id,name,invoice_no,invoice_date,invoice_url,paid_amount,paid_at,total,qty,unit_price,supplier_id,supplier_name").eq("project_id", projectId!);
      const mrQ = supplierId
        ? filterMR.eq("supplier_id", supplierId)
        : filterMR.ilike("supplier_name", supplierName ?? "");
      const pzQ = supplierId
        ? filterPZ.eq("supplier_id", supplierId)
        : filterPZ.ilike("supplier_name", supplierName ?? "");
      const [{ data: mr }, { data: pz }] = await Promise.all([mrQ, pzQ]);
      const nak = mr ?? [];
      const fak = (pz ?? []).filter((z: any) => !!z.invoice_no || !!z.invoice_url);
      const pay = (pz ?? []).filter((z: any) => Number(z.paid_amount) > 0 || !!z.paid_at);
      return { nak, fak, pay };
    },
  });
  const totalNak = (data?.nak ?? []).reduce((s, r: any) => s + (Number(r.qty) || 0) * (Number(r.unit_price) || 0), 0);
  const totalPay = (data?.pay ?? []).reduce((s, r: any) => s + (Number(r.paid_amount) || 0), 0);
  const contractAmt = Number(contract?.amount) || 0;
  const debt = Math.max(0, contractAmt - totalPay);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Bog'liq hujjatlar — {supplierName ?? "—"}</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-auto">
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-muted/30 p-2"><div className="text-[10px] text-muted-foreground">Shartnoma</div><div className="text-sm font-bold tabular-nums">{fmtUZSc(contractAmt)}</div></div>
            <div className="rounded-xl bg-emerald-500/10 p-2"><div className="text-[10px] text-muted-foreground">To'langan</div><div className="text-sm font-bold tabular-nums text-emerald-600">{fmtUZSc(totalPay)}</div></div>
            <div className="rounded-xl bg-rose-500/10 p-2"><div className="text-[10px] text-muted-foreground">Qarz</div><div className="text-sm font-bold tabular-nums text-rose-600">{fmtUZSc(debt)}</div></div>
          </div>
          {isLoading && <EmptyState text="Yuklanmoqda..." />}
          {!isLoading && (
            <>
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground"><Truck className="h-3.5 w-3.5 text-amber-600" /> Nakladnoylar ({(data?.nak ?? []).length})</div>
                <div className="space-y-1">
                  {(data?.nak ?? []).slice(0, 30).map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between rounded-md bg-muted/20 px-2 py-1.5 text-[12px]">
                      <span className="truncate">{fmtDate(r.received_at)} • №{r.nakladnoy_no ?? "—"} • {r.material_name}</span>
                      <span className="shrink-0 ml-2 font-semibold tabular-nums">{fmtUZSc((Number(r.qty)||0)*(Number(r.unit_price)||0))}</span>
                    </div>
                  ))}
                  {(data?.nak ?? []).length === 0 && <div className="text-[11px] text-muted-foreground italic">Yo'q</div>}
                </div>
                <div className="mt-1 text-right text-[11px] font-semibold tabular-nums">Jami: {fmtUZSc(totalNak)}</div>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground"><Receipt className="h-3.5 w-3.5 text-rose-600" /> Fakturalar ({(data?.fak ?? []).length})</div>
                <div className="space-y-1">
                  {(data?.fak ?? []).slice(0, 20).map((z: any) => (
                    <div key={z.id} className="flex items-center justify-between rounded-md bg-muted/20 px-2 py-1.5 text-[12px]">
                      <span className="truncate">{fmtDate(z.invoice_date)} • №{z.invoice_no ?? "—"} • {z.name}</span>
                      <span className="shrink-0 ml-2 font-semibold tabular-nums">{fmtUZSc(Number(z.total) || Number(z.qty)*Number(z.unit_price) || 0)}</span>
                    </div>
                  ))}
                  {(data?.fak ?? []).length === 0 && <div className="text-[11px] text-muted-foreground italic">Yo'q</div>}
                </div>
              </div>
              <div>
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-foreground"><Wallet className="h-3.5 w-3.5 text-emerald-600" /> To'lovlar ({(data?.pay ?? []).length})</div>
                <div className="space-y-1">
                  {(data?.pay ?? []).slice(0, 20).map((z: any) => (
                    <div key={z.id} className="flex items-center justify-between rounded-md bg-muted/20 px-2 py-1.5 text-[12px]">
                      <span className="truncate">{fmtDate(z.paid_at)} • {z.name}</span>
                      <span className="shrink-0 ml-2 font-semibold tabular-nums text-emerald-600">{fmtUZSc(Number(z.paid_amount) || 0)}</span>
                    </div>
                  ))}
                  {(data?.pay ?? []).length === 0 && <div className="text-[11px] text-muted-foreground italic">Yo'q</div>}
                </div>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}


function NewContractDialog({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [supplier, setSupplier] = useState("");
  const [no, setNo] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSave() {
    if (!supplier.trim() || !no.trim() || !date || !amount) {
      toast.error("Kompaniya, raqam, sana va summani to'ldiring");
      return;
    }
    setBusy(true);
    try {
      let file_url: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop() || "pdf";
        const path = `shartnoma/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const { error: upErr } = await supabase.storage.from("nakladnoy").upload(path, file, {
          contentType: file.type || "application/pdf",
        });
        if (upErr) throw upErr;
        file_url = supabase.storage.from("nakladnoy").getPublicUrl(path).data.publicUrl;
      }
      // Find or create supplier
      let supplier_id: string | null = null;
      const { data: existing } = await supabase.from("suppliers").select("id").ilike("name", supplier).maybeSingle();
      if (existing) supplier_id = (existing as any).id;
      else {
        const { data: created } = await supabase.from("suppliers").insert({ name: supplier } as any).select("id").single();
        supplier_id = (created as any)?.id ?? null;
      }
      const { error } = await supabase.from("supplier_contracts").insert({
        supplier_id,
        supplier_name: supplier,
        contract_no: no,
        contract_date: date,
        amount: Number(amount) || 0,
        file_url,
        note: note || null,
      } as any);
      if (error) throw error;
      toast.success("Shartnoma saqlandi");
      setOpen(false);
      setSupplier(""); setNo(""); setAmount(""); setNote(""); setFile(null);
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Xato");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-1 h-3.5 w-3.5" /> Yangi shartnoma</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Yangi shartnoma</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label className="text-xs">1. Kompaniya nomi</Label><Input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="FORTIS MCHJ" /></div>
          <div><Label className="text-xs">2. Shartnoma raqami</Label><Input value={no} onChange={(e) => setNo(e.target.value)} placeholder="123/2026" /></div>
          <div><Label className="text-xs">3. Sana</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label className="text-xs">4. Shartnoma summasi</Label><Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50000000" /></div>
          <div><Label className="text-xs">5. Hujjat (PDF)</Label><Input type="file" accept=".pdf,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
          <div><Label className="text-xs">6. Izoh</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="ixtiyoriy" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Bekor</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WaybillsTab({ projectId }: { projectId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["bx-nakladnoy", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_receipts")
        .select("*")
        .eq("project_id", projectId)
        .order("received_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const groups = new Map<string, any>();
      (data ?? []).forEach((r: any) => {
        const key = r.receipt_group_id ?? r.id;
        const g = groups.get(key) ?? { ...r, items: [], total: 0 };
        g.items.push(r);
        g.total += (Number(r.qty) || 0) * (Number(r.unit_price) || 0);
        groups.set(key, g);
      });
      return Array.from(groups.values());
    },
  });
  const detail = useDetail();
  return (
    <div className="space-y-2">
      {isLoading && <EmptyState text="Yuklanmoqda..." />}
      {!isLoading && data.length === 0 && <EmptyState text="Nakladnoy yo'q. Telegram bot → 💼 Buxgalteriya → 🚚 Nakladnoy." />}
      {data.map((g: any) => (
        <CompactRow
          key={g.receipt_group_id ?? g.id}
          icon={Truck}
          tint="text-amber-600 bg-amber-100 dark:bg-amber-500/15 dark:text-amber-300"
          title={g.supplier_name ?? `№${g.nakladnoy_no ?? "—"}`}
          sub={`${fmtDate(g.received_at)} • №${g.nakladnoy_no ?? "—"} • ${g.items.length} qator`}
          right={<span className="text-sm font-bold tabular-nums text-foreground">{fmtUZSc(g.total)}</span>}
          onClick={() => detail.openRow(g)}
        />
      ))}
      <DetailDialog open={detail.open} onOpenChange={(v) => !v && detail.close()} title={`Nakladnoy ${detail.row?.nakladnoy_no ?? ""}`} data={detail.row} />
    </div>
  );
}

function InvoicesTab({ projectId }: { projectId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["bx-invoices", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("project_zayavka").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((z: any) => !!z.invoice_no || !!z.invoice_url);
    },
  });
  const detail = useDetail();
  return (
    <div className="space-y-2">
      {isLoading && <EmptyState text="Yuklanmoqda..." />}
      {!isLoading && data.length === 0 && <EmptyState text="Faktura yo'q" />}
      {data.map((z: any) => (
        <CompactRow
          key={z.id}
          icon={Receipt}
          tint="text-rose-600 bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300"
          title={z.name}
          sub={`${fmtDate(z.invoice_date)} • №${z.invoice_no ?? "—"}${z.supplier_name ? ` • ${z.supplier_name}` : ""}`}
          right={<span className="text-sm font-bold tabular-nums text-foreground">{fmtUZSc(Number(z.total) || (Number(z.qty) * Number(z.unit_price)) || 0)}</span>}
          onClick={() => detail.openRow(z)}
        />
      ))}
      <DetailDialog open={detail.open} onOpenChange={(v) => !v && detail.close()} title={`Faktura ${detail.row?.invoice_no ?? ""}`} data={detail.row} />
    </div>
  );
}

function PaymentsTab({ projectId }: { projectId: string }) {
  const { data = [], isLoading } = useQuery({
    queryKey: ["bx-payments", projectId],
    queryFn: async () => {
      const { data, error } = await supabase.from("project_zayavka").select("*").eq("project_id", projectId).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).filter((z: any) => Number(z.paid_amount) > 0 || !!z.paid_at || !!z.payment_proof_url);
    },
  });
  const detail = useDetail();
  return (
    <div className="space-y-2">
      {isLoading && <EmptyState text="Yuklanmoqda..." />}
      {!isLoading && data.length === 0 && <EmptyState text="To'lovlar yo'q" />}
      {data.map((z: any) => {
        const total = Number(z.total) || (Number(z.qty) * Number(z.unit_price)) || 0;
        const paid = Number(z.paid_amount) || 0;
        return (
          <CompactRow
            key={z.id}
            icon={Wallet}
            tint="text-emerald-600 bg-emerald-100 dark:bg-emerald-500/15 dark:text-emerald-300"
            title={z.name}
            sub={`${fmtDate(z.paid_at)}${z.supplier_name ? ` • ${z.supplier_name}` : ""} • Jami ${fmtUZSc(total)}`}
            right={<span className="text-sm font-bold tabular-nums text-emerald-600">{fmtUZSc(paid)}</span>}
            onClick={() => detail.openRow(z)}
          />
        );
      })}
      <DetailDialog open={detail.open} onOpenChange={(v) => !v && detail.close()} title={`To'lov — ${detail.row?.name ?? ""}`} data={detail.row} />
    </div>
  );
}

function WarehouseTab({ projectId }: { projectId: string }) {
  const qc = useQueryClient();
  const [view, setView] = useState<"balance" | "boq" | "in" | "out">("balance");
  const { data: receipts = [], isLoading: l1 } = useQuery({
    queryKey: ["bx-warehouse-in", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_receipts")
        .select("id,material_name,unit,qty,unit_price,received_at,supplier_name,nakladnoy_no,boq_code,boq_item_id")
        .eq("project_id", projectId)
        .order("received_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return data ?? [];
    },
  });
  const { data: usage = [], isLoading: l2 } = useQuery({
    queryKey: ["bx-warehouse-out", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("material_usage" as any)
        .select("*")
        .eq("project_id", projectId)
        .order("used_at", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });
  const { data: boqItems = [], isLoading: l3 } = useQuery({
    queryKey: ["bx-warehouse-boq", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("boq_items")
        .select("id,code,description,unit,qty,rate,planned_cost")
        .eq("project_id", projectId)
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });
  const detail = useDetail();

  // Material qoldig'i — kirim − chiqim (nom bo'yicha case-insensitive)
  const balance = useMemo(() => {
    const map = new Map<string, { name: string; unit: string; qty_in: number; qty_out: number; cost_in: number }>();
    const norm = (s: string) => (s ?? "").trim().toLowerCase();
    for (const r of receipts as any[]) {
      const k = norm(r.material_name);
      if (!k) continue;
      const cur = map.get(k) ?? { name: r.material_name, unit: r.unit ?? "", qty_in: 0, qty_out: 0, cost_in: 0 };
      cur.qty_in += Number(r.qty) || 0;
      cur.cost_in += (Number(r.qty) || 0) * (Number(r.unit_price) || 0);
      map.set(k, cur);
    }
    for (const u of usage as any[]) {
      const k = norm(u.material_name);
      if (!k) continue;
      const cur = map.get(k) ?? { name: u.material_name, unit: u.unit ?? "", qty_in: 0, qty_out: 0, cost_in: 0 };
      cur.qty_out += Number(u.qty) || 0;
      map.set(k, cur);
    }
    return Array.from(map.values()).sort((a, b) => (b.qty_in - b.qty_out) - (a.qty_in - a.qty_out));
  }, [receipts, usage]);

  // BOQ bo'yicha agregat
  const boqAgg = useMemo(() => {
    const map = new Map<string, {
      code: string; description: string; unit: string;
      planned_qty: number; planned_cost: number;
      in_qty: number; in_cost: number;
      out_qty: number; out_cost: number;
    }>();
    for (const b of boqItems as any[]) {
      const planned_cost = Number(b.planned_cost) || (Number(b.qty) * Number(b.rate)) || 0;
      map.set(b.code, {
        code: b.code,
        description: b.description ?? "",
        unit: b.unit ?? "",
        planned_qty: Number(b.qty) || 0,
        planned_cost,
        in_qty: 0, in_cost: 0, out_qty: 0, out_cost: 0,
      });
    }
    const ensure = (code: string) => {
      const cur = map.get(code) ?? { code, description: "(BOQ ro'yxatida yo'q)", unit: "", planned_qty: 0, planned_cost: 0, in_qty: 0, in_cost: 0, out_qty: 0, out_cost: 0 };
      map.set(code, cur); return cur;
    };
    for (const r of receipts as any[]) {
      const code = (r.boq_code ?? "").trim();
      if (!code) continue;
      const cur = ensure(code);
      cur.in_qty += Number(r.qty) || 0;
      cur.in_cost += (Number(r.qty) || 0) * (Number(r.unit_price) || 0);
    }
    for (const u of usage as any[]) {
      const code = (u.boq_code ?? "").trim();
      if (!code) continue;
      const cur = ensure(code);
      cur.out_qty += Number(u.qty) || 0;
      cur.out_cost += (Number(u.qty) || 0) * (Number(u.unit_price) || 0);
    }
    return Array.from(map.values())
      .filter((b) => b.in_qty > 0 || b.out_qty > 0 || b.planned_qty > 0)
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [boqItems, receipts, usage]);

  const totalIn = receipts.reduce((s, r: any) => s + (Number(r.qty) || 0) * (Number(r.unit_price) || 0), 0);
  const totalOut = usage.reduce((s, u: any) => s + (Number(u.qty) || 0) * (Number(u.unit_price) || 0), 0);
  const onDone = () => {
    qc.invalidateQueries({ queryKey: ["bx-warehouse-out", projectId] });
    qc.invalidateQueries({ queryKey: ["bx-warehouse-in", projectId] });
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-emerald-500/10 p-2"><div className="text-[10px] text-muted-foreground">Kirim (jami)</div><div className="text-sm font-bold tabular-nums text-emerald-600">{fmtUZSc(totalIn)}</div></div>
        <div className="rounded-xl bg-rose-500/10 p-2"><div className="text-[10px] text-muted-foreground">Chiqim (jami)</div><div className="text-sm font-bold tabular-nums text-rose-600">{fmtUZSc(totalOut)}</div></div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1 rounded-xl bg-card p-1 shadow-sm overflow-x-auto">
          {(["balance", "boq", "in", "out"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={cn(
                "shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-semibold transition-all",
                view === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted/50",
              )}
            >
              {v === "balance" ? "Qoldiq" : v === "boq" ? "BOQ" : v === "in" ? "Kirim" : "Chiqim"}
            </button>
          ))}
        </div>
        <NewUsageDialog projectId={projectId} boqItems={boqItems} onDone={onDone} />
      </div>

      {view === "balance" && (
        <>
          {(l1 || l2) && <EmptyState text="Yuklanmoqda..." />}
          {!l1 && !l2 && balance.length === 0 && <EmptyState text="Ombor bo'sh." />}
          {balance.map((b) => {
            const left = b.qty_in - b.qty_out;
            const empty = left <= 0;
            return (
              <div key={b.name} className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm">
                <div className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                  empty ? "text-rose-600 bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300" : "text-indigo-600 bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300",
                )}>
                  <PackageCheck className="h-4.5 w-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-foreground">{b.name}</div>
                  <div className="mt-0.5 truncate text-[11px] text-muted-foreground tabular-nums">
                    Kirim {b.qty_in} · Chiqim {b.qty_out} {b.unit ?? ""}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className={cn("text-sm font-bold tabular-nums", empty ? "text-rose-600" : "text-foreground")}>{left} {b.unit ?? ""}</div>
                  <div className="text-[10px] text-muted-foreground">qoldiq</div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {view === "boq" && (
        <>
          {(l1 || l2 || l3) && <EmptyState text="Yuklanmoqda..." />}
          {!l1 && !l2 && !l3 && boqAgg.length === 0 && <EmptyState text="BOQ bo'yicha ma'lumot yo'q. Kirim/chiqimda BOQ kodini ko'rsating." />}
          {boqAgg.map((b) => {
            const leftQty = b.in_qty - b.out_qty;
            const overspend = b.planned_cost > 0 && b.out_cost > b.planned_cost;
            const pct = b.planned_cost > 0 ? Math.min(100, (b.out_cost / b.planned_cost) * 100) : 0;
            return (
              <div key={b.code} className="rounded-2xl bg-card p-3 shadow-sm">
                <div className="flex items-start gap-2">
                  <div className="flex h-9 min-w-[44px] shrink-0 items-center justify-center rounded-lg bg-violet-100 px-2 text-[11px] font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                    {b.code}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-semibold text-foreground">{b.description}</div>
                    <div className="mt-1 grid grid-cols-3 gap-1 text-[10px]">
                      <div className="rounded bg-muted/40 px-1.5 py-1">
                        <div className="text-muted-foreground">Reja</div>
                        <div className="font-semibold tabular-nums">{b.planned_qty} {b.unit}</div>
                        <div className="text-[9px] tabular-nums text-muted-foreground">{fmtUZSc(b.planned_cost)}</div>
                      </div>
                      <div className="rounded bg-emerald-500/10 px-1.5 py-1">
                        <div className="text-muted-foreground">Kirim</div>
                        <div className="font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">{b.in_qty} {b.unit}</div>
                        <div className="text-[9px] tabular-nums text-muted-foreground">{fmtUZSc(b.in_cost)}</div>
                      </div>
                      <div className="rounded bg-rose-500/10 px-1.5 py-1">
                        <div className="text-muted-foreground">Chiqim</div>
                        <div className="font-semibold tabular-nums text-rose-700 dark:text-rose-400">{b.out_qty} {b.unit}</div>
                        <div className="text-[9px] tabular-nums text-muted-foreground">{fmtUZSc(b.out_cost)}</div>
                      </div>
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[10px]">
                      <span className="text-muted-foreground">Qoldiq: <span className={cn("font-bold tabular-nums", leftQty <= 0 ? "text-rose-600" : "text-foreground")}>{leftQty} {b.unit}</span></span>
                      {b.planned_cost > 0 && (
                        <span className={cn("font-semibold tabular-nums", overspend ? "text-rose-600" : "text-muted-foreground")}>
                          {pct.toFixed(0)}% sarflandi
                        </span>
                      )}
                    </div>
                    {b.planned_cost > 0 && (
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div className={cn("h-full rounded-full", overspend ? "bg-rose-500" : "bg-emerald-500")} style={{ width: `${pct}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </>
      )}

      {view === "in" && (
        <>
          {l1 && <EmptyState text="Yuklanmoqda..." />}
          {!l1 && receipts.length === 0 && <EmptyState text="Kirim yo'q." />}
          {receipts.map((r: any) => (
            <CompactRow
              key={r.id}
              icon={PackageCheck}
              tint="text-indigo-600 bg-indigo-100 dark:bg-indigo-500/15 dark:text-indigo-300"
              title={r.material_name}
              sub={`${fmtDate(r.received_at)} • ${r.qty} ${r.unit ?? ""}${r.boq_code ? ` • BOQ ${r.boq_code}` : ""}${r.supplier_name ? ` • ${r.supplier_name}` : ""}`}
              right={<span className="text-sm font-bold tabular-nums text-foreground">{fmtUZSc((Number(r.qty)||0)*(Number(r.unit_price)||0))}</span>}
              onClick={() => detail.openRow(r)}
            />
          ))}
        </>
      )}

      {view === "out" && (
        <>
          {l2 && <EmptyState text="Yuklanmoqda..." />}
          {!l2 && usage.length === 0 && <EmptyState text="Chiqim yo'q. ➕ Chiqim tugmasini bosing." />}
          {usage.map((u: any) => (
            <CompactRow
              key={u.id}
              icon={PackageMinus}
              tint="text-rose-600 bg-rose-100 dark:bg-rose-500/15 dark:text-rose-300"
              title={u.material_name}
              sub={`${fmtDate(u.used_at)} • ${u.qty} ${u.unit ?? ""}${u.boq_code ? ` • BOQ ${u.boq_code}` : ""}${u.used_for ? ` • ${u.used_for}` : ""}`}
              right={<span className="text-sm font-bold tabular-nums text-rose-600">{fmtUZSc((Number(u.qty)||0)*(Number(u.unit_price)||0))}</span>}
              onClick={() => detail.openRow(u)}
            />
          ))}
        </>
      )}

      <DetailDialog open={detail.open} onOpenChange={(v) => !v && detail.close()} title={`Ombor — ${detail.row?.material_name ?? ""}`} data={detail.row} />
    </div>
  );
}


function NewUsageDialog({ projectId, boqItems = [], onDone }: { projectId: string; boqItems?: any[]; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [usedFor, setUsedFor] = useState("");
  const [brigade, setBrigade] = useState("");
  const [note, setNote] = useState("");
  const [boqCode, setBoqCode] = useState("");
  const [busy, setBusy] = useState(false);

  // Mavjud materiallar — nomi + birlik + so'nggi narx + boq_code (kirimdan)
  const { data: hints = [] } = useQuery({
    queryKey: ["bx-mat-hints", projectId, open],
    enabled: open,
    queryFn: async () => {
      const { data } = await supabase
        .from("material_receipts")
        .select("material_name,unit,unit_price,boq_code")
        .eq("project_id", projectId)
        .order("received_at", { ascending: false })
        .limit(500);
      const map = new Map<string, { name: string; unit: string; price: number; boq_code: string | null }>();
      (data ?? []).forEach((r: any) => {
        const k = (r.material_name ?? "").trim().toLowerCase();
        if (!k || map.has(k)) return;
        map.set(k, { name: r.material_name, unit: r.unit ?? "", price: Number(r.unit_price) || 0, boq_code: r.boq_code ?? null });
      });
      return Array.from(map.values());
    },
  });

  function pickHint(h: { name: string; unit: string; price: number; boq_code: string | null }) {
    setName(h.name);
    if (!unit) setUnit(h.unit);
    if (!price) setPrice(String(h.price || ""));
    if (!boqCode && h.boq_code) setBoqCode(h.boq_code);
  }

  const selectedBoq = useMemo(() => boqItems.find((b: any) => b.code === boqCode), [boqItems, boqCode]);

  async function handleSave() {
    if (!name.trim() || !qty || Number(qty) <= 0) {
      toast.error("Material nomi va miqdorni to'ldiring");
      return;
    }
    setBusy(true);
    try {
      const boqRow = selectedBoq as any;
      const { error } = await supabase.from("material_usage" as any).insert({
        project_id: projectId,
        material_name: name.trim(),
        unit: unit || null,
        qty: Number(qty),
        unit_price: Number(price) || 0,
        used_at: date,
        used_for: usedFor || null,
        brigade_name: brigade || null,
        note: note || null,
        boq_code: boqCode || null,
        boq_item_id: boqRow?.id ?? null,
      } as any);
      if (error) throw error;
      toast.success("Chiqim saqlandi");
      setOpen(false);
      setName(""); setUnit(""); setQty(""); setPrice(""); setUsedFor(""); setBrigade(""); setNote(""); setBoqCode("");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Xato");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><Plus className="mr-1 h-3.5 w-3.5" /> Chiqim</Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Material chiqim</DialogTitle></DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-auto">
          <div>
            <Label className="text-xs">Material nomi</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sement, g'isht..." list="mu-mat-list" />
            <datalist id="mu-mat-list">
              {hints.map((h) => <option key={h.name} value={h.name} />)}
            </datalist>
            {hints.length > 0 && name.length === 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {hints.slice(0, 6).map((h) => (
                  <button key={h.name} type="button" onClick={() => pickHint(h)} className="rounded-full bg-muted px-2 py-0.5 text-[10px] hover:bg-muted/70">
                    {h.name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <Label className="text-xs">BOQ kodi</Label>
            <Input value={boqCode} onChange={(e) => setBoqCode(e.target.value)} placeholder="ixtiyoriy — masalan 1.2.3" list="mu-boq-list" />
            <datalist id="mu-boq-list">
              {boqItems.map((b: any) => <option key={b.id} value={b.code}>{b.description}</option>)}
            </datalist>
            {selectedBoq && (
              <div className="mt-1 truncate text-[10px] text-muted-foreground">
                ✓ {(selectedBoq as any).description}
              </div>
            )}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">Miqdor</Label><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div><Label className="text-xs">Birlik</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="dona" /></div>
            <div><Label className="text-xs">Narx</Label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          </div>
          <div><Label className="text-xs">Sana</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div><Label className="text-xs">Nima uchun (ish/joy)</Label><Input value={usedFor} onChange={(e) => setUsedFor(e.target.value)} placeholder="Pol quyish, devor..." /></div>
          <div><Label className="text-xs">Brigada</Label><Input value={brigade} onChange={(e) => setBrigade(e.target.value)} placeholder="ixtiyoriy" /></div>
          <div><Label className="text-xs">Izoh</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="ixtiyoriy" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Bekor</Button>
          <Button onClick={handleSave} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}


