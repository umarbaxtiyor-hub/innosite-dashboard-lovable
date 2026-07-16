import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, Loader2, AlertTriangle, CheckCircle2, RefreshCw } from "lucide-react";

type AuditRow = {
  table_name: string;
  rls_enabled: boolean;
  policy_count: number;
  permissive_write_policies: number;
  status: string;
};

type GrantRow = {
  function_name: string;
  arguments: string;
  grants: string[] | null;
};

type ErrorRow = {
  id: string;
  table_name: string;
  action: string;
  error_message: string | null;
  error_sqlstate: string | null;
  error_context: string | null;
  created_at: string;
};

export function SecurityAuditPanel() {
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    setLoading(true); setErr(null);
    try {
      const [a, g, e] = await Promise.all([
        supabase.from("v_security_audit" as any).select("*"),
        supabase.from("v_security_definer_grants" as any).select("*"),
        supabase
          .from("audit_log")
          .select("id, table_name, action, error_message, error_sqlstate, error_context, created_at")
          .like("action", "TRIGGER_ERROR:%")
          .order("created_at", { ascending: false })
          .limit(20),
      ]);
      if (a.error) throw a.error;
      if (g.error) throw g.error;
      if (e.error) throw e.error;
      setAudit((a.data ?? []) as any);
      setGrants((g.data ?? []) as any);
      setErrors((e.data ?? []) as any);
    } catch (e: any) {
      setErr(e.message ?? String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const badStatusRows = audit.filter((r) => r.status !== "OK");
  const riskyGrants = grants.filter((g) =>
    (g.grants ?? []).some((x) => typeof x === "string" && (x.startsWith("EXECUTE:anon") || x.startsWith("EXECUTE:PUBLIC")))
  );

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Xavfsizlik auditi</h3>
        </div>
        <Button size="sm" variant="outline" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
          Yangilash
        </Button>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      {!err && !loading && (
        <div className="space-y-5 text-sm">
          {/* RLS holati */}
          <section>
            <h4 className="mb-2 font-medium text-foreground">RLS & policy holati</h4>
            {badStatusRows.length === 0 ? (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-4 w-4" /> Barcha {audit.length} jadval OK.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left">
                    <tr>
                      <th className="px-3 py-2">Jadval</th>
                      <th className="px-3 py-2">RLS</th>
                      <th className="px-3 py-2">Policy</th>
                      <th className="px-3 py-2">Permissive write</th>
                      <th className="px-3 py-2">Holat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {badStatusRows.map((r) => (
                      <tr key={r.table_name} className="border-t border-border">
                        <td className="px-3 py-2 font-mono">{r.table_name}</td>
                        <td className="px-3 py-2">{r.rls_enabled ? "✓" : "✗"}</td>
                        <td className="px-3 py-2">{r.policy_count}</td>
                        <td className="px-3 py-2">{r.permissive_write_policies}</td>
                        <td className="px-3 py-2">
                          <Badge variant={(r.status ?? "").startsWith("CRITICAL") ? "destructive" : "secondary"} className="text-[10px]">
                            <AlertTriangle className="mr-1 h-3 w-3" /> {r.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* SECURITY DEFINER grants */}
          <section>
            <h4 className="mb-2 font-medium text-foreground">SECURITY DEFINER funksiyalar</h4>
            {riskyGrants.length === 0 ? (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-4 w-4" /> Anon yoki PUBLIC EXECUTE huquqi yo'q.
              </div>
            ) : (
              <ul className="space-y-1">
                {riskyGrants.map((g) => (
                  <li key={g.function_name + g.arguments} className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs">
                    <code className="font-mono">{g.function_name}({g.arguments})</code>
                    <div className="text-destructive">Grants: {(g.grants ?? []).join(", ")}</div>
                  </li>
                ))}
              </ul>
            )}
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted-foreground">Barchasi ({grants.length})</summary>
              <div className="mt-2 max-h-60 overflow-y-auto rounded-md border border-border">
                <table className="w-full text-xs">
                  <thead className="bg-muted/50 text-left"><tr><th className="px-3 py-2">Funksiya</th><th className="px-3 py-2">Grants</th></tr></thead>
                  <tbody>
                    {grants.map((g) => (
                      <tr key={g.function_name + g.arguments} className="border-t border-border">
                        <td className="px-3 py-2 font-mono">{g.function_name}</td>
                        <td className="px-3 py-2 text-muted-foreground">{(g.grants ?? []).join(", ") || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          {/* Trigger errors */}
          <section>
            <h4 className="mb-2 font-medium text-foreground">So'nggi trigger xatolari</h4>
            {errors.length === 0 ? (
              <div className="flex items-center gap-2 text-success">
                <CheckCircle2 className="h-4 w-4" /> Xato yo'q.
              </div>
            ) : (
              <ul className="space-y-1">
                {errors.map((e) => (
                  <li key={e.id} className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs">
                    <div className="flex justify-between gap-2">
                      <span className="font-mono">{e.table_name} · {e.action}</span>
                      <span className="text-muted-foreground">{new Date(e.created_at).toLocaleString("uz-UZ")}</span>
                    </div>
                    <div className="mt-1 text-destructive">{e.error_message} <span className="text-muted-foreground">({e.error_sqlstate})</span></div>
                    {e.error_context && <div className="text-muted-foreground">{e.error_context}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
