import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, RefreshCw } from "lucide-react";

import { PageHeader } from "@/components/PageHeader";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentRoles } from "@/hooks/use-current-roles";

export const Route = createFileRoute("/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit log — QurilishNazorat" },
      { name: "description", content: "Tizimdagi barcha o'zgarishlar tarixi" },
    ],
  }),
  component: AuditLogPage,
});

type AuditRow = {
  id: string;
  table_name: string;
  record_id: string | null;
  action: "INSERT" | "UPDATE" | "DELETE";
  old_data: any;
  new_data: any;
  changed_fields: string[] | null;
  user_id: string | null;
  user_email: string | null;
  telegram_user_id: number | null;
  created_at: string;
};

const ACTION_BADGE: Record<string, string> = {
  INSERT: "bg-success/15 text-success",
  UPDATE: "bg-warning/15 text-warning",
  DELETE: "bg-destructive/15 text-destructive",
};

function fmtUzDate(iso: string) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const day = String(d.getDate()).padStart(2, "0");
  const mon = String(d.getMonth() + 1).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${day}.${mon}, ${hh}:${mm}`;
}

function AuditLogPage() {
  const { roles, loading: rolesLoading } = useCurrentRoles();
  const isAdmin = roles?.includes("admin");

  const [q, setQ] = useState("");
  const [tableFilter, setTableFilter] = useState("all");
  const [actionFilter, setActionFilter] = useState("all");
  const [open, setOpen] = useState<AuditRow | null>(null);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ["audit-log"],
    queryFn: async (): Promise<AuditRow[]> => {
      const { data, error } = await supabase
        .from("audit_log" as any)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as any;
    },
    enabled: !!isAdmin,
    staleTime: 30_000,
  });

  const tables = useMemo(
    () => Array.from(new Set(rows.map((r) => r.table_name))).sort(),
    [rows],
  );

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (tableFilter !== "all" && r.table_name !== tableFilter) return false;
      if (actionFilter !== "all" && r.action !== actionFilter) return false;
      if (!ql) return true;
      return (
        r.table_name.toLowerCase().includes(ql) ||
        (r.user_email ?? "").toLowerCase().includes(ql) ||
        (r.record_id ?? "").toLowerCase().includes(ql) ||
        JSON.stringify(r.new_data ?? r.old_data ?? "").toLowerCase().includes(ql)
      );
    });
  }, [rows, q, tableFilter, actionFilter]);

  if (rolesLoading) {
    return <div className="p-6 text-muted-foreground text-sm">Yuklanmoqda...</div>;
  }
  if (!isAdmin) {
    return (
      <div className="p-6">
        <Card className="p-6 text-center text-sm text-muted-foreground">
          Bu sahifani faqat <b>admin</b> ko'ra oladi.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <PageHeader
        title="Audit log"
        subtitle="Tizimdagi barcha qo'shish, tahrirlash va o'chirish hodisalari"
        actions={
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`} /> Yangilash
          </Button>
        }
      />

      <Card className="p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative sm:w-72">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Qidirish (jadval, email, ID, qiymat)"
              className="h-8 pl-8 text-sm"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <Select value={tableFilter} onValueChange={setTableFilter}>
            <SelectTrigger className="h-8 w-full sm:w-52 text-sm"><SelectValue placeholder="Jadval" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barcha jadvallar</SelectItem>
              {tables.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-8 w-full sm:w-40 text-sm"><SelectValue placeholder="Amal" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Barchasi</SelectItem>
              <SelectItem value="INSERT">Qo'shildi</SelectItem>
              <SelectItem value="UPDATE">Tahrir</SelectItem>
              <SelectItem value="DELETE">O'chirildi</SelectItem>
            </SelectContent>
          </Select>
          <span className="ml-auto text-xs text-muted-foreground">
            {filtered.length} / {rows.length}
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="max-h-[72vh] overflow-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/60 backdrop-blur">
              <TableRow>
                <TableHead className="whitespace-nowrap">Vaqt</TableHead>
                <TableHead>Jadval</TableHead>
                <TableHead>Amal</TableHead>
                <TableHead>Kim</TableHead>
                <TableHead>O'zgargan maydonlar</TableHead>
                <TableHead>Record ID</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Yuklanmoqda...</TableCell></TableRow>
              )}
              {!isLoading && filtered.length === 0 && (
                <TableRow><TableCell colSpan={6} className="py-10 text-center text-muted-foreground">Yozuvlar yo'q</TableCell></TableRow>
              )}
              {filtered.map((r) => (
                <TableRow key={r.id} className="cursor-pointer" onClick={() => setOpen(r)}>
                  <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                    {fmtUzDate(r.created_at)}
                  </TableCell>
                  <TableCell><span className="rounded-md bg-muted px-2 py-0.5 text-xs">{r.table_name}</span></TableCell>
                  <TableCell>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${ACTION_BADGE[r.action] ?? ""}`}>
                      {r.action}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs">
                    {r.user_email ?? (r.telegram_user_id ? `TG: ${r.telegram_user_id}` : "—")}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate">
                    {r.changed_fields?.length ? r.changed_fields.join(", ") : (r.action === "INSERT" ? "(yangi)" : r.action === "DELETE" ? "(o'chirildi)" : "—")}
                  </TableCell>
                  <TableCell className="font-mono text-[10px] text-muted-foreground">{r.record_id?.slice(0, 8) ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="text-base">
              {open?.action} — {open?.table_name}
            </DialogTitle>
          </DialogHeader>
          {open && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <div><span className="text-muted-foreground">Vaqt:</span> {fmtUzDate(open.created_at)}</div>
                <div><span className="text-muted-foreground">Kim:</span> {open.user_email ?? (open.telegram_user_id ? `TG: ${open.telegram_user_id}` : "—")}</div>
                <div><span className="text-muted-foreground">Record ID:</span> <span className="font-mono">{open.record_id ?? "—"}</span></div>
                <div><span className="text-muted-foreground">User ID:</span> <span className="font-mono">{open.user_id ?? "—"}</span></div>
              </div>
              {open.changed_fields?.length ? (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">O'zgargan maydonlar</div>
                  <div className="rounded-md border border-border bg-muted/30 p-2">
                    <div className="grid grid-cols-1 gap-1 text-xs">
                      {open.changed_fields.map((f) => (
                        <div key={f} className="grid grid-cols-3 gap-2">
                          <div className="font-medium">{f}</div>
                          <div className="text-destructive truncate" title={JSON.stringify(open.old_data?.[f])}>
                            {JSON.stringify(open.old_data?.[f]) ?? "—"}
                          </div>
                          <div className="text-success truncate" title={JSON.stringify(open.new_data?.[f])}>
                            {JSON.stringify(open.new_data?.[f]) ?? "—"}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              {open.old_data && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground">Eski qiymat (raw)</summary>
                  <pre className="mt-2 rounded-md border bg-muted/30 p-2 overflow-auto max-h-60">{JSON.stringify(open.old_data, null, 2)}</pre>
                </details>
              )}
              {open.new_data && (
                <details className="text-xs" open={open.action === "INSERT"}>
                  <summary className="cursor-pointer text-muted-foreground">Yangi qiymat (raw)</summary>
                  <pre className="mt-2 rounded-md border bg-muted/30 p-2 overflow-auto max-h-60">{JSON.stringify(open.new_data, null, 2)}</pre>
                </details>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
