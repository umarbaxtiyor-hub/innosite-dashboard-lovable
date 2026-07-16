import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUZS, fmtUZSc } from "@/lib/queries";
import { useActiveProject } from "@/lib/project-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Plus, Users, Pencil, Hammer, Wallet, Search, ChevronRight, ArrowLeft,
  WalletCards, TrendingUp, PieChart,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Brigade = { id: string; name: string; leader: string | null; phone: string | null; member_count: number | null; notes: string | null };
type Work = { id: string; brigade_id: string | null; work_type: string; qty_done: number; unit: string | null; unit_price: number; total_value: number | null; work_date: string };
type Pay = { id: string; brigade_id: string; amount: number; kind: string; payment_date: string; note: string | null };

const AVATAR_TINTS = [
  "bg-sky-100 text-sky-700",
  "bg-emerald-100 text-emerald-700",
  "bg-orange-100 text-orange-700",
  "bg-violet-100 text-violet-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
  "bg-amber-100 text-amber-700",
  "bg-fuchsia-100 text-fuchsia-700",
];
function avatarTint(name: string) {
  let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return AVATAR_TINTS[h % AVATAR_TINTS.length];
}

export function BrigadesView() {
  const { activeProjectId } = useActiveProject();
  const [brigades, setBrigades] = useState<Brigade[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function load() {
    let workQ = supabase.from("work_progress").select("id,brigade_id,work_type,qty_done,unit,unit_price,total_value,work_date");
    let payQ = supabase.from("brigade_payments").select("id,brigade_id,amount,kind,payment_date,note");
    if (activeProjectId) {
      workQ = workQ.eq("project_id", activeProjectId);
      payQ = payQ.eq("project_id", activeProjectId);
    }
    const [b, w, p] = await Promise.all([
      supabase.from("brigades").select("id,name,leader,phone,member_count,notes").order("name"),
      workQ,
      payQ,
    ]);
    setBrigades((b.data ?? []) as Brigade[]);
    setWorks((w.data ?? []) as Work[]);
    setPays((p.data ?? []) as Pay[]);
  }
  useEffect(() => { load(); }, [activeProjectId]);

  const rows = useMemo(() => brigades.map((br) => {
    const earned = works.filter((x) => x.brigade_id === br.id)
      .reduce((s, x) => s + (Number(x.total_value) || Number(x.qty_done) * Number(x.unit_price) || 0), 0);
    const paid = pays.filter((x) => x.brigade_id === br.id).reduce((s, x) => s + Number(x.amount || 0), 0);
    return { ...br, earned, paid, balance: earned - paid };
  }), [brigades, works, pays]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      r.name.toLowerCase().includes(s) ||
      (r.leader ?? "").toLowerCase().includes(s) ||
      (r.phone ?? "").toLowerCase().includes(s),
    );
  }, [rows, q]);

  const totals = useMemo(() => {
    const earned = rows.reduce((s, r) => s + r.earned, 0);
    const paid = rows.reduce((s, r) => s + r.paid, 0);
    const debt = rows.reduce((s, r) => s + (r.balance > 0 ? r.balance : 0), 0);
    return { count: rows.length, earned, paid, debt };
  }, [rows]);

  const current = rows.find((r) => r.id === selected) ?? null;
  const currentWorks = current
    ? works.filter((w) => w.brigade_id === current.id).slice().sort((a, b) => (b.work_date || "").localeCompare(a.work_date || ""))
    : [];
  const currentPays = current
    ? pays.filter((p) => p.brigade_id === current.id).slice().sort((a, b) => (b.payment_date || "").localeCompare(a.payment_date || ""))
    : [];

  if (current) {
    return (
      <BrigadeDetail
        brigade={current}
        works={currentWorks}
        pays={currentPays}
        projectId={activeProjectId}
        onBack={() => setSelected(null)}
        onChanged={load}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* 4 KPI kartalar */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4">
        <StatTile tone="blue" icon={Users} label="Brigadalar" value={String(totals.count)} />
        <StatTile tone="green" icon={WalletCards} label="Bajarilgan" value={fmtUZSc(totals.earned)} />
        <StatTile tone="violet" icon={TrendingUp} label="To'langan" value={fmtUZSc(totals.paid)} />
        <StatTile tone="orange" icon={PieChart} label="Qarzdorlik" value={fmtUZSc(totals.debt)} />
      </div>

      {/* Search + Add + Work + Payment */}
      <div className="flex flex-row items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish..." className="h-11 rounded-2xl pl-10" />
        </div>
        <AddBrigadeDialog onAdded={load} />
        <PickBrigadeWorkDialog brigades={rows} projectId={activeProjectId} onAdded={load} />
        <PickBrigadePaymentDialog brigades={rows} projectId={activeProjectId} onAdded={load} />
      </div>

      {/* Brigadalar ro'yxati */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Brigadalar yo'q</div>
        ) : (
          <ul className="divide-y">
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelected(r.id)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40 sm:px-4"
                >
                  <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold", avatarTint(r.name))}>
                    {r.name.trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{r.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.leader ?? "—"} · {r.member_count ?? 0} a'zo</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      Bajardi: {fmtUZSc(r.earned)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] uppercase text-muted-foreground">Balans</div>
                    <div className={cn("text-sm font-bold tabular-nums", r.balance <= 0 ? "text-emerald-600" : "text-rose-600")}>
                      {fmtUZSc(r.balance)}
                    </div>
                  </div>
                  <ChevronRight className="ml-1 h-4 w-4 shrink-0 text-muted-foreground/60" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ===== Stat tile =====
const TONES: Record<string, { card: string; icon: string }> = {
  blue:   { card: "bg-sky-50 dark:bg-sky-500/10 border-sky-200/60 dark:border-sky-500/20",                 icon: "bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300" },
  green:  { card: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/20", icon: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300" },
  violet: { card: "bg-violet-50 dark:bg-violet-500/10 border-violet-200/60 dark:border-violet-500/20",     icon: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300" },
  orange: { card: "bg-orange-50 dark:bg-orange-500/10 border-orange-200/60 dark:border-orange-500/20",     icon: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300" },
};
function StatTile({ tone, icon: Icon, label, value }: { tone: keyof typeof TONES; icon: any; label: string; value: string }) {
  const t = TONES[tone];
  return (
    <div className={cn("rounded-2xl border p-3 sm:p-4", t.card)}>
      <div className={cn("flex h-9 w-9 items-center justify-center rounded-full sm:h-10 sm:w-10", t.icon)}>
        <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
      </div>
      <div className="mt-2 text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-extrabold tabular-nums leading-tight tracking-tight sm:text-xl">{value}</div>
    </div>
  );
}

// ===== Detail view =====
function BrigadeDetail({
  brigade, works, pays, projectId, onBack, onChanged,
}: {
  brigade: Brigade & { earned: number; paid: number; balance: number };
  works: Work[]; pays: Pay[]; projectId: string | null;
  onBack: () => void; onChanged: () => void;
}) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft className="mr-1 h-4 w-4" /> Orqaga
      </Button>

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold", avatarTint(brigade.name))}>
            {brigade.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold">{brigade.name}</div>
            <div className="text-sm text-muted-foreground">
              {brigade.leader ?? "—"} · {brigade.phone ?? "—"} · {brigade.member_count ?? 0} a'zo
            </div>
          </div>
        </div>

        {brigade.notes && (
          <div className="mt-3 rounded-md bg-muted/40 p-3 text-sm">
            <div className="text-xs text-muted-foreground mb-1">Izoh</div>
            {brigade.notes}
          </div>
        )}

        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <MiniStat label="Bajardi" value={fmtUZSc(brigade.earned)} />
          <MiniStat label="To'landi" value={fmtUZSc(brigade.paid)} />
          <MiniStat label="Balans" value={fmtUZSc(brigade.balance)} tone={brigade.balance <= 0 ? "ok" : "bad"} />
        </div>
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-4 py-2 text-xs uppercase text-muted-foreground border-b">Bajarilgan ishlar</div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Sana</TableHead><TableHead>Ish turi</TableHead>
                <TableHead className="text-right">Miqdor</TableHead><TableHead className="text-right">Jami</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {works.map((w) => (
                <TableRow key={w.id}>
                  <TableCell className="text-muted-foreground">{w.work_date}</TableCell>
                  <TableCell>{w.work_type}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(w.qty_done)} {w.unit ?? ""}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUZS(Number(w.total_value) || Number(w.qty_done) * Number(w.unit_price))}</TableCell>
                </TableRow>
              ))}
              {works.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Hali ish yo'q</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="rounded-2xl border bg-card overflow-hidden">
        <div className="px-4 py-2 text-xs uppercase text-muted-foreground border-b">To'lovlar</div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40">
                <TableHead>Sana</TableHead><TableHead>Tur</TableHead>
                <TableHead className="text-right">Summa</TableHead><TableHead>Izoh</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pays.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-muted-foreground">{p.payment_date}</TableCell>
                  <TableCell>{p.kind}</TableCell>
                  <TableCell className="text-right tabular-nums">{fmtUZS(Number(p.amount))}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">{p.note ?? "—"}</TableCell>
                </TableRow>
              ))}
              {pays.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">To'lovlar yo'q</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: "ok" | "bad" }) {
  return (
    <div className="rounded-xl border bg-background p-3">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className={cn("mt-0.5 text-sm font-bold tabular-nums leading-tight", tone === "ok" && "text-emerald-600", tone === "bad" && "text-rose-600")}>{value}</div>
    </div>
  );
}

function AddBrigadeDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [leader, setLeader] = useState("");
  const [phone, setPhone] = useState("");
  const [count, setCount] = useState("");
  const [notes, setNotes] = useState("");
  async function save() {
    if (!name.trim()) return toast.error("Nom kiriting");
    const { error } = await supabase.from("brigades").insert({
      name: name.trim(), leader: leader.trim() || null, phone: phone.trim() || null,
      member_count: Number(count) || 0, notes: notes.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Qo'shildi");
    setOpen(false); setName(""); setLeader(""); setPhone(""); setCount(""); setNotes("");
    onAdded();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="h-11 w-11 shrink-0 rounded-2xl" title="Brigada qo'shish"><Plus className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Yangi brigada</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Brigada nomi" value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Boshliq F.I.Sh" value={leader} onChange={(e) => setLeader(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input placeholder="A'zolar soni" type="number" value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <Textarea placeholder="Qo'shimcha izoh" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Bekor</Button>
          <Button onClick={save}>Saqlash</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditBrigadeDialog({ brigade, onSaved }: { brigade: Brigade; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [leader, setLeader] = useState(brigade.leader ?? "");
  const [phone, setPhone] = useState(brigade.phone ?? "");
  const [count, setCount] = useState(String(brigade.member_count ?? ""));
  const [notes, setNotes] = useState(brigade.notes ?? "");
  useEffect(() => {
    setLeader(brigade.leader ?? ""); setPhone(brigade.phone ?? "");
    setCount(String(brigade.member_count ?? "")); setNotes(brigade.notes ?? "");
  }, [brigade.id]);
  async function save() {
    const { error } = await supabase.from("brigades").update({
      leader: leader.trim() || null, phone: phone.trim() || null,
      member_count: Number(count) || 0, notes: notes.trim() || null,
    }).eq("id", brigade.id);
    if (error) return toast.error(error.message);
    toast.success("Yangilandi"); setOpen(false); onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{brigade.name} — tahrirlash</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Boshliq" value={leader} onChange={(e) => setLeader(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <Input placeholder="A'zolar" type="number" value={count} onChange={(e) => setCount(e.target.value)} />
          </div>
          <Textarea placeholder="Izoh" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Bekor</Button>
          <Button onClick={save}>Saqlash</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddBrigadeWorkDialog({ brigadeId, projectId, onSaved }: { brigadeId: string; projectId: string | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [workType, setWorkType] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("m²");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!projectId) return toast.error("Loyiha tanlanmagan");
    if (!workType.trim() || !qty || !price) return toast.error("Ish turi, miqdor va narxni kiriting");
    setBusy(true);
    const q = Number(qty), p = Number(price);
    const { error } = await supabase.from("work_progress").insert({
      project_id: projectId, brigade_id: brigadeId, work_type: workType.trim(),
      qty_done: q, unit, unit_price: p, total_value: q * p, work_date: date, source_note: note || null,
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Ish qo'shildi");
    setOpen(false); setWorkType(""); setQty(""); setPrice(""); setNote("");
    onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm"><Hammer className="h-4 w-4" /> Ish</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Bajarilgan ish</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Ish turi" value={workType} onChange={(e) => setWorkType(e.target.value)} />
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Miqdor" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            <Input placeholder="Birlik" value={unit} onChange={(e) => setUnit(e.target.value)} />
            <Input placeholder="Narx" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Textarea placeholder="Izoh" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Bekor</Button>
          <Button onClick={save} disabled={busy}>Saqlash</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddBrigadePayDialog({ brigadeId, projectId, onSaved }: { brigadeId: string; projectId: string | null; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState("avans");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  async function save() {
    if (!projectId) return toast.error("Loyiha tanlanmagan");
    if (!amount) return toast.error("Summa kiriting");
    setBusy(true);
    const { error } = await supabase.from("brigade_payments").insert({
      project_id: projectId, brigade_id: brigadeId, amount: Number(amount),
      kind, payment_date: date, note: note || null,
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("To'lov qo'shildi");
    setOpen(false); setAmount(""); setNote("");
    onSaved();
  }
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="secondary"><Wallet className="h-4 w-4" /> To'lov</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Brigada to'lovi</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Summa" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input placeholder="Tur (avans, oylik, ...)" value={kind} onChange={(e) => setKind(e.target.value)} />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Textarea placeholder="Izoh" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Bekor</Button>
          <Button onClick={save} disabled={busy}>Saqlash</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickBrigadePaymentDialog({
  brigades, projectId, onAdded,
}: { brigades: { id: string; name: string }[]; projectId: string | null; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [brigadeId, setBrigadeId] = useState<string>("");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState("avans");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!brigadeId) return toast.error("Brigadani tanlang");
    if (!projectId) return toast.error("Loyiha tanlanmagan");
    if (!amount) return toast.error("Summa kiriting");
    setBusy(true);
    const { error } = await supabase.from("brigade_payments").insert({
      project_id: projectId, brigade_id: brigadeId, amount: Number(amount),
      kind, payment_date: date, note: note || null,
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("To'lov qo'shildi");
    setOpen(false); setBrigadeId(""); setAmount(""); setNote("");
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="secondary" className="h-11 w-11 shrink-0 rounded-2xl" title="To'lov qilish"><Wallet className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Brigada to'lovi</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Brigada</div>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={brigadeId}
              onChange={(e) => setBrigadeId(e.target.value)}
            >
              <option value="">Tanlang...</option>
              {brigades.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <Input placeholder="Summa" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input placeholder="Tur (avans, oylik, ...)" value={kind} onChange={(e) => setKind(e.target.value)} />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Textarea placeholder="Izoh" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Bekor</Button>
          <Button onClick={save} disabled={busy}>Saqlash</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickBrigadeWorkDialog({
  brigades, projectId, onAdded,
}: { brigades: { id: string; name: string }[]; projectId: string | null; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [brigadeId, setBrigadeId] = useState<string>("");
  const [workType, setWorkType] = useState("");
  const [qty, setQty] = useState("");
  const [unit, setUnit] = useState("m²");
  const [price, setPrice] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    if (!brigadeId) return toast.error("Brigadani tanlang");
    if (!projectId) return toast.error("Loyiha tanlanmagan");
    if (!workType.trim() || !qty || !price) return toast.error("Ish turi, miqdor va narxni kiriting");
    setBusy(true);
    const q = Number(qty), p = Number(price);
    const { error } = await supabase.from("work_progress").insert({
      project_id: projectId, brigade_id: brigadeId, work_type: workType.trim(),
      qty_done: q, unit, unit_price: p, total_value: q * p, work_date: date, source_note: note || null,
    } as any);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Ish qo'shildi");
    setOpen(false); setBrigadeId(""); setWorkType(""); setQty(""); setPrice(""); setNote("");
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="secondary" className="h-11 w-11 shrink-0 rounded-2xl" title="Ish qo'shish"><Hammer className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Bajarilgan ish</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Brigada</div>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={brigadeId}
              onChange={(e) => setBrigadeId(e.target.value)}
            >
              <option value="">Tanlang...</option>
              {brigades.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <Input placeholder="Ish turi" value={workType} onChange={(e) => setWorkType(e.target.value)} />
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Miqdor" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            <Input placeholder="Birlik" value={unit} onChange={(e) => setUnit(e.target.value)} />
            <Input placeholder="Narx" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Textarea placeholder="Izoh" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Bekor</Button>
          <Button onClick={save} disabled={busy}>Saqlash</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
