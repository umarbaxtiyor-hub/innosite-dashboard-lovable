import { useEffect, useState } from "react";
import { Ruler, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Unit = { id: string; name: string };

export function ExpenseUnitsSettings() {
  const [items, setItems] = useState<Unit[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("expense_units")
      .select("id, name")
      .order("name");
    if (error) toast.error(error.message);
    setItems((data ?? []) as Unit[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    const n = name.trim();
    if (!n) return;
    setAdding(true);
    const { error } = await supabase.from("expense_units").insert({ name: n });
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    setName("");
    toast.success("Birlik qo'shildi");
    load();
  }

  async function del(id: string, n: string) {
    if (!confirm(`"${n}" birligi o'chirilsinmi?`)) return;
    const { error } = await supabase.from("expense_units").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("O'chirildi");
    load();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Ruler className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Jurnal — Birliklar (o'lchov)</h3>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Kunlik xarajatlar uchun ishlatiladigan birlik ro'yxati (dona, kg, m², litr...). Qo'shish va o'chirish mumkin.
      </p>

      <div className="mb-4 flex gap-2">
        <Input placeholder="Birlik nomi (masalan: dona, kg, m²)" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <Button onClick={add} disabled={adding || !name.trim()}>
          {adding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Qo'shish
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Hech qanday birlik yo'q. Yuqoridan qo'shing.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((c) => (
            <div key={c.id} className="group flex items-center gap-2 rounded-full border border-border bg-muted/40 py-1.5 pl-3 pr-1 text-sm">
              <span>{c.name}</span>
              <button
                onClick={() => del(c.id, c.name)}
                className="rounded-full p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                title="O'chirish"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
