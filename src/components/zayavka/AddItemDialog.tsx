import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useActiveProject } from "@/lib/project-context";

type BoqOpt = { id: string; code: string | null; name: string; kind: string };

type Kind = "material" | "work" | "equipment";

export function AddItemDialog({
  onDone,
  fixedKind,
  offPlan: offPlanProp = false,
  triggerLabel,
  allowCategorySelect = false,
  triggerClassName,
}: {
  onDone: () => void;
  fixedKind?: Kind;
  offPlan?: boolean;
  triggerLabel?: string;
  allowCategorySelect?: boolean;
  triggerClassName?: string;
}) {
  const { activeProjectId } = useActiveProject();
  const [open, setOpen] = useState(false);
  // category: 'material' | 'work' | 'extra'
  const [category, setCategory] = useState<"material" | "work" | "extra">(
    offPlanProp ? "extra" : (fixedKind === "work" ? "work" : "material")
  );
  const [kind, setKind] = useState<Kind>(fixedKind ?? "material");
  const [name, setName] = useState("");
  const [unit, setUnit] = useState(fixedKind === "work" ? "m²" : "dona");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [boqOptions, setBoqOptions] = useState<BoqOpt[]>([]);
  const [linkedBoqId, setLinkedBoqId] = useState<string>("");

  const offPlan = offPlanProp || category === "extra";
  const effectiveKind: Kind = allowCategorySelect
    ? (category === "extra" ? kind : (category as Kind))
    : (fixedKind ?? kind);

  // BOQ (smeta) qatorlarini yuklab olish — yordamchi/qator yangi qo'shilganda ulash uchun
  useEffect(() => {
    if (!open || !activeProjectId) { setBoqOptions([]); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("project_zayavka")
        .select("id,name,kind")
        .eq("project_id", activeProjectId)
        .is("zayavka_no", null)
        .is("parent_id", null)
        .eq("off_plan", false)
        .order("name", { ascending: true })
        .limit(500);
      if (cancelled) return;
      const opts: BoqOpt[] = (data ?? []).map((r: any) => ({
        id: r.id, code: null, name: r.name, kind: r.kind,
      }));
      setBoqOptions(opts);
    })();
    return () => { cancelled = true; };
  }, [open, activeProjectId]);

  async function save() {
    if (!activeProjectId) return toast.error("Loyiha tanlanmagan");
    if (!name.trim() || !qty || !price) return toast.error("Nomi, hajm va narxni kiriting");
    setBusy(true);
    try {
      const q = Number(qty), p = Number(price);
      const payload: any = {
        project_id: activeProjectId,
        kind: effectiveKind,
        name: name.trim(),
        unit,
        qty: q,
        unit_price: p,
        status: offPlan ? "pending" : "approved",
        off_plan: offPlan,
      };
      if (linkedBoqId) {
        const linked = boqOptions.find((o) => o.id === linkedBoqId);
        if (linked) payload.notes = `BOQ: ${linked.name}${note ? ` — ${note}` : ""}${offPlan ? " (rejadan tashqari)" : ""}`;
      } else if (offPlan) {
        payload.notes = `Rejadan tashqari${note ? ` — ${note}` : ""}`;
      } else if (note) payload.notes = note;
      const { error } = await supabase.from("project_zayavka").insert(payload);
      if (error) throw error;
      toast.success("Qo'shildi");
      setOpen(false);
      setName(""); setQty(""); setPrice(""); setNote(""); setLinkedBoqId("");
      onDone();
    } catch (e: any) {
      toast.error(e?.message ?? "Xato");
    } finally {
      setBusy(false);
    }
  }

  const label = triggerLabel ?? (offPlanProp ? "Rejadan tashqari qo'shish" : "Qo'shish");
  const title = allowCategorySelect
    ? "Yangi qator qo'shish"
    : offPlanProp
    ? "Rejadan tashqari ish/material"
    : fixedKind === "work" ? "Yangi ish turi" : fixedKind === "material" ? "Yangi material" : "Yangi qator";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={triggerClassName ? "default" : "outline"} className={triggerClassName ?? "h-7 px-2 text-xs gap-1"} title={label}>
          <Plus className="h-3.5 w-3.5" /> {triggerLabel ?? "Qo'shish"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {allowCategorySelect && (
            <div>
              <Label className="text-xs">Kategoriya</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">📦 Material</SelectItem>
                  <SelectItem value="work">🔨 Ish turi</SelectItem>
                  <SelectItem value="extra">➕ Qo'shimcha (rejadan tashqari)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {allowCategorySelect && category === "extra" && (
            <div>
              <Label className="text-xs">Tur</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">📦 Material</SelectItem>
                  <SelectItem value="work">🔨 Ish turi</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          {!fixedKind && !allowCategorySelect && (
            <div>
              <Label className="text-xs">Tur</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as Kind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="material">📦 Material</SelectItem>
                  <SelectItem value="work">🔨 Ish turi</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div><Label className="text-xs">Nomi</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div><Label className="text-xs">Birlik</Label><Input value={unit} onChange={(e) => setUnit(e.target.value)} /></div>
            <div><Label className="text-xs">Hajm</Label><Input type="number" value={qty} onChange={(e) => setQty(e.target.value)} /></div>
            <div><Label className="text-xs">Narx</Label><Input type="number" value={price} onChange={(e) => setPrice(e.target.value)} /></div>
          </div>
          {boqOptions.length > 0 && (
            <div>
              <Label className="text-xs">BOQ smeta qatoriga ulash {offPlan && <span className="text-muted-foreground">(yordamchi uchun ixtiyoriy)</span>}</Label>
              <Select value={linkedBoqId || "__none"} onValueChange={(v) => setLinkedBoqId(v === "__none" ? "" : v)}>
                <SelectTrigger><SelectValue placeholder="— BOQ qatorini tanlang —" /></SelectTrigger>
                <SelectContent className="max-h-72">
                  <SelectItem value="__none">— ulash kerak emas —</SelectItem>
                  {boqOptions
                    .filter((o) => !effectiveKind || o.kind === effectiveKind)
                    .slice(0, 200)
                    .map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.kind === "material" ? "📦" : "🔨"} {o.name.length > 60 ? o.name.slice(0, 58) + "…" : o.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div><Label className="text-xs">Izoh</Label><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="ixtiyoriy" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Bekor</Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Qo'shish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
