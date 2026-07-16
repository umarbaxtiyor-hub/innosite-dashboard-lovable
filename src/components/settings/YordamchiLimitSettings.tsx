import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { fmtUZS } from "@/lib/queries";
import { useActiveProject } from "@/lib/project-context";

type Existing = { id: string; unit_price: number | null; total: number | null } | null;

export function YordamchiLimitSettings() {
  const { activeProjectId, activeProject } = useActiveProject();
  const [existing, setExisting] = useState<Existing>(null);
  const [val, setVal] = useState<string>("0");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    if (!activeProjectId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("project_zayavka")
        .select("id, unit_price, total")
        .eq("project_id", activeProjectId)
        .eq("kind", "equipment")
        .is("parent_id", null)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setExisting((data as Existing) ?? null);
      setVal(String(data?.unit_price ?? data?.total ?? 0));
    } catch (e: any) {
      toast.error(e?.message ?? "Xato");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeProjectId]);

  async function save() {
    if (!activeProjectId) return;
    const limit = Number(val) || 0;
    setSaving(true);
    try {
      if (existing) {
        const { error } = await supabase
          .from("project_zayavka")
          .update({ unit_price: limit, qty: 1, total: limit })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("project_zayavka").insert({
          project_id: activeProjectId,
          kind: "equipment",
          name: "Yordamchi xarajatlar limiti",
          unit: "so'm",
          qty: 1,
          unit_price: limit,
          status: "approved",
        });
        if (error) throw error;
      }
      toast.success("Limit saqlandi");
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Xato");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Wallet className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Yordamchi xarajatlar limiti</h3>
      </div>
      {!activeProjectId ? (
        <p className="text-sm text-muted-foreground">Loyiha tanlang.</p>
      ) : loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            Loyiha: <span className="font-medium text-foreground">{activeProject?.name}</span>
          </p>
          <div className="flex items-center gap-2">
            <Input
              className="h-9 text-sm max-w-[240px]"
              inputMode="decimal"
              value={val}
              onChange={(e) => setVal(e.target.value)}
            />
            <Button size="sm" onClick={save} disabled={saving}>
              {saving ? <Loader2 className="mr-2 h-3 w-3 animate-spin" /> : null}
              Saqlash
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Joriy: {fmtUZS(Number(val) || 0)}</p>
        </div>
      )}
    </div>
  );
}
