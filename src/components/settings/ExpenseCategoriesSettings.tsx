import { useEffect, useState } from "react";
import { Tag, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Category = { id: string; name: string; icon: string | null };

const SUGGESTED_EMOJIS: { emoji: string; label: string }[] = [
  { emoji: "🛒", label: "Oziq-ovqat" },
  { emoji: "⛽", label: "Yoqilg'i" },
  { emoji: "🚚", label: "Transport" },
  { emoji: "🔧", label: "Ta'mirlash" },
  { emoji: "📦", label: "Materiallar" },
  { emoji: "🧱", label: "Qurilish" },
  { emoji: "🛠️", label: "Asbob-uskuna" },
  { emoji: "👷", label: "Ish haqi" },
  { emoji: "💡", label: "Kommunal" },
  { emoji: "📱", label: "Aloqa" },
  { emoji: "🏢", label: "Ofis" },
  { emoji: "📄", label: "Hujjatlar" },
  { emoji: "🧾", label: "Soliq" },
  { emoji: "🏦", label: "Bank" },
  { emoji: "💰", label: "Boshqa to'lov" },
  { emoji: "🎁", label: "Sovg'a" },
  { emoji: "🍽️", label: "Mehmondorchilik" },
  { emoji: "✈️", label: "Safar" },
  { emoji: "🏥", label: "Tibbiyot" },
  { emoji: "📚", label: "Ta'lim" },
];

export function ExpenseCategoriesSettings() {
  const [items, setItems] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const [adding, setAdding] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("expense_categories")
      .select("id, name, icon")
      .order("name");
    if (error) toast.error(error.message);
    setItems((data ?? []) as Category[]);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function add() {
    const n = name.trim();
    if (!n) return;
    setAdding(true);
    const { error } = await supabase.from("expense_categories").insert({ name: n, icon: icon.trim() || null });
    setAdding(false);
    if (error) { toast.error(error.message); return; }
    setName(""); setIcon("");
    toast.success("Kategoriya qo'shildi");
    load();
  }

  async function del(id: string, n: string) {
    if (!confirm(`"${n}" kategoriyasini o'chirilsinmi?`)) return;
    const { error } = await supabase.from("expense_categories").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("O'chirildi");
    load();
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Tag className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Jurnal — Xarajat kategoriyalari</h3>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        AI jurnal yozuvlari uchun ishlatiladigan xarajat kategoriyalari. O'chirish va yangi qo'shish mumkin.
      </p>

      <div className="mb-3 flex gap-2">
        <Input
          placeholder="Emoji"
          value={icon}
          onChange={(e) => setIcon(e.target.value)}
          className="w-20 text-center text-lg"
          readOnly
        />
        <Input placeholder="Kategoriya nomi" value={name} onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(); }} />
        <Button onClick={add} disabled={adding || !name.trim()}>
          {adding ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Plus className="mr-1 h-4 w-4" />} Qo'shish
        </Button>
      </div>

      <div className="mb-4">
        <p className="mb-2 text-xs text-muted-foreground">Emoji tanlang (ixtiyoriy):</p>
        <div className="flex flex-wrap gap-1.5">
          {SUGGESTED_EMOJIS.map((e) => (
            <button
              key={e.emoji}
              type="button"
              onClick={() => {
                setIcon(e.emoji);
                if (!name.trim()) setName(e.label);
              }}
              title={e.label}
              className={`flex h-9 w-9 items-center justify-center rounded-md border text-lg transition hover:bg-accent ${
                icon === e.emoji ? "border-primary bg-primary/10" : "border-border bg-card"
              }`}
            >
              {e.emoji}
            </button>
          ))}
          {icon && (
            <button
              type="button"
              onClick={() => setIcon("")}
              className="flex h-9 items-center justify-center rounded-md border border-border bg-card px-2 text-xs text-muted-foreground hover:bg-accent"
            >
              Tozalash
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...</div>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Hech qanday kategoriya yo'q. Yuqoridan qo'shing.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.map((c) => (
            <div key={c.id} className="group flex items-center gap-2 rounded-full border border-border bg-muted/40 py-1.5 pl-3 pr-1 text-sm">
              <span>{c.icon ? `${c.icon} ` : ""}{c.name}</span>
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
