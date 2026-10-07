import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { fmtUZS } from "@/lib/queries";
import { useActiveProject } from "@/lib/project-context";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusBadge } from "@/components/StatusBadge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/variations")({
  head: () => ({
    meta: [
      { title: "Rejadan tashqari — QurilishNazorat" },
      { name: "description", content: "Rejadan tashqari ish turlari, materiallar va yordamchi jihozlar — PM tasdiqlashi." },
    ],
  }),
  component: VariationsPage,
});

type Z = {
  id: string; kind: "material" | "work" | "equipment"; name: string; unit: string;
  qty: number; unit_price: number; total: number | null;
  status: "approved" | "pending" | "rejected"; notes: string | null;
  created_at: string;
};

function VariationsPage() {
  const qc = useQueryClient();
  const { activeProjectId, activeProject } = useActiveProject();

  const { data: zayavka = [] } = useQuery<Z[]>({
    queryKey: ["project_zayavka_extra", activeProjectId],
    enabled: !!activeProjectId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("project_zayavka")
        .select("*")
        .eq("project_id", activeProjectId!)
        .ilike("notes", "Rejadan tashqari%")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Z[];
    },
  });

  async function setStatus(id: string, status: "approved" | "rejected") {
    const { error } = await supabase.from("project_zayavka").update({ status: status as any }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(status === "approved" ? "Tasdiqlandi" : "Rad etildi");
    qc.invalidateQueries({ queryKey: ["project_zayavka_extra", activeProjectId] });
    qc.invalidateQueries({ queryKey: ["project_zayavka"] });
  }

  const byKind = (k: Z["kind"]) => zayavka.filter((z) => z.kind === k);

  const pending = zayavka.filter((z) => z.status === "pending").length;
  const approved = zayavka.filter((z) => z.status === "approved").length;
  const rejected = zayavka.filter((z) => z.status === "rejected").length;

  return (
    <div className="space-y-6 p-4 sm:p-6">
      <PageHeader
        title="Rejadan tashqari"
        subtitle={activeProject ? `${activeProject.name} — Master zayavkadan tashqari kelgan so'rovlar.` : "Loyiha tanlang."}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge tone="warn">{pending} Kutilmoqda</StatusBadge>
            <StatusBadge tone="success">{approved} Tasdiqlandi</StatusBadge>
            <StatusBadge tone="critical">{rejected} Rad etildi</StatusBadge>
          </div>
        }
      />

      <>
        <Tabs defaultValue="material">
          <TabsList className="flex w-full max-w-full overflow-x-auto no-scrollbar h-auto justify-start">
            <TabsTrigger value="material">📦 Materiallar</TabsTrigger>
            <TabsTrigger value="work">🔨 Ish turlari</TabsTrigger>
            <TabsTrigger value="equipment">🛠 Operatsion</TabsTrigger>
          </TabsList>

          {(["material", "work", "equipment"] as const).map((k) => (
            <TabsContent key={k} value={k}>
              <ExtraTable rows={byKind(k)} onApprove={(id) => setStatus(id, "approved")} onReject={(id) => setStatus(id, "rejected")} />
            </TabsContent>
          ))}
        </Tabs>
      </>
    </div>
  );
}

function ExtraTable({ rows, onApprove, onReject }: { rows: Z[]; onApprove: (id: string) => void; onReject: (id: string) => void }) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>Sana</TableHead>
            <TableHead>Nomi</TableHead>
            <TableHead>Birlik</TableHead>
            <TableHead className="text-right">Hajm</TableHead>
            <TableHead className="text-right">Birim narx</TableHead>
            <TableHead className="text-right">Jami</TableHead>
            <TableHead>Izoh</TableHead>
            <TableHead>Holat</TableHead>
            <TableHead className="text-right">Amal</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow>
              <TableCell colSpan={9} className="text-center text-sm text-muted-foreground py-6">
                Rejadan tashqari so'rov yo'q.
              </TableCell>
            </TableRow>
          ) : rows.map((z) => (
            <TableRow key={z.id}>
              <TableCell className="text-muted-foreground">{z.created_at?.slice(0, 10)}</TableCell>
              <TableCell className="font-medium">{z.name}</TableCell>
              <TableCell className="text-muted-foreground">{z.unit}</TableCell>
              <TableCell className="text-right tabular-nums">{Number(z.qty)}</TableCell>
              <TableCell className="text-right tabular-nums">{fmtUZS(Number(z.unit_price))}</TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {fmtUZS(Number(z.total ?? Number(z.qty) * Number(z.unit_price)))}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{z.notes ?? "—"}</TableCell>
              <TableCell>
                <StatusBadge tone={z.status === "approved" ? "success" : z.status === "rejected" ? "critical" : "warn"}>
                  {z.status === "approved" ? "Tasdiqlandi" : z.status === "rejected" ? "Rad etildi" : "Kutilmoqda"}
                </StatusBadge>
              </TableCell>
              <TableCell className="text-right">
                {z.status === "pending" ? (
                  <div className="flex justify-end gap-1">
                    <Button size="sm" variant="default" onClick={() => onApprove(z.id)}>
                      <Check className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => onReject(z.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
