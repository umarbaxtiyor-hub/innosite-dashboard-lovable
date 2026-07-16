import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { sendZayavkaToMake, notifyAdminsZayavkaSubmitted, notifyRoleZayavkaStage } from "@/lib/zayavka-webhook.functions";
import { fmtUZS } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  FileText, Send, CheckCircle2, ShoppingCart, Truck, Receipt,
  ShieldCheck, Wallet, Plus, Search, Upload, XCircle, Clock,
} from "lucide-react";
import { compressImage, uploadWithProgress } from "@/lib/upload-helpers";
import { toast } from "sonner";

type WStatus =
  | "pending_pm" | "approved" | "ordered"
  | "delivered" | "invoiced" | "paid" | "rejected"
  // Eski yozuvlar uchun ham ushlab turamiz
  | "draft" | "submitted" | "waiting_ceo";

type Z = {
  id: string;
  project_id: string;
  parent_id: string | null;
  kind: "material" | "work" | "equipment";
  name: string; unit: string;
  qty: number; unit_price: number; total: number;
  workflow_status: WStatus;
  notes: string | null;
  created_at: string;
  created_by: string | null;
  needed_date: string | null;
  // bosqich maydonlari
  supplier_name: string | null;
  contract_url: string | null;
  waybill_url: string | null;
  waybill_no: string | null;
  waybill_received_at: string | null;
  qty_received: number | null;
  invoice_url: string | null;
  invoice_no: string | null;
  invoice_date: string | null;
  payment_proof_url: string | null;
  paid_amount: number | null;
  paid_at: string | null;
  ceo_status: string | null;
  ceo_at: string | null;
};

type Master = {
  id: string; project_id: string; kind: "material" | "work" | "equipment";
  name: string; unit: string; planned_qty: number; unit_price: number;
  requested_qty: number; received_qty: number; remaining_qty: number;
};

const STATUS_META: Record<string, { label: string; tone: string; icon: any }> = {
  pending_pm:  { label: "PM tasdig'i kutilmoqda", tone: "bg-warning/20 text-warning-foreground border-warning/40", icon: Clock },
  approved:    { label: "Tasdiqlangan",    tone: "bg-primary/10 text-primary border-primary/30", icon: CheckCircle2 },
  ordered:     { label: "Buyurtma berildi", tone: "bg-accent/15 text-accent border-accent/30", icon: ShoppingCart },
  delivered:   { label: "Yetkazildi",      tone: "bg-chart-3/15 text-chart-3 border-chart-3/30", icon: Truck },
  invoiced:    { label: "Faktura keldi",   tone: "bg-chart-5/15 text-chart-5 border-chart-5/30", icon: Receipt },
  paid:        { label: "To'landi",        tone: "bg-success/15 text-success border-success/30", icon: Wallet },
  rejected:    { label: "Rad etildi",      tone: "bg-destructive/10 text-destructive border-destructive/30", icon: XCircle },
  // Legacy
  draft:       { label: "Qoralama",        tone: "bg-muted text-muted-foreground border-border", icon: FileText },
  submitted:   { label: "Yuborildi",       tone: "bg-secondary text-secondary-foreground border-border", icon: Send },
  waiting_ceo: { label: "CEO kutmoqda",    tone: "bg-warning/20 text-warning-foreground border-warning/40", icon: ShieldCheck },
};

const VISIBLE_FLOW: WStatus[] = ["approved", "ordered", "delivered", "invoiced", "paid"];

export function ProcurementWorkflow({ projectId }: { projectId: string }) {
  const [rows, setRows] = useState<Z[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [filter, setFilter] = useState<WStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  async function load() {
    const [{ data: z }, { data: m }] = await Promise.all([
      // Faqat sub-zayavkalar (parent_id IS NOT NULL) yoki eski (parent_id NULL bo'lganlar legacy)
      supabase.from("project_zayavka").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("v_master_zayavka_remaining").select("*").eq("project_id", projectId).order("name"),
    ]);
    // Sub-zayavkalarni olamiz; eski (parent_id NULL) yozuvlardan faqat workflow bosqichida bo'lganlarini ko'rsatamiz
    const all = (z ?? []) as Z[];
    setRows(all.filter((r) => r.parent_id !== null));
    setMasters((m ?? []) as Master[]);
  }
  useEffect(() => { load(); }, [projectId]);

  useEffect(() => {
    const ch = supabase
      .channel(`pw-${projectId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "project_zayavka", filter: `project_id=eq.${projectId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [projectId]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => { c[r.workflow_status] = (c[r.workflow_status] ?? 0) + 1; });
    return c;
  }, [rows]);

  const filtered = rows.filter((r) =>
    (filter === "all" || r.workflow_status === filter) &&
    (search === "" || r.name.toLowerCase().includes(search.toLowerCase()))
  );

  const opened = rows.find((r) => r.id === openId) ?? null;

  return (
    <div className="space-y-4">
      {/* Filter chips + search + new */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setFilter("all")}
          className={`rounded-full border px-3 py-1 text-xs transition ${
            filter === "all" ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"
          }`}
        >
          Hammasi <span className="ml-1 opacity-70">{rows.length}</span>
        </button>
        {VISIBLE_FLOW.map((st) => {
          const m = STATUS_META[st]; const Icon = m.icon;
          return (
            <button
              key={st}
              onClick={() => setFilter(st)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition ${
                filter === st ? "bg-primary text-primary-foreground border-primary" : "bg-card hover:bg-muted"
              }`}
            >
              <Icon className="h-3 w-3" />
              {m.label}
              <span className="opacity-70">{counts[st] ?? 0}</span>
            </button>
          );
        })}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Qidirish..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 w-44 pl-7 text-xs"
            />
          </div>
          <NewZayavkaDialog projectId={projectId} masters={masters} onSaved={load} />
        </div>
      </div>

      {/* Mobile cards */}
      <div className="grid gap-2 md:hidden">
        {filtered.map((r) => {
          const m = STATUS_META[r.workflow_status] ?? STATUS_META.pending_pm;
          const Icon = m.icon;
          return (
            <button key={r.id} onClick={() => setOpenId(r.id)} className="text-left">
              <Card className="p-3 hover:bg-muted/30">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.qty} {r.unit} · {fmtUZS(Number(r.qty) * Number(r.unit_price || 0))}</div>
                  </div>
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] ${m.tone}`}>
                    <Icon className="h-3 w-3" /> {m.label}
                  </span>
                </div>
              </Card>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <Card className="p-6 text-center text-sm text-muted-foreground">Zayavka topilmadi.</Card>
        )}
      </div>

      {/* Desktop table */}
      <Card className="hidden md:block overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Material / Ish</TableHead>
              <TableHead className="text-right">Miqdor</TableHead>
              <TableHead className="text-right">Birim narx</TableHead>
              <TableHead className="text-right">Jami</TableHead>
              <TableHead>Holat</TableHead>
              <TableHead>Kerak sana</TableHead>
              <TableHead className="text-right">Amal</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((r) => {
              const m = STATUS_META[r.workflow_status] ?? STATUS_META.pending_pm;
              const Icon = m.icon;
              return (
                <TableRow key={r.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setOpenId(r.id)}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.qty} {r.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUZS(Number(r.unit_price || 0))}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">{fmtUZS(Number(r.qty) * Number(r.unit_price || 0))}</TableCell>
                  <TableCell>
                    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${m.tone}`}>
                      <Icon className="h-3 w-3" /> {m.label}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.needed_date ? (() => { const d = new Date(r.needed_date); return `${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}`; })() : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); setOpenId(r.id); }}>
                      Ko'rish
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
            {filtered.length === 0 && (
              <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">Zayavka topilmadi.</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Timeline drawer */}
      <Sheet open={!!openId} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>Zayavka bosqichlari</SheetTitle>
          </SheetHeader>
          {opened && <TimelineView z={opened} onChanged={load} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function NewZayavkaDialog({ projectId, masters, onSaved }: { projectId: string; masters: Master[]; onSaved: () => void }) {
  const sendToMake = useServerFn(sendZayavkaToMake);
  const notifyAdmins = useServerFn(notifyAdminsZayavkaSubmitted);
  const [open, setOpen] = useState(false);
  const [masterId, setMasterId] = useState("");
  const [qty, setQty] = useState("");
  const [neededDate, setNeededDate] = useState<string>(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const available = masters.filter((m) => Number(m.remaining_qty) > 0);
  const selected = masters.find((m) => m.id === masterId) ?? null;
  const qtyNum = Number(qty) || 0;
  const overLimit = selected && qtyNum > Number(selected.remaining_qty);

  async function save() {
    if (!selected) return toast.error("Master pozitsiyani tanlang");
    if (qtyNum <= 0) return toast.error("Miqdor 0 dan katta bo'lsin");
    if (overLimit) return toast.error(`Master qoldig'idan oshib ketdi (qoldi: ${selected.remaining_qty} ${selected.unit})`);
    setSaving(true);
    const { data: u } = await supabase.auth.getUser();
    const payload: any = {
      project_id: projectId,
      parent_id: selected.id,
      kind: selected.kind,
      name: selected.name,
      unit: selected.unit,
      qty: qtyNum,
      unit_price: Number(selected.unit_price || 0),
      needed_date: neededDate || null,
      notes: notes.trim() || null,
      created_by: u?.user?.id ?? null,
      workflow_status: "approved",
      status: "approved",
      approved_at: new Date().toISOString(),
      submitted_at: new Date().toISOString(),
    };
    const { data: inserted, error } = await supabase.from("project_zayavka").insert(payload).select("id").single();
    if (error) { setSaving(false); return toast.error(error.message); }

    if (inserted?.id) {
      try { await sendToMake({ data: { zayavka_id: inserted.id } }); } catch (e: any) { console.warn("Make:", e?.message ?? e); }
      try {
        const r = await notifyAdmins({ data: { zayavka_id: inserted.id } });
        toast.success(`Zayavka tayyor — ta'minot bosqichida${r?.sent ? ` (${r.sent} ta xabar)` : ""}`);
      } catch (e: any) {
        toast.warning(`Yuborildi, lekin Telegram xato: ${e?.message ?? e}`);
      }
    }
    setSaving(false);
    setOpen(false); onSaved();
    setMasterId(""); setQty(""); setNotes("");
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1">
          <Plus className="h-4 w-4" /> Yangi buyurtma
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Yangi buyurtma</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs font-medium">Master pozitsiya <span className="text-destructive">*</span></label>
            <Select value={masterId} onValueChange={setMasterId}>
              <SelectTrigger>
                <SelectValue placeholder={available.length ? "Master ro'yxatdan tanlang" : "Mavjud master qoldig'i yo'q"} />
              </SelectTrigger>
              <SelectContent>
                {available.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name} — qoldi {Number(m.remaining_qty)} {m.unit}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selected && (
            <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              Reja: <b className="text-foreground">{Number(selected.planned_qty)} {selected.unit}</b>
              {" · "}So'ralgan: <b className="text-foreground">{Number(selected.requested_qty)}</b>
              {" · "}Qoldiq: <b className="text-foreground">{Number(selected.remaining_qty)}</b>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Miqdor ({selected?.unit ?? "-"}) <span className="text-destructive">*</span></label>
              <Input
                type="number" step="any" min={0}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                aria-invalid={!!overLimit}
                className={overLimit ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {overLimit && <p className="mt-1 text-xs text-destructive">Qoldiqdan oshmoqda</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Kerak sana</label>
              <Input
                type="date"
                value={neededDate}
                min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setNeededDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium">Izoh</label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {selected && qtyNum > 0 && !overLimit && (
            <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              Taxminiy summa: <span className="font-medium text-foreground tabular-nums">{fmtUZS(qtyNum * Number(selected.unit_price || 0))}</span>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>Bekor</Button>
          <Button onClick={save} disabled={saving || !selected || qtyNum <= 0 || !!overLimit}>
            <Send className="h-4 w-4" /> Yuborish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type LogRow = {
  id: string; zayavka_id: string;
  from_status: string | null; to_status: string;
  note: string | null; changed_by: string | null; created_at: string;
};

function TimelineView({ z, onChanged }: { z: Z; onChanged: () => void }) {
  const sendToMake = useServerFn(sendZayavkaToMake);
  const notifyRole = useServerFn(notifyRoleZayavkaStage);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");

  // Stage edit state
  const [supplierName, setSupplierName] = useState(z.supplier_name ?? "");
  const [unitPrice, setUnitPrice] = useState(String(z.unit_price ?? 0));
  const [invoiceNo, setInvoiceNo] = useState(z.invoice_no ?? "");

  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  async function notify(role: string, extra_note?: string) {
    try { await notifyRole({ data: { zayavka_id: z.id, role, extra_note } }); }
    catch (e: any) { console.warn("notifyRole:", e?.message ?? e); }
  }

  async function loadLogs() {
    const { data } = await supabase.from("zayavka_status_log").select("*").eq("zayavka_id", z.id).order("created_at", { ascending: false });
    setLogs((data ?? []) as LogRow[]);
  }
  useEffect(() => { loadLogs(); }, [z.id]);

  async function logChange(from: string | null, to: string, note: string | null) {
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("zayavka_status_log").insert({
      zayavka_id: z.id, from_status: from, to_status: to,
      note, changed_by: u?.user?.id ?? null,
    });
    try { await sendToMake({ data: { zayavka_id: z.id } }); } catch (e: any) { console.warn("Make:", e?.message ?? e); }
  }

  async function patch(updates: Partial<Z> & Record<string, any>, newStatus: WStatus, note: string) {
    setBusy(true);
    const fullPatch: any = { ...updates };
    if (newStatus !== z.workflow_status) fullPatch.workflow_status = newStatus;
    if (newStatus === "approved") {
      const { data: u } = await supabase.auth.getUser();
      fullPatch.approved_at = new Date().toISOString();
      fullPatch.approved_by = u?.user?.id ?? null;
      fullPatch.status = "approved";
    }
    if (newStatus === "rejected") fullPatch.status = "rejected";
    const { error } = await supabase.from("project_zayavka").update(fullPatch).eq("id", z.id);
    if (error) { setBusy(false); return toast.error(error.message); }
    await logChange(z.workflow_status, newStatus, note);
    setBusy(false);
    toast.success(note);
    onChanged();
    return true;
  }

  async function uploadFile(field: "waybill_url" | "invoice_url" | "contract_url" | "payment_proof_url", rawFile: File, extra?: Record<string, any>) {
    setBusy(true); setUploadingField(field); setUploadPct(0);
    try {
      const file = await compressImage(rawFile);
      const path = `${z.project_id}/${z.id}/${field}-${Date.now()}-${file.name}`;
      const { publicUrl } = await uploadWithProgress("procurement", path, file, (p) => setUploadPct(p));
      const fullPatch: any = { [field]: publicUrl, ...(extra ?? {}) };
      const { error } = await supabase.from("project_zayavka").update(fullPatch).eq("id", z.id);
      if (error) throw error;
      setBusy(false); setUploadingField(null); setUploadPct(null);
      toast.success("Fayl yuklandi");
      onChanged();
      return publicUrl;
    } catch (e: any) {
      setBusy(false); setUploadingField(null); setUploadPct(null);
      toast.error(e?.message ?? "Yuklashda xato");
      return null;
    }
  }

  async function approveByPM() {
    if (await patch({}, "approved", "PM tasdiqladi")) {
      await notify("taminotchi", "Tasdiqlandi — yetkazib beruvchini tanlang");
    }
  }

  async function confirmReject() {
    if (!rejectReason.trim()) return toast.error("Rad etish sababini kiriting");
    setRejectOpen(false);
    await patch({ rejected_reason: rejectReason.trim() } as any, "rejected", `Rad etildi: ${rejectReason.trim()}`);
    setRejectReason("");
  }

  async function setOrdered() {
    if (!supplierName.trim()) return toast.error("Yetkazib beruvchini kiriting");
    const up = Number(unitPrice) || 0;
    if (up <= 0) return toast.error("Birim narxni kiriting");
    if (await patch({ supplier_name: supplierName.trim(), unit_price: up }, "ordered", `Buyurtma berildi: ${supplierName} · ${fmtUZS(up * Number(z.qty))}`)) {
      await notify("omborchi", "Material yo'lda — qabul qilishga tayyor turing");
    }
  }

  async function setDelivered(file: File, extra: { waybill_no: string; qty_received: number; waybill_received_at: string }) {
    const url = await uploadFile("waybill_url", file, {
      waybill_no: extra.waybill_no,
      qty_received: extra.qty_received,
      waybill_received_at: extra.waybill_received_at,
    });
    if (!url) return;
    await supabase.from("project_zayavka").update({ workflow_status: "delivered" }).eq("id", z.id);
    await logChange(z.workflow_status, "delivered", `Nakladnoy ${extra.waybill_no} · qabul ${extra.qty_received} ${z.unit}`);
    // Master ombor jadvaliga ham yozib qo'yamiz
    const { data: u } = await supabase.auth.getUser();
    await supabase.from("material_receipts").insert({
      project_id: z.project_id,
      material_name: z.name,
      qty: extra.qty_received,
      unit: z.unit,
      unit_price: Number(z.unit_price),
      total_price: extra.qty_received * Number(z.unit_price),
      supplier_name: z.supplier_name ?? null,
      waybill_url: url,
      received_at: extra.waybill_received_at,
      source: "procurement_web",
      source_note: `Sub-zayavka ${z.id.slice(0, 6)} · Nakladnoy ${extra.waybill_no}`,
      created_by: u?.user?.id ?? null,
    }).then(({ error }) => { if (error) console.warn("material_receipts:", error.message); });
    await notify("buxgalter", "Nakladnoy keldi — faktura yuklash kerak");
    onChanged();
  }

  async function setInvoiced(file: File) {
    const url = await uploadFile("invoice_url", file, {
      invoice_no: invoiceNo.trim() || null,
      invoice_date: new Date().toISOString().slice(0, 10),
    });
    if (!url) return;
    await supabase.from("project_zayavka").update({ workflow_status: "invoiced" }).eq("id", z.id);
    await logChange(z.workflow_status, "invoiced", `Faktura ${invoiceNo || "yuklandi"}`);
    await notify("direktor", "Faktura keldi — CEO tasdig'i kerak");
    onChanged();
  }

  async function ceoApprove() {
    await patch({
      ceo_status: "approved",
      ceo_at: new Date().toISOString(),
    } as any, z.workflow_status, "CEO tasdiqladi — to'lov chekini yuklang");
  }

  async function ceoReject() {
    await patch({
      ceo_status: "rejected",
      ceo_at: new Date().toISOString(),
    } as any, "rejected", "CEO rad etdi");
  }

  async function setPaid(file: File) {
    const url = await uploadFile("payment_proof_url", file, {
      paid_amount: Number(z.qty) * Number(z.unit_price),
      paid_at: new Date().toISOString().slice(0, 10),
    });
    if (!url) return;
    await supabase.from("project_zayavka").update({ workflow_status: "paid" }).eq("id", z.id);
    await logChange(z.workflow_status, "paid", `To'lov: ${fmtUZS(Number(z.qty) * Number(z.unit_price))}`);
    await notify("admin", "To'lov amalga oshirildi");
    onChanged();
  }

  const steps: Array<{ key: WStatus; date?: string | null; meta?: string }> = [
    { key: "pending_pm", date: z.created_at },
    { key: "approved", date: (z as any).approved_at },
    { key: "ordered", date: null, meta: z.supplier_name ?? undefined },
    { key: "delivered", date: z.waybill_received_at, meta: z.waybill_no ?? undefined },
    { key: "invoiced", date: z.invoice_date, meta: z.invoice_no ?? undefined },
    { key: "paid", date: z.paid_at, meta: z.paid_amount ? fmtUZS(Number(z.paid_amount)) : undefined },
  ];
  const FLOW: WStatus[] = ["pending_pm", "approved", "ordered", "delivered", "invoiced", "paid"];
  const currentIdx = FLOW.indexOf(z.workflow_status);

  const meta = STATUS_META[z.workflow_status] ?? STATUS_META.pending_pm;
  const StatusIcon = meta.icon;

  return (
    <div className="space-y-5 pt-4">
      {/* Header */}
      <Card className="p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="font-medium truncate">{z.name}</div>
            <div className="text-xs text-muted-foreground">
              {z.qty} {z.unit} × {fmtUZS(Number(z.unit_price))} = {fmtUZS(Number(z.qty) * Number(z.unit_price))}
              {z.needed_date ? (() => { const d = new Date(z.needed_date); return ` · kerak: ${String(d.getDate()).padStart(2,"0")}.${String(d.getMonth()+1).padStart(2,"0")}`; })() : ""}
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${meta.tone}`}>
            <StatusIcon className="h-3 w-3" /> {meta.label}
          </span>
        </div>
      </Card>

      {/* Timeline */}
      <div className="relative space-y-3 pl-6">
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border" />
        {steps.map((s, i) => {
          const m = STATUS_META[s.key]; const Icon = m.icon;
          const done = i <= currentIdx;
          const active = i === currentIdx;
          return (
            <div key={s.key} className="relative">
              <div className={`absolute -left-6 top-1.5 h-5 w-5 rounded-full border flex items-center justify-center ${
                done ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border"
              }`}>
                <Icon className="h-2.5 w-2.5" />
              </div>
              <div className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${active ? "border-primary bg-primary/5" : "border-border bg-card"}`}>
                <div className="text-sm">
                  <div className="font-medium">{m.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {s.date ? new Date(s.date).toLocaleString() : "—"}
                    {s.meta ? ` · ${s.meta}` : ""}
                  </div>
                </div>
                {!done && i === currentIdx + 1 && <Clock className="h-3 w-3 text-muted-foreground" />}
              </div>
            </div>
          );
        })}
      </div>

      {/* Actions panel */}
      <div className="space-y-2 rounded-lg border bg-card p-3">
        <div className="text-xs font-medium text-muted-foreground">Keyingi qadam</div>

        {z.workflow_status === "pending_pm" && (
          <div className="space-y-2">
            <div className="rounded-md border bg-muted/30 p-2 text-xs text-muted-foreground">
              PM tasdiqi olib tashlangan. Bu eski yozuv — bir tugma bilan ta'minotga o'tkazing.
            </div>
            <Button className="w-full" disabled={busy} onClick={approveByPM}>
              <CheckCircle2 className="h-4 w-4" /> Ta'minotga o'tkazish
            </Button>
          </div>
        )}

        {z.workflow_status === "approved" && (
          <div className="space-y-2">
            <Input placeholder="Yetkazib beruvchi nomi *" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
            <Input placeholder="Birim narx *" type="number" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)} />
            <UploadField label="Shartnoma yuklash (ixtiyoriy)" icon={FileText} disabled={busy} progress={uploadingField === "contract_url" ? uploadPct : null} onPick={(f) => uploadFile("contract_url", f)} />
            <Button className="w-full gap-1" disabled={busy} onClick={setOrdered}>
              <ShoppingCart className="h-4 w-4" /> Buyurtma berildi
            </Button>
          </div>
        )}

        {z.workflow_status === "ordered" && (
          <DeliveryDialog
            plannedQty={Number(z.qty)}
            unit={z.unit}
            alreadyReceived={Number(z.qty_received ?? 0)}
            busy={busy}
            progress={uploadingField === "waybill_url" ? uploadPct : null}
            onSubmit={setDelivered}
          />
        )}

        {z.workflow_status === "delivered" && (
          <div className="space-y-2">
            <Input placeholder="Faktura № (ixtiyoriy)" value={invoiceNo} onChange={(e) => setInvoiceNo(e.target.value)} />
            <UploadField label="Faktura yuklash *" icon={Receipt} disabled={busy} progress={uploadingField === "invoice_url" ? uploadPct : null} onPick={setInvoiced} />
          </div>
        )}

        {z.workflow_status === "invoiced" && (
          z.ceo_status === "approved" ? (
            <UploadField label="To'lov cheki yuklash" icon={Wallet} disabled={busy} progress={uploadingField === "payment_proof_url" ? uploadPct : null} onPick={setPaid} />
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={busy} onClick={ceoApprove}><CheckCircle2 className="h-4 w-4" /> CEO tasdiqlash</Button>
              <Button variant="outline" disabled={busy} onClick={ceoReject}><XCircle className="h-4 w-4" /> CEO rad etish</Button>
            </div>
          )
        )}

        {z.workflow_status === "paid" && (
          <div className="rounded-md bg-success/10 px-3 py-2 text-center text-sm text-success">
            ✓ Yakunlandi
          </div>
        )}

        {z.workflow_status === "rejected" && (
          <div className="rounded-md bg-destructive/10 px-3 py-2 text-center text-sm text-destructive">
            Rad etilgan
          </div>
        )}
      </div>

      {/* Files */}
      {(z.contract_url || z.waybill_url || z.invoice_url || z.payment_proof_url) && (
        <div className="space-y-1 text-xs">
          {z.contract_url && <a href={z.contract_url} target="_blank" rel="noreferrer" className="block text-primary underline">📑 Shartnoma</a>}
          {z.waybill_url && <a href={z.waybill_url} target="_blank" rel="noreferrer" className="block text-primary underline">📄 Nakladnoy {z.waybill_no ? `№ ${z.waybill_no}` : ""}</a>}
          {z.invoice_url && <a href={z.invoice_url} target="_blank" rel="noreferrer" className="block text-primary underline">🧾 Faktura {z.invoice_no ? `№ ${z.invoice_no}` : ""}</a>}
          {z.payment_proof_url && <a href={z.payment_proof_url} target="_blank" rel="noreferrer" className="block text-primary underline">💳 To'lov cheki</a>}
        </div>
      )}

      {/* History */}
      <div className="space-y-2 rounded-lg border bg-card p-3">
        <div className="text-xs font-medium text-muted-foreground">O'zgarishlar tarixi</div>
        {logs.length === 0 ? (
          <div className="text-xs text-muted-foreground">Hali yozuv yo'q.</div>
        ) : (
          <ul className="space-y-1.5">
            {logs.map((l) => {
              const fromMeta = l.from_status ? STATUS_META[l.from_status] : null;
              const toMeta = STATUS_META[l.to_status] ?? STATUS_META.pending_pm;
              return (
                <li key={l.id} className="flex items-start gap-2 text-xs">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      {fromMeta && <span className="text-muted-foreground">{fromMeta.label}</span>}
                      {fromMeta && <span className="text-muted-foreground">→</span>}
                      <span className="font-medium">{toMeta.label}</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">{new Date(l.created_at).toLocaleString()}</span>
                    </div>
                    {l.note && <div className="text-muted-foreground">{l.note}</div>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Zayavkani rad etish</DialogTitle></DialogHeader>
          <Textarea placeholder="Rad etish sababini yozing..." value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} rows={4} />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Bekor</Button>
            <Button variant="destructive" onClick={confirmReject} disabled={busy || !rejectReason.trim()}>
              <XCircle className="h-4 w-4" /> Rad etish
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UploadField({ label, icon: Icon, onPick, disabled, progress }: { label: string; icon: any; onPick: (f: File) => void; disabled?: boolean; progress?: number | null }) {
  const isUploading = progress !== null && progress !== undefined;
  return (
    <div className="space-y-1.5">
      <label className={`flex w-full cursor-pointer items-center justify-center gap-2 rounded-md border border-dashed border-primary/40 bg-primary/5 px-3 py-3 text-sm text-primary hover:bg-primary/10 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
        <Icon className="h-4 w-4" />
        <span>{isUploading ? `Yuklanmoqda… ${progress}%` : label}</span>
        {!isUploading && <Upload className="h-4 w-4" />}
        <input type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); }} />
      </label>
      {isUploading && (
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
          <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}
    </div>
  );
}

function DeliveryDialog({
  plannedQty, unit, alreadyReceived, busy, progress, onSubmit,
}: {
  plannedQty: number;
  unit: string | null;
  alreadyReceived: number;
  busy?: boolean;
  progress?: number | null;
  onSubmit: (file: File, extra: { waybill_no: string; qty_received: number; waybill_received_at: string }) => Promise<void> | void;
}) {
  const [open, setOpen] = useState(false);
  const [waybillNo, setWaybillNo] = useState("");
  const [qty, setQty] = useState<string>(String(Math.max(0, plannedQty - alreadyReceived) || plannedQty));
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirmOver, setConfirmOver] = useState(false);

  const remaining = Math.max(0, plannedQty - alreadyReceived);
  const isUploading = progress !== null && progress !== undefined;

  function validate() {
    const e: Record<string, string> = {};
    const wn = waybillNo.trim();
    if (!wn) e.waybillNo = "Nakladnoy raqamini kiriting";
    else if (wn.length > 50) e.waybillNo = "50 belgidan oshmasin";

    const qn = Number(qty);
    if (!qty.trim()) e.qty = "Qabul miqdorini kiriting";
    else if (Number.isNaN(qn) || qn <= 0) e.qty = "Miqdor 0 dan katta bo'lsin";
    else if (qn > remaining + 0.0001 && !confirmOver) e.qty = `Rejadan oshmoqda (qoldiq: ${remaining} ${unit ?? ""})`;

    if (!date) e.date = "Sanani tanlang";
    else if (new Date(date) > new Date(new Date().toISOString().slice(0, 10))) e.date = "Kelajakdagi sana bo'lmasin";

    if (!file) e.file = "Fayl tanlang";
    else if (!(file.type.startsWith("image/") || file.type === "application/pdf")) e.file = "PDF yoki rasm";
    else if (file.size > 15 * 1024 * 1024) e.file = "15 MB dan oshmasin";

    setErrors(e);
    return Object.keys(e).length === 0 ? { waybill_no: wn, qty_received: qn, waybill_received_at: date } : null;
  }

  async function handleSubmit() {
    const v = validate();
    if (!v || !file) { toast.error("Validatsiya xatolari mavjud"); return; }
    await onSubmit(file, v);
    setOpen(false);
    setWaybillNo(""); setQty(""); setFile(null); setErrors({}); setConfirmOver(false);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) setOpen(v); }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full gap-2 border-dashed border-primary/40 bg-primary/5 text-primary hover:bg-primary/10" disabled={busy}>
          <Truck className="h-4 w-4" /> Nakladnoy + qabul kiritish
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Yetkazildi — nakladnoy va qabul</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
            Reja: <b className="text-foreground">{plannedQty} {unit ?? ""}</b>
            {" · "}Qabul: <b className="text-foreground">{alreadyReceived}</b>
            {" · "}Qoldiq: <b className="text-foreground">{remaining}</b>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium">Nakladnoy № <span className="text-destructive">*</span></label>
            <Input value={waybillNo} onChange={(e) => setWaybillNo(e.target.value)} placeholder="NK-001/2026" maxLength={50}
              className={errors.waybillNo ? "border-destructive" : ""} />
            {errors.waybillNo && <p className="mt-1 text-xs text-destructive">{errors.waybillNo}</p>}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium">Qabul miqdori ({unit ?? "-"}) *</label>
              <Input type="number" step="any" min={0} value={qty} onChange={(e) => setQty(e.target.value)}
                className={errors.qty ? "border-destructive" : ""} />
              {errors.qty && <p className="mt-1 text-xs text-destructive">{errors.qty}</p>}
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium">Sana</label>
              <Input type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)}
                className={errors.date ? "border-destructive" : ""} />
              {errors.date && <p className="mt-1 text-xs text-destructive">{errors.date}</p>}
            </div>
          </div>

          {Number(qty) > remaining + 0.0001 && (
            <label className="flex items-start gap-2 rounded-md border border-warning/40 bg-warning/10 p-2 text-xs">
              <input type="checkbox" checked={confirmOver} onChange={(e) => setConfirmOver(e.target.checked)} className="mt-0.5" />
              <span>Rejadan oshishga ruxsat (qoldiq: {remaining} {unit ?? ""})</span>
            </label>
          )}

          <div>
            <label className="mb-1 block text-xs font-medium">Nakladnoy fayli *</label>
            <input type="file" accept="image/*,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className={`block w-full text-sm ${errors.file ? "text-destructive" : ""}`} />
            {file && !errors.file && <p className="mt-1 text-xs text-muted-foreground">{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}
            {errors.file && <p className="mt-1 text-xs text-destructive">{errors.file}</p>}
          </div>

          {isUploading && (
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Yuklanmoqda… {progress}%</div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Bekor</Button>
          <Button onClick={handleSubmit} disabled={busy} className="gap-2">
            <Truck className="h-4 w-4" /> Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
