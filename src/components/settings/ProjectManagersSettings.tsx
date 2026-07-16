import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { UserCog, Loader2, Check } from "lucide-react";
import { toast } from "sonner";

type Row = { id: string; name: string; code: string; pm_name: string | null };

export function ProjectManagersSettings() {
  const [rows, setRows] = useState<Row[]>([]);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("projects")
        .select("id, name, code, pm_name")
        .order("name");
      if (error) toast.error(error.message);
      setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
  }, []);

  async function save(id: string) {
    const value = (edits[id] ?? "").trim();
    setSavingId(id);
    const { error } = await supabase
      .from("projects")
      .update({ pm_name: value || null })
      .eq("id", id);
    setSavingId(null);
    if (error) return toast.error(error.message);
    toast.success("Saqlandi");
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, pm_name: value || null } : r)));
    setEdits((prev) => {
      const n = { ...prev };
      delete n[id];
      return n;
    });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <UserCog className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Loyiha rahbarlari (ism va familya)</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Har bir loyiha uchun rahbarning ism-familyasini kiriting. Bu nom asosiy kartada "Rahbar" sifatida ko'rinadi.
      </p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
        </div>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Hozircha loyihalar yo'q.</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {rows.map((r) => {
            const current = edits[r.id] ?? r.pm_name ?? "";
            const dirty = current !== (r.pm_name ?? "");
            return (
              <div key={r.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{r.name}</div>
                  <div className="text-xs text-muted-foreground font-mono">{r.code}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    value={current}
                    placeholder="Ism va familya"
                    onChange={(e) => setEdits((p) => ({ ...p, [r.id]: e.target.value }))}
                    className="w-full sm:w-64"
                  />
                  <Button
                    size="sm"
                    onClick={() => save(r.id)}
                    disabled={!dirty || savingId === r.id}
                  >
                    {savingId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
