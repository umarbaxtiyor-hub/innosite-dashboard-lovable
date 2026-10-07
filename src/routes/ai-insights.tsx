import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getInsights, runInsightsNow, resolveInsight } from "@/lib/management.functions";

export const Route = createFileRoute("/ai-insights")({
  head: () => ({
    meta: [
      { title: "AI Control Center — Innosite" },
      { name: "description", content: "Real ma'lumotlar asosida byudjet, jadval, xarajat, yoqilg'i, ishchi kuchi va ta'minot signallari." },
      { property: "og:title", content: "AI Control Center — Innosite" },
      { property: "og:description", content: "Boshqaruv signallari markazi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InsightsPage,
});

const SEV = { critical: "Critical", warning: "Warning", info: "Info" } as const;

function InsightsPage() {
  const list = useServerFn(getInsights);
  const run = useServerFn(runInsightsNow);
  const resolve = useServerFn(resolveInsight);
  const q = useQuery({ queryKey: ["insights"], queryFn: () => list() });
  const [filter, setFilter] = useState<"open" | "all">("open");
  const [busy, setBusy] = useState(false);
  const rows = (q.data ?? []).filter((i: any) => filter === "all" || i.status === "open");
  const recompute = async () => {
    setBusy(true);
    try { const r = await run({ data: { notify: false } }); toast.success(`${r.computed} signal tekshirildi, ${r.created} yangi`); q.refetch(); }
    catch (e: any) { toast.error(e?.message ?? "Xato"); } finally { setBusy(false); }
  };
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-4 sm:p-6">
      <PageHeader title="AI Control Center" subtitle="Management Intelligence — bazadagi haqiqiy ma'lumotlar asosida qoidalar (rules engine)" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={filter === "open" ? "default" : "outline"} onClick={() => setFilter("open")}>Ochiq</Button>
        <Button size="sm" variant={filter === "all" ? "default" : "outline"} onClick={() => setFilter("all")}>Hammasi</Button>
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" disabled={busy} onClick={recompute}><Sparkles className="h-3.5 w-3.5" />{busy ? "Hisoblanmoqda…" : "Qayta hisoblash"}</Button>
      </div>
      <p className="text-[11px] text-muted-foreground">Signallar har soat yangilanadi; yangi «Critical» signal CEO/adminga Telegramda bir marta yuboriladi. Bir xil signal bir davrda takrorlanmaydi.</p>
      {q.isError && <div className="text-sm text-destructive">{String((q.error as any)?.message ?? "Xato")}</div>}
      {q.isLoading && <div className="text-sm text-muted-foreground">Yuklanmoqda…</div>}
      {!q.isLoading && rows.length === 0 && <div className="text-sm text-muted-foreground">Signal yo'q</div>}
      <div className="space-y-2">
        {rows.map((i: any) => (
          <Card key={i.id}><CardContent className="space-y-1 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={i.severity === "critical" ? "destructive" : "secondary"}>{SEV[i.severity as keyof typeof SEV]}</Badge>
              <span className="text-xs text-muted-foreground">{i.evidence?.project ?? "—"}</span>
              <span className="ml-auto text-[11px] text-muted-foreground">{new Date(i.created_at).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" })}</span>
            </div>
            <div className="font-medium">{i.title}</div>
            <div className="text-xs">{i.metric}</div>
            <div className="text-xs text-muted-foreground">Manba: {i.evidence?.source ?? i.source}</div>
            <div className="flex items-center gap-2 text-xs"><span>👉 {i.recommended_action}</span>
              {i.status === "open" && <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={async () => { await resolve({ data: { id: i.id } }); q.refetch(); }}>Hal qilindi</Button>}
            </div>
          </CardContent></Card>
        ))}
      </div>
    </div>
  );
}
