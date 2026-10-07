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
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, UserPlus, Wallet, Users, WalletCards, TrendingUp, PieChart, Search, ChevronRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Employee = {
  id: string; full_name: string; position: string | null; phone: string | null;
  monthly_salary: number | null; active: boolean; notes: string | null;
};
type Pay = {
  id: string; employee_id: string; kind: "avans" | "bonus" | "oylik" | "boshqa";
  amount: number; payment_date: string; note: string | null;
};

const KIND_LABEL: Record<Pay["kind"], string> = {
  avans: "Avans", oylik: "Oylik", bonus: "Bonus", boshqa: "Boshqa",
};
const METHODS = ["Naqd", "Karta", "Bonus"] as const;

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

const isSalaryCat = (c: string) => {
  const s = (c || "").toLowerCase();
  return s.includes("oylik") || s.includes("ish haqi") || s.includes("avans") || s.includes("maosh") || s.includes("usta haqi");
};

export function EmployeesView() {
  const { activeProjectId } = useActiveProject();
  const [emps, setEmps] = useState<Employee[]>([]);
  const [pays, setPays] = useState<Pay[]>([]);
  const [umumiy, setUmumiy] = useState<number>(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [q, setQ] = useState("");

  async function fetchAll<T>(build: (from: number, to: number) => any, pageSize = 1000): Promise<T[]> {
    const out: T[] = []; let from = 0;
    while (true) {
      const to = from + pageSize - 1;
      const { data, error } = await build(from, to);
      if (error) break;
      const rows = (data ?? []) as T[];
      out.push(...rows);
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return out;
  }

  async function load() {
    const [e, p, exRows, bpRows] = await Promise.all([
      supabase.from("employees").select("*").eq("active", true).order("full_name"),
      supabase.from("employee_payments").select("id,employee_id,kind,amount,payment_date,note"),
      fetchAll<any>((from, to) => {
        const q = supabase.from("expenses").select("amount,category,project_id").range(from, to);
        return activeProjectId ? q.eq("project_id", activeProjectId) : q;
      }),
      fetchAll<any>((from, to) => {
        const q = supabase.from("brigade_payments").select("amount,project_id").range(from, to);
        return activeProjectId ? q.eq("project_id", activeProjectId) : q;
      }),
    ]);
    setEmps((e.data ?? []) as Employee[]);
    setPays((p.data ?? []) as Pay[]);
    const salarySum = exRows.reduce((s: number, r: any) => s + (isSalaryCat(String(r.category)) ? Number(r.amount) || 0 : 0), 0);
    const brigSum = bpRows.reduce((s: number, r: any) => s + (Number(r.amount) || 0), 0);
    setUmumiy(salarySum + brigSum);
  }
  useEffect(() => { load(); }, [activeProjectId]);

  const rows = useMemo(() => emps.map((emp) => {
    const paid = pays.filter((x) => x.employee_id === emp.id).reduce((s, x) => s + Number(x.amount || 0), 0);
    const salary = Number(emp.monthly_salary || 0);
    return { ...emp, paid, balance: salary - paid };
  }), [emps, pays]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) =>
      r.full_name.toLowerCase().includes(s) ||
      (r.position ?? "").toLowerCase().includes(s) ||
      (r.phone ?? "").toLowerCase().includes(s),
    );
  }, [rows, q]);

  const totals = useMemo(() => {
    const fond = rows.reduce((s, r) => s + Number(r.monthly_salary || 0), 0);
    const paid = rows.reduce((s, r) => s + r.paid, 0);
    const debt = rows.reduce((s, r) => s + (r.balance > 0 ? r.balance : 0), 0);
    return { count: rows.length, fond, paid, debt };
  }, [rows]);

  const current = rows.find((r) => r.id === selected) ?? null;

  if (current) {
    return (
      <EmployeeDetail
        emp={current}
        pays={pays.filter((p) => p.employee_id === current.id)}
        onBack={() => setSelected(null)}
        projectId={activeProjectId}
        onChanged={load}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* 4 KPI kartalar */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 sm:grid-cols-4">
        <StatTile tone="blue" icon={Users} label="Jami xodimlar" value={String(totals.count)} />
        <StatTile tone="green" icon={WalletCards} label="Oylik fond" value={fmtUZSc(totals.fond)} />
        <StatTile tone="violet" icon={TrendingUp} label="To'langan" value={fmtUZSc(totals.paid)} />
        <StatTile tone="orange" icon={PieChart} label="Qarzdorlik" value={fmtUZSc(totals.debt)} />
      </div>

      {/* Search + Add + Payment */}
      <div className="flex flex-row items-center gap-2">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Qidirish..." className="h-11 rounded-2xl pl-10" />
        </div>
        <AddEmployeeDialog onAdded={load} />
        <PickEmployeePaymentDialog employees={rows} projectId={activeProjectId} onAdded={load} />
      </div>

      {/* Umumiy — jami xodimlar xarajati (kelajakda alohida xodimlar qo'shiladi) */}
      <div className="rounded-2xl border bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-500/10 dark:to-teal-500/10 border-emerald-200/60 dark:border-emerald-500/20 p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 text-lg font-bold">
            U
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold">Umumiy</div>
            <div className="text-xs text-muted-foreground">Jami xodimlar xarajati</div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-[10px] uppercase text-muted-foreground">Summa</div>
            <div className="text-base font-extrabold tabular-nums text-emerald-700 dark:text-emerald-400">{fmtUZSc(umumiy)}</div>
          </div>
        </div>
      </div>

      {/* Xodimlar ro'yxati */}
      <div className="rounded-2xl border bg-card overflow-hidden">
        {filtered.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">Xodim qo'shilmagan. Yangi xodim qo'shish uchun yuqoridagi tugmani bosing.</div>
        ) : (
          <ul className="divide-y">
            {filtered.map((r) => (
              <li key={r.id}>
                <button
                  onClick={() => setSelected(r.id)}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition-colors hover:bg-muted/40 sm:px-4"
                >
                  <div className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold", avatarTint(r.full_name))}>
                    {r.full_name.trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[15px] font-semibold">{r.full_name}</div>
                    <div className="truncate text-xs text-muted-foreground">{r.position ?? "—"}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      Oylik: {fmtUZSc(Number(r.monthly_salary || 0))}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[10px] uppercase text-muted-foreground">Balans</div>
                    <div className={cn("text-sm font-bold tabular-nums", r.balance >= 0 ? "text-emerald-600" : "text-rose-600")}>
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
  blue:   { card: "bg-sky-50 dark:bg-sky-500/10 border-sky-200/60 dark:border-sky-500/20",         icon: "bg-sky-100 text-sky-600 dark:bg-sky-500/20 dark:text-sky-300" },
  green:  { card: "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200/60 dark:border-emerald-500/20", icon: "bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-300" },
  violet: { card: "bg-violet-50 dark:bg-violet-500/10 border-violet-200/60 dark:border-violet-500/20", icon: "bg-violet-100 text-violet-600 dark:bg-violet-500/20 dark:text-violet-300" },
  orange: { card: "bg-orange-50 dark:bg-orange-500/10 border-orange-200/60 dark:border-orange-500/20", icon: "bg-orange-100 text-orange-600 dark:bg-orange-500/20 dark:text-orange-300" },
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
function EmployeeDetail({ emp, pays, onBack, projectId, onChanged }:
  { emp: ReturnType<typeof Object> & any; pays: Pay[]; onBack: () => void; projectId: string | null; onChanged: () => void }) {
  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
        <ArrowLeft className="mr-1 h-4 w-4" /> Orqaga
      </Button>

      <div className="rounded-2xl border bg-card p-4">
        <div className="flex items-start gap-3">
          <div className={cn("flex h-14 w-14 items-center justify-center rounded-full text-xl font-bold", avatarTint(emp.full_name))}>
            {emp.full_name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-lg font-bold">{emp.full_name}</div>
            <div className="text-sm text-muted-foreground">{emp.position ?? "—"} · {emp.phone ?? ""}</div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-3">
          <MiniStat label="Oylik" value={fmtUZSc(Number(emp.monthly_salary || 0))} />
          <MiniStat label="To'langan" value={fmtUZSc(emp.paid)} />
          <MiniStat label="Balans" value={fmtUZSc(emp.balance)} tone={emp.balance >= 0 ? "ok" : "bad"} />
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border bg-card">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40">
              <TableHead>Sana</TableHead>
              <TableHead>Tur</TableHead>
              <TableHead className="text-right">Summa</TableHead>
              <TableHead>Izoh</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pays.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="text-muted-foreground">{p.payment_date}</TableCell>
                <TableCell>{KIND_LABEL[p.kind] ?? p.kind}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">{fmtUZS(Number(p.amount))}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{p.note ?? "—"}</TableCell>
              </TableRow>
            ))}
            {pays.length === 0 && (
              <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-6">To'lovlar yo'q</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
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

function AddEmployeeDialog({ onAdded }: { onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("");
  const [phone, setPhone] = useState("");
  const [salary, setSalary] = useState("");
  const [notes, setNotes] = useState("");

  async function save() {
    if (!name.trim()) return toast.error("Ism familyani kiriting");
    const { error } = await supabase.from("employees").insert({
      full_name: name.trim(),
      position: position.trim() || null,
      phone: phone.trim() || null,
      monthly_salary: Number(salary) || 0,
      notes: notes.trim() || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Xodim qo'shildi");
    setOpen(false); setName(""); setPosition(""); setPhone(""); setSalary(""); setNotes("");
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" className="h-11 w-11 shrink-0 rounded-2xl" title="Xodim qo'shish"><UserPlus className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Yangi xodim</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Ism familya" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-2 gap-2">
            <Input placeholder="Lavozimi" value={position} onChange={(e) => setPosition(e.target.value)} />
            <Input placeholder="Telefon" value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <Input placeholder="Oylik" type="number" value={salary} onChange={(e) => setSalary(e.target.value)} />
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

function AddPaymentDialog({
  employeeId, projectId, onAdded,
}: { employeeId: string; projectId: string | null; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Pay["kind"]>("avans");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("Naqd");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  async function save() {
    const amt = Number(amount);
    if (!amt) return toast.error("Summani kiriting");
    const noteFinal = `${method}${note.trim() ? " · " + note.trim() : ""}`;
    const { error } = await supabase.from("employee_payments").insert({
      employee_id: employeeId,
      project_id: projectId,
      kind, amount: amt, payment_date: date, note: noteFinal,
    });
    if (error) return toast.error(error.message);
    toast.success("To'lov qo'shildi");
    setOpen(false); setAmount(""); setNote("");
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm"><Wallet className="h-4 w-4" /> To'lov</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Xodimga to'lov</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Tur</div>
              <Select value={kind} onValueChange={(v) => setKind(v as Pay["kind"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as Pay["kind"][]).map((k) => (
                    <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">To'lov turi</div>
              <Select value={method} onValueChange={(v) => setMethod(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Input type="number" placeholder="Summa" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input placeholder="Izoh" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Bekor</Button>
          <Button onClick={save}><Plus className="h-4 w-4" /> Saqlash</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PickEmployeePaymentDialog({
  employees, projectId, onAdded,
}: { employees: { id: string; full_name: string }[]; projectId: string | null; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>("");
  const [kind, setKind] = useState<Pay["kind"]>("avans");
  const [method, setMethod] = useState<(typeof METHODS)[number]>("Naqd");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));

  async function save() {
    if (!employeeId) return toast.error("Xodimni tanlang");
    const amt = Number(amount);
    if (!amt) return toast.error("Summani kiriting");
    const noteFinal = `${method}${note.trim() ? " · " + note.trim() : ""}`;
    const { error } = await supabase.from("employee_payments").insert({
      employee_id: employeeId, project_id: projectId, kind, amount: amt, payment_date: date, note: noteFinal,
    });
    if (error) return toast.error(error.message);
    toast.success("To'lov qo'shildi");
    setOpen(false); setEmployeeId(""); setAmount(""); setNote("");
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="icon" variant="secondary" className="h-11 w-11 shrink-0 rounded-2xl" title="To'lov qilish"><Wallet className="h-4 w-4" /></Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Xodimga to'lov</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <div className="mb-1 text-xs text-muted-foreground">Xodim</div>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Tanlang..." /></SelectTrigger>
              <SelectContent>
                {employees.map((e) => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">Tur</div>
              <Select value={kind} onValueChange={(v) => setKind(v as Pay["kind"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(KIND_LABEL) as Pay["kind"][]).map((k) => (
                    <SelectItem key={k} value={k}>{KIND_LABEL[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <div className="mb-1 text-xs text-muted-foreground">To'lov turi</div>
              <Select value={method} onValueChange={(v) => setMethod(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Input type="number" placeholder="Summa" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <Input placeholder="Izoh" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Bekor</Button>
          <Button onClick={save}><Plus className="h-4 w-4" /> Saqlash</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
