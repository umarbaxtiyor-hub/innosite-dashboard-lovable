import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fmtUZS } from "@/lib/queries";
import { useActiveProject } from "@/lib/project-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Plus } from "lucide-react";
import { toast } from "sonner";

type Z = { id: string; name: string; unit: string; qty: number; unit_price: number; total: number; notes: string | null };
type Work = { id: string; work_type: string; qty_done: number; unit: string | null; unit_price: number; total_value: number | null; brigade_name: string | null; brigade_id: string | null; work_date: string };

export function WorkProgressView() {
  const { activeProjectId } = useActiveProject();
  const [plans, setPlans] = useState<Z[]>([]);
  const [works, setWorks] = useState<Work[]>([]);
  const [selected, setSelected] = useState<string | null>(null);

  async function load() {
    let plansQ = supabase.from("project_zayavka").select("id,name,unit,qty,unit_price,total,notes").eq("kind", "work").eq("status", "approved");
    let worksQ = supabase.from("work_progress").select("id,work_type,qty_done,unit,unit_price,total_value,brigade_name,brigade_id,work_date").order("work_date", { ascending: false });
    if (activeProjectId) {
      plansQ = plansQ.eq("project_id", activeProjectId);
      worksQ = worksQ.eq("project_id", activeProjectId);
    }
    const [z, w] = await Promise.all([plansQ, worksQ]);
    const ps = (z.data ?? []) as Z[];
    setPlans(ps);
    setWorks((w.data ?? []) as Work[]);
    if (!selected && ps.length) setSelected(ps[0].id);
  }
  useEffect(() => { load(); }, [activeProjectId]);

  const rows = useMemo(() => plans.map((p) => {
    const matched = works.filter((w) => w.work_type.toLowerCase() === p.name.toLowerCase());
    const factQty = matched.reduce((s, w) => s + Number(w.qty_done || 0), 0);
    const factValue = matched.reduce((s, w) => s + (Number(w.total_value) || Number(w.qty_done) * Number(w.unit_price) || 0), 0);
    const pct = p.qty > 0 ? Math.min(100, Math.round((factQty / Number(p.qty)) * 100)) : 0;
    return { ...p, factQty, factValue, pct, history: matched };
  }), [plans, works]);

  const current = rows.find((r) => r.id === selected) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex justify-end"><AddWorkPlanDialog onAdded={load} /></div>
      <div className="grid grid-cols-1 lg:grid-cols-[420px_1fr] gap-4">
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="px-4 py-2 text-xs uppercase text-muted-foreground border-b">Ish turlari ({rows.length})</div>
          <ul className="divide-y">
            {rows.map((r) => (
              <li key={r.id}>
                <button onClick={() => setSelected(r.id)} className={`w-full text-left px-4 py-3 hover:bg-muted/40 ${selected === r.id ? "bg-muted/60" : ""}`}>
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">{r.factQty}/{r.qty} {r.unit}</div>
                  </div>
                  <Progress value={r.pct} className="h-1.5 mt-2" />
                </button>
              </li>
            ))}
            {rows.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground text-center">Reja yo'q. "Master zayavka"dan qo'shing.</li>}
          </ul>
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-5">
          {!current ? (
            <div className="text-muted-foreground text-sm">Ish turini tanlang</div>
          ) : (
            <>
              <div>
                <h2 className="text-xl font-semibold">{current.name}</h2>
                {current.notes && <p className="text-sm text-muted-foreground mt-1">{current.notes}</p>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Reja" value={`${current.qty} ${current.unit}`} />
                <Stat label="Fakt" value={`${current.factQty} ${current.unit}`} />
                <Stat label="Reja summasi" value={fmtUZS(Number(current.total))} />
                <Stat label="Fakt summasi" value={fmtUZS(current.factValue)} highlight />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1 text-xs">
                  <span className="text-muted-foreground">Bajarildi</span>
                  <span className="font-medium">{current.pct}%</span>
                </div>
                <Progress value={current.pct} />
              </div>
              <div>
                <h3 className="text-sm font-semibold mb-2">Tarix</h3>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/40">
                        <TableHead>Sana</TableHead>
                        <TableHead>Brigada</TableHead>
                        <TableHead className="text-right">Miqdor</TableHead>
                        <TableHead className="text-right">Summa</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {current.history.map((w) => (
                        <TableRow key={w.id}>
                          <TableCell className="text-muted-foreground">{w.work_date}</TableCell>
                          <TableCell>{w.brigade_name ?? "—"}</TableCell>
                          <TableCell className="text-right">{Number(w.qty_done)} {w.unit}</TableCell>
                          <TableCell className="text-right">{fmtUZS(Number(w.total_value) || Number(w.qty_done) * Number(w.unit_price))}</TableCell>
                        </TableRow>
                      ))}
                      {current.history.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-4">Hali bajarilmagan</TableCell></TableRow>}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold ${highlight ? "text-primary" : ""}`}>{value}</div>
    </div>
  );
}

function AddWorkPlanDialog({ onAdded }: { onAdded: () => void }) {
  const { activeProjectId } = useActiveProject();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [unit, setUnit] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");

  async function save() {
    if (!activeProjectId) return toast.error("Loyiha tanlang");
    if (!name.trim() || !unit.trim()) return toast.error("Nom va birlikni kiriting");
    const total = (Number(qty) || 0) * (Number(price) || 0);
    const { error } = await supabase.from("project_zayavka").insert({
      project_id: activeProjectId, kind: "work", name: name.trim(), unit: unit.trim(),
      qty: Number(qty) || 0, unit_price: Number(price) || 0, status: "pending", notes: notes.trim() || null,
    });
    if (error) return toast.error(error.message);
    await supabase.from("variations").insert({
      project_id: activeProjectId, title: `[work] ${name.trim()}`,
      reason: notes.trim() || "Yangi ish turi",
      qty: Number(qty) || 0, unit: unit.trim(), amount: total, status: "Pending",
    });
    toast.success("Qo'shildi (ruxsat kutilmoqda)");
    setOpen(false); setName(""); setUnit(""); setQty(""); setPrice(""); setNotes("");
    onAdded();
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button disabled={!activeProjectId}><Plus className="h-4 w-4" /> Ish turi qo'shish</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Yangi ish turi (master zayavkaga)</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <Input placeholder="Ish turi nomi" value={name} onChange={(e) => setName(e.target.value)} />
          <div className="grid grid-cols-3 gap-2">
            <Input placeholder="Birlik" value={unit} onChange={(e) => setUnit(e.target.value)} />
            <Input placeholder="Abyom" type="number" value={qty} onChange={(e) => setQty(e.target.value)} />
            <Input placeholder="Birim narx" type="number" value={price} onChange={(e) => setPrice(e.target.value)} />
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
