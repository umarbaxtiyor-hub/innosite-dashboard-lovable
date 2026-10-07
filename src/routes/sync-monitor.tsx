import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Link2, Tags, Activity } from "lucide-react";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getSyncMonitor, retrySync, getLegacyPreview, linkLegacyRow, getCategoryMapping, saveCategoryMapping } from "@/lib/management.functions";

export const Route = createFileRoute("/sync-monitor")({
  head: () => ({
    meta: [
      { title: "Sync Monitor — Innosite" },
      { name: "description", content: "Google Sheets sinxronizatsiya holati, xatolar, eski qatorlarni bog'lash va kategoriya moslashtirish." },
      { property: "og:title", content: "Sync Monitor — Innosite" },
      { property: "og:description", content: "Google Sheets sinxronizatsiya monitoringi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SyncMonitorPage,
});

const HEALTH = {
  healthy: { label: "Healthy", cls: "bg-primary/15 text-primary" },
  attention: { label: "Attention", cls: "bg-accent text-accent-foreground" },
  critical: { label: "Critical", cls: "bg-destructive/15 text-destructive" },
} as const;
const dt = (s?: string | null) => (s ? new Date(s).toLocaleString("ru-RU", { dateStyle: "short", timeStyle: "short" }) : "—");

function SyncMonitorPage() {
  const fetchMon = useServerFn(getSyncMonitor);
  const retry = useServerFn(retrySync);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["sync-monitor"], queryFn: () => fetchMon(), refetchInterval: 30_000 });
  const [busy, setBusy] = useState(false);
  const doRetry = async (ids: string[]) => {
    setBusy(true);
    try {
      const r = await retry({ data: { ids } });
      toast.success(`Qayta urinildi: ${r.appended} ta yozildi${r.errors.length ? `, ${r.errors.length} xato` : ""}`);
      qc.invalidateQueries({ queryKey: ["sync-monitor"] });
    } catch (e: any) { toast.error(e?.message ?? "Xato"); } finally { setBusy(false); }
  };
  if (q.isError) return <div className="p-6 text-sm text-destructive">{String((q.error as any)?.message ?? "Xato")}</div>;
  const d = q.data;
  const k = d?.kpi;
  const failedIds = (d?.rows ?? []).filter((r: any) => r.failed || r.stuck).map((r: any) => r.id);
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 p-4 sm:p-6">
      <PageHeader title="Sync Monitor" subtitle="Innosite → Google Sheets sinxronizatsiya holati" />
      <div className="flex flex-wrap items-center gap-3">
        {k && <span className={`rounded-full px-3 py-1 text-sm font-semibold ${HEALTH[k.health as keyof typeof HEALTH].cls}`}>{HEALTH[k.health as keyof typeof HEALTH].label}</span>}
        <span className="text-xs text-muted-foreground">Oxirgi sync: {dt(k?.lastSync)}</span>
        <Button size="sm" variant="outline" className="ml-auto gap-1.5" disabled={busy} onClick={() => doRetry(failedIds)}>
          <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} /> Xatolarni qayta yuborish ({failedIds.length})
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {[["Kutilmoqda", k?.pending], ["Jarayonda", k?.processing], ["Yozilgan", k?.synced], ["Xato", k?.failed], ["Urinishlar", k?.retries],
          ["Yangilanish kerak", k?.needsUpdate], ["Qotgan", k?.stuck], ["Takror identity", k?.duplicates], ["Kategoriya ogohl.", k?.warnings], ["Bot navbati", k?.outboxPending]]
          .map(([l, v]) => (
            <Card key={String(l)}><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">{l}</div><div className="text-xl font-bold tabular-nums">{q.isLoading ? "…" : (v as number) ?? 0}</div></CardContent></Card>
          ))}
      </div>
      <Tabs defaultValue="queue">
        <TabsList className="flex h-auto flex-wrap justify-start">
          <TabsTrigger value="queue" className="gap-1"><Activity className="h-3.5 w-3.5" />Navbat</TabsTrigger>
          <TabsTrigger value="legacy" className="gap-1"><Link2 className="h-3.5 w-3.5" />Eski qatorlar</TabsTrigger>
          <TabsTrigger value="cats" className="gap-1"><Tags className="h-3.5 w-3.5" />Kategoriyalar</TabsTrigger>
        </TabsList>
        <TabsContent value="queue" className="space-y-4">
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-left"><tr>{["Manba", "Yozuv ID", "Loyiha", "Holat", "Urinish", "Xato", "Yaratilgan", "Sync"].map((h) => <th key={h} className="px-2 py-2 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {(d?.rows ?? []).slice(0, 150).map((r: any) => (
                  <tr key={r.id} className="border-t">
                    <td className="px-2 py-1.5">{r.source_table === "expenses" ? "Chiqim" : "Kirim"}</td>
                    <td className="px-2 py-1.5 font-mono">{r.record_id.slice(0, 8)}…</td>
                    <td className="px-2 py-1.5">{r.project}</td>
                    <td className="px-2 py-1.5"><Badge variant={r.failed || r.stuck ? "destructive" : "secondary"}>{r.stuck ? "qotgan" : r.failed ? "xato" : r.status}{r.needs_update ? " · yangilash" : ""}</Badge></td>
                    <td className="px-2 py-1.5 tabular-nums">{r.attempts}</td>
                    <td className="max-w-[260px] truncate px-2 py-1.5 text-muted-foreground" title={r.error ?? ""}>{r.error ?? ""}</td>
                    <td className="px-2 py-1.5">{dt(r.created_at)}</td>
                    <td className="px-2 py-1.5">{dt(r.synced_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!!d?.warnings.length && (
            <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Kategoriya ogohlantirishlari</CardTitle></CardHeader>
              <CardContent className="space-y-1 text-xs">{d.warnings.map((w: any) => <div key={w.record_id}>{w.detail} <span className="text-muted-foreground">· {w.source_table}:{w.record_id.slice(0, 8)} · {dt(w.last_seen)}</span></div>)}</CardContent></Card>
          )}
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Bot yozuvlari (Salyarka / HR / DPR)</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-xs">
              {(d?.outbox ?? []).length === 0 && <div className="text-muted-foreground">Hozircha yo'q</div>}
              {(d?.outbox ?? []).map((o: any) => <div key={o.id} className="flex gap-2"><Badge variant={o.status === "written" ? "secondary" : "destructive"}>{o.kind} · {o.status}</Badge><span>{dt(o.created_at)}</span>{o.error && <span className="text-muted-foreground">{o.error}</span>}</div>)}
            </CardContent></Card>
        </TabsContent>
        <TabsContent value="legacy"><LegacyPanel links={d?.links ?? []} /></TabsContent>
        <TabsContent value="cats"><CategoryPanel /></TabsContent>
      </Tabs>
    </div>
  );
}

function LegacyPanel({ links }: { links: any[] }) {
  const preview = useServerFn(getLegacyPreview);
  const link = useServerFn(linkLegacyRow);
  const [target, setTarget] = useState(0);
  const [p, setP] = useState<any>(null);
  const [targets, setTargets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ row: "", source: "expenses" as "expenses" | "incomes", recordId: "", note: "" });
  const load = async (t = target) => {
    setLoading(true);
    try { const r = await preview({ data: { target: t } }); setTargets(r.targets); setP(r.preview); }
    catch (e: any) { toast.error(e?.message ?? "Xato"); } finally { setLoading(false); }
  };
  const submit = async () => {
    try {
      const r = await link({ data: { target, row: Number(form.row), source: form.source, recordId: form.recordId, note: form.note } });
      toast.success(r.already ? "Allaqachon bog'langan" : "Bog'landi");
      setForm({ ...form, row: "", recordId: "" }); load();
    } catch (e: any) { toast.error(e?.message ?? "Xato"); }
  };
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Avtomatik moslash faqat Sheet'dagi «Innosite ID» bo'yicha. Sana/summa/kategoriya bo'yicha taxmin qilinmaydi — ID siz qatorni faqat siz aniq UUID bilan bog'laysiz. Har bog'lash kim/qachon bilan saqlanadi.</p>
      <div className="flex flex-wrap gap-2">
        {(targets.length ? targets : ["Master_Data", "Barcha loyihalar"]).map((t, i) => (
          <Button key={t} size="sm" variant={i === target ? "default" : "outline"} onClick={() => { setTarget(i); load(i); }}>{t}</Button>
        ))}
        <Button size="sm" variant="outline" disabled={loading} onClick={() => load()}>{loading ? "Tekshirilmoqda…" : "Tahlil (preview)"}</Button>
      </div>
      {p && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-sm">
            {[["Jami qator", p.total], ["Bog'langan (ID bor)", p.alreadyMapped], ["Avto-moslangan", p.matched], ["ID siz (unmatched)", p.unmatched], ["Konflikt", p.conflicts.length]].map(([l, v]) => (
              <Card key={String(l)}><CardContent className="p-3"><div className="text-[11px] text-muted-foreground">{l}</div><div className="text-lg font-bold">{v}</div></CardContent></Card>
            ))}
          </div>
          {p.conflicts.length > 0 && <div className="text-xs text-destructive">{p.conflicts.slice(0, 10).map((c: any) => <div key={c.id}>{c.reason}: qator {c.rows.join(", ")}</div>)}</div>}
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Qo'lda bog'lash</CardTitle></CardHeader>
            <CardContent className="grid gap-2 sm:grid-cols-5">
              <Input placeholder="Qator №" value={form.row} onChange={(e) => setForm({ ...form, row: e.target.value })} />
              <select className="h-9 rounded-md border bg-background px-2 text-sm" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value as any })}>
                <option value="expenses">Chiqim</option><option value="incomes">Kirim</option>
              </select>
              <Input className="sm:col-span-2 font-mono" placeholder="Innosite UUID" value={form.recordId} onChange={(e) => setForm({ ...form, recordId: e.target.value })} />
              <Button onClick={submit} disabled={!form.row || !form.recordId}>Bog'lash</Button>
              <Input className="sm:col-span-5" placeholder="Izoh (ixtiyoriy)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
            </CardContent></Card>
          <div className="max-h-80 overflow-auto rounded-lg border">
            <table className="w-full text-xs"><thead className="sticky top-0 bg-muted text-left"><tr><th className="px-2 py-1">Qator</th><th className="px-2 py-1">Ma'lumot</th></tr></thead>
              <tbody>{p.unmatchedSample.map((r: any) => (
                <tr key={r.row} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setForm({ ...form, row: String(r.row) })}>
                  <td className="px-2 py-1 tabular-nums">{r.row}</td><td className="px-2 py-1">{r.cells.filter(Boolean).join(" · ")}</td>
                </tr>))}</tbody></table>
          </div>
        </>
      )}
      {links.length > 0 && (
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Bog'lashlar tarixi</CardTitle></CardHeader>
          <CardContent className="space-y-1 text-xs">{links.map((l) => <div key={`${l.tab}${l.sheet_row}`}>{l.tab} #{l.sheet_row} → {l.source_table}:{l.record_id.slice(0, 8)}… · {l.linked_by_email ?? "—"} · {dt(l.created_at)}{l.note ? ` · ${l.note}` : ""}</div>)}</CardContent></Card>
      )}
    </div>
  );
}

function CategoryPanel() {
  const get = useServerFn(getCategoryMapping);
  const save = useServerFn(saveCategoryMapping);
  const q = useQuery({ queryKey: ["cat-map"], queryFn: () => get() });
  const [f, setF] = useState({ kind: "expense" as "expense" | "income", source: "", sheet: "" });
  const submit = async () => {
    try { await save({ data: f }); toast.success("Saqlandi"); setF({ ...f, source: "", sheet: "" }); q.refetch(); }
    catch (e: any) { toast.error(e?.message ?? "Xato"); }
  };
  const mapped = new Set((q.data?.map ?? []).map((m: any) => `${m.kind}|${m.source_category.toLowerCase()}`));
  const unmapped = (q.data?.categories ?? []).filter((c: any) => !mapped.has(`${c.kind === "income" ? "income" : "expense"}|${c.name.toLowerCase()}`));
  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">Innosite kategoriyasi → Sheet kategoriyasi. Mos kelmasa kalit so'z qoidasi, u ham topmasa «Boshqa» yoziladi va ogohlantirish chiqadi.</p>
      <Card><CardContent className="grid gap-2 p-3 sm:grid-cols-4">
        <select className="h-9 rounded-md border bg-background px-2 text-sm" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as any })}><option value="expense">Chiqim</option><option value="income">Kirim</option></select>
        <Input placeholder="Innosite kategoriyasi" value={f.source} onChange={(e) => setF({ ...f, source: e.target.value })} list="cat-src" />
        <datalist id="cat-src">{unmapped.map((c: any) => <option key={c.name} value={c.name} />)}</datalist>
        <Input placeholder="Sheet kategoriyasi" value={f.sheet} onChange={(e) => setF({ ...f, sheet: e.target.value })} />
        <Button onClick={submit}>Saqlash</Button>
      </CardContent></Card>
      {unmapped.length > 0 && <div className="text-xs"><b>Moslanmagan:</b> {unmapped.map((c: any) => c.name).join(", ")}</div>}
      <div className="overflow-x-auto rounded-lg border"><table className="w-full text-xs">
        <thead className="bg-muted/50 text-left"><tr><th className="px-2 py-1.5">Tur</th><th className="px-2 py-1.5">Innosite</th><th className="px-2 py-1.5">Sheet</th><th className="px-2 py-1.5">Faol</th></tr></thead>
        <tbody>{(q.data?.map ?? []).map((m: any) => (
          <tr key={m.id} className="cursor-pointer border-t hover:bg-muted/40" onClick={() => setF({ kind: m.kind, source: m.source_category, sheet: m.sheet_category })}>
            <td className="px-2 py-1">{m.kind === "income" ? "Kirim" : "Chiqim"}</td><td className="px-2 py-1">{m.source_category}</td><td className="px-2 py-1">{m.sheet_category}</td><td className="px-2 py-1">{m.active ? "ha" : "yo'q"}</td>
          </tr>))}</tbody></table></div>
    </div>
  );
}
