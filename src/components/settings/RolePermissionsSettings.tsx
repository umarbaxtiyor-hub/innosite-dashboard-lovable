import { useEffect, useMemo, useState } from "react";
import { ShieldCheck, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  ALL_ROLES,
  ROLE_LABELS,
  MANAGED_PAGES,
  PAGE_PERMISSIONS,
  type AppRole,
} from "@/lib/permissions";

type Key = `${AppRole}|${string}`;

function toKey(role: AppRole, path: string): Key {
  return `${role}|${path}` as Key;
}

export function RolePermissionsSettings() {
  const qc = useQueryClient();
  const [allowed, setAllowed] = useState<Set<Key>>(new Set());
  const [original, setOriginal] = useState<Set<Key>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("role_permissions")
        .select("role, path");
      if (error) {
        toast.error("Yuklab bo'lmadi: " + error.message);
        setLoading(false);
        return;
      }
      const set = new Set<Key>();
      for (const r of (data ?? []) as Array<{ role: AppRole; path: string }>) {
        set.add(toKey(r.role, r.path));
      }
      setAllowed(set);
      setOriginal(new Set(set));
      setLoading(false);
    })();
  }, []);

  const dirty = useMemo(() => {
    if (allowed.size !== original.size) return true;
    for (const k of allowed) if (!original.has(k)) return true;
    return false;
  }, [allowed, original]);

  function toggle(role: AppRole, path: string) {
    if (role === "admin") return; // admin har doim hammasini ko'radi
    setAllowed((prev) => {
      const next = new Set(prev);
      const k = toKey(role, path);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  }

  async function save() {
    setSaving(true);
    try {
      const toAdd: Array<{ role: AppRole; path: string }> = [];
      const toRemove: Array<{ role: AppRole; path: string }> = [];
      for (const k of allowed) if (!original.has(k)) {
        const [role, path] = k.split("|");
        toAdd.push({ role: role as AppRole, path });
      }
      for (const k of original) if (!allowed.has(k)) {
        const [role, path] = k.split("|");
        toRemove.push({ role: role as AppRole, path });
      }
      if (toAdd.length) {
        const { error } = await supabase.from("role_permissions").upsert(toAdd);
        if (error) throw error;
      }
      for (const r of toRemove) {
        const { error } = await supabase
          .from("role_permissions")
          .delete()
          .eq("role", r.role)
          .eq("path", r.path);
        if (error) throw error;
      }
      setOriginal(new Set(allowed));
      await qc.invalidateQueries({ queryKey: ["role-permissions"] });
      toast.success("Saqlandi");
    } catch (e: any) {
      toast.error(e.message ?? "Saqlashda xatolik");
    } finally {
      setSaving(false);
    }
  }

  function resetDefaults() {
    const set = new Set<Key>();
    for (const [path, roles] of Object.entries(PAGE_PERMISSIONS)) {
      for (const r of roles) set.add(toKey(r, path));
    }
    setAllowed(set);
    toast.message("Standart matritsa tiklandi. Saqlash uchun 'Saqlash' tugmasini bosing.");
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Rollar va ruxsatlar</h3>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={resetDefaults} disabled={saving}>
            <RotateCcw className="mr-1 h-4 w-4" /> Standartga
          </Button>
          <Button size="sm" onClick={save} disabled={!dirty || saving}>
            {saving ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Saqlash
          </Button>
        </div>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Har bir rol qaysi bo'limni ko'rishini belgilang. <b>Admin</b> har doim hamma joyga kira oladi.
        O'zgarishlar darhol kuchga kiradi (foydalanuvchi keyingi yuklashda yangi navbarni ko'radi).
      </p>

      {loading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-xs">
            <thead>
              <tr className="border-b border-border">
                <th className="sticky left-0 bg-card px-2 py-2 text-left font-medium">Bo'lim</th>
                {ALL_ROLES.map((r) => (
                  <th key={r} className="px-2 py-2 text-center font-medium">
                    <div className="whitespace-nowrap">{ROLE_LABELS[r]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MANAGED_PAGES.map((page) => (
                <tr key={page.path} className="border-b border-border/50 hover:bg-muted/30">
                  <td className="sticky left-0 bg-card px-2 py-2">
                    <div className="font-medium">{page.label}</div>
                    <div className="text-[10px] text-muted-foreground">{page.path}</div>
                  </td>
                  {ALL_ROLES.map((r) => {
                    const k = toKey(r, page.path);
                    const checked = r === "admin" ? true : allowed.has(k);
                    return (
                      <td key={r} className="px-2 py-2 text-center">
                        <Checkbox
                          checked={checked}
                          disabled={r === "admin"}
                          onCheckedChange={() => toggle(r, page.path)}
                          aria-label={`${ROLE_LABELS[r]} — ${page.label}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {dirty && !loading && (
        <div className="mt-3">
          <Badge variant="outline" className="text-xs">Saqlanmagan o'zgarishlar bor</Badge>
        </div>
      )}
    </div>
  );
}
