import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Clock, Save, Loader2 } from "lucide-react";
import { toast } from "sonner";

const KEYS = ["work_start_time", "work_end_time", "lateness_grace_min"] as const;
type Key = (typeof KEYS)[number];

const DEFAULTS: Record<Key, string> = {
  work_start_time: "09:00",
  work_end_time: "18:00",
  lateness_grace_min: "10",
};

export function WorkScheduleSettings() {
  const [vals, setVals] = useState<Record<Key, string>>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("app_settings").select("key, value").in("key", KEYS as unknown as string[]);
      const next = { ...DEFAULTS };
      for (const r of data ?? []) {
        if ((KEYS as readonly string[]).includes(r.key)) next[r.key as Key] = String(r.value ?? DEFAULTS[r.key as Key]);
      }
      setVals(next);
      setLoading(false);
    })();
  }, []);

  async function save() {
    setSaving(true);
    const rows = KEYS.map((k) => ({ key: k, value: vals[k], updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("app_settings").upsert(rows);
    setSaving(false);
    if (error) toast.error(error.message);
    else toast.success("Ish vaqti sozlamalari saqlandi");
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        <h3 className="font-semibold">Ish vaqti va kechikish</h3>
      </div>
      <p className="mb-4 text-xs text-muted-foreground">
        Standart ish boshlanish/tugash vaqti va kechikish uchun imtiyoz (grace) daqiqalari. Bu sozlamalar barcha obyektlarga qo'llanadi.
      </p>
      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Yuklanmoqda...</div>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Ish boshlanishi</label>
            <Input type="time" value={vals.work_start_time} onChange={(e) => setVals((v) => ({ ...v, work_start_time: e.target.value }))} className="w-[140px]" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Ish tugashi</label>
            <Input type="time" value={vals.work_end_time} onChange={(e) => setVals((v) => ({ ...v, work_end_time: e.target.value }))} className="w-[140px]" />
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Kechikish chegarasi (daq)</label>
            <Input
              type="number"
              min={0}
              value={vals.lateness_grace_min}
              onChange={(e) => setVals((v) => ({ ...v, lateness_grace_min: e.target.value }))}
              className="w-[140px]"
              placeholder="10"
            />
          </div>
          <Button onClick={save} disabled={saving} size="sm">
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />} Saqlash
          </Button>
        </div>
      )}
      <p className="mt-3 text-xs text-muted-foreground">
        Misol: ish 09:00 da boshlanadi va grace 10 daq bo'lsa, xodim 09:10 dan keyin kelgan paytda kechikkan deb hisoblanadi.
      </p>
    </div>
  );
}
