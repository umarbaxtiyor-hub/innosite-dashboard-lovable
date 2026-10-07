import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getProjectControl } from "@/lib/management.functions";
import { Kpi, ProgressBar, mln } from "@/components/exec/ExecUi";

export const Route = createFileRoute("/loyiha/$id")({
  head: () => ({
    meta: [
      { title: "Loyiha boshqaruv markazi — Innosite" },
      { name: "description", content: "Loyiha bo'yicha Progress, BOQ, DPR, xarajat, pul oqimi, yoqilg'i, HR, ta'minot, HSE/QA-QC va harakatlar." },
      { property: "og:title", content: "Loyiha boshqaruv markazi — Innosite" },
      { property: "og:description", content: "Bitta loyihaning to'liq boshqaruv ko'rinishi." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ProjectControl,
});

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-base"><span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/15 text-xs text-primary">{n}</span>{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2 text-sm">{children}</CardContent>
    </Card>
  );
}
const Empty = ({ t }: { t: string }) => <div className="text-sm text-muted-foreground">{t}</div>;
function MiniBars({ data, fmt }: { data: { label: string; v: number }[]; fmt?: (v: number) => string }) {
  const max = Math.max(1, ...data.map((d) => d.v));
  return (
    <div className="flex h-24 items-end gap-1">
      {data.map((d) => (
        <div key={d.label} className="flex flex-1 flex-col items-center gap-1" title={`${d.label}: ${fmt ? fmt(d.v) : d.v}`}>
          <div className="w-full rounded-t bg-primary/70" style={{ height: `${Math.max(3, (d.v / max) * 80)}px` }} />
          <span className="text-[9px] text-muted-foreground">{d.label.slice(-2)}</span>
        </div>
      ))}
    </div>
  );
}

function ProjectControl() {
  const { id } = Route.useParams();
  const fn = useServerFn(getProjectControl);
  const q = useQuery({ queryKey: ["project-control", id], queryFn: () => fn({ data: { id } }) });
  if (q.isError) return <div className="p-6 text-sm text-destructive">{String((q.error as any)?.message ?? "Xato")}</div>;
  if (q.isLoading || !q.data) return <div className="p-6 text-sm text-muted-foreground">Yuklanmoqda…</div>;
  const d = q.data;
  const p = d.project as any;
  const hse = d.issues.filter((i: any) => i.kind === "hse"), qa = d.issues.filter((i: any) => i.kind === "qaqc");
  const actions = d.insights.map((i: any) => i.recommended_action).filter(Boolean);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-3 p-3 sm:p-6">
      <Link to="/ceo" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" />Boshqaruv paneli</Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{p.name}</h1>
        <p className="text-sm text-muted-foreground">{[p.location, p.start_date && `${p.start_date} → ${p.end_date ?? "?"}`, p.pm_name && `PM: ${p.pm_name}`, p.prorab_name && `Prorab: ${p.prorab_name}`].filter(Boolean).join(" · ")}</p>
      </div>

      <Section n={1} title="Progress">
        <div className="flex items-center gap-2"><ProgressBar actual={d.progress} planned={d.planned} /><span className="w-24 text-right text-sm font-semibold tabular-nums">{d.progress}%</span></div>
        <div className="text-xs text-muted-foreground">{d.planned !== null ? `Vaqt bo'yicha reja: ${d.planned}% · ${d.planned - d.progress > 0 ? `${Math.round(d.planned - d.progress)}% orqada` : "rejada"}` : "Loyiha muddati kiritilmagan"}</div>
      </Section>

      <Section n={2} title="BOQ (asos)">
        <div className="grid grid-cols-3 gap-2">
          <Kpi label="Reja" value={mln(d.boqPlanned)} /><Kpi label="Fakt" value={mln(d.boqActual)} /><Kpi label="Shartnoma" value={mln(d.contract)} />
        </div>
        <div className="text-xs text-muted-foreground">{d.boqLinkedExpenses} / {d.expenseCount} xarajat BOQ bandiga bog'langan</div>
        {d.boq.length === 0 ? <Empty t="BOQ kiritilmagan" /> : (
          <div className="max-h-72 space-y-1.5 overflow-auto pr-1">
            {d.boq.map((b: any) => (
              <div key={b.id} className="text-xs">
                <div className="flex gap-2"><span className="font-mono text-muted-foreground">{b.code}</span><span className="truncate">{b.description}</span><span className="ml-auto tabular-nums">{b.pct}%</span></div>
                <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className={`h-full ${b.pct > 100 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, b.pct)}%` }} /></div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section n={3} title="DPR (14 kun)">
        {d.dpr.length === 0 ? <Empty t="Kunlik hisobot kelmagan" /> : d.dpr.slice(0, 7).map((r: any, i: number) => (
          <div key={i} className="flex gap-2 text-xs"><span className="w-20 shrink-0 tabular-nums text-muted-foreground">{r.date}</span><span>{r.by ?? "—"}</span>{r.issues && <span className="text-destructive">⚠ {r.issues}</span>}</div>
        ))}
      </Section>

      <Section n={4} title="Xarajat">
        <div className="grid grid-cols-2 gap-2"><Kpi label="Jami" value={mln(d.cost.total)} /><Kpi label="30 kun" value={mln(d.cost.last30)} /></div>
        {d.cost.byCategory.slice(0, 6).map((c: any) => (
          <div key={c.name} className="flex items-center gap-2 text-xs"><span className="w-36 truncate">{c.name}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary/70" style={{ width: `${(c.value / Math.max(1, d.cost.total)) * 100}%` }} /></div>
            <span className="w-16 text-right tabular-nums">{mln(c.value)}</span></div>
        ))}
      </Section>

      <Section n={5} title="Sof pul oqimi">
        <div className="grid grid-cols-3 gap-2">
          <Kpi label="Kirim" value={mln(d.cash.income)} /><Kpi label="Chiqim" value={mln(d.cash.expense)} /><Kpi label="Sof oqim" value={mln(d.cash.net)} tone={d.cash.net < 0 ? "bad" : "good"} />
        </div>
        {d.cash.monthly.map((m: any) => (
          <div key={m.month} className="flex gap-2 text-xs tabular-nums"><span className="w-16 text-muted-foreground">{m.month}</span><span>+{mln(m.in)}</span><span>−{mln(m.out)}</span><span className={`ml-auto font-medium ${m.net < 0 ? "text-destructive" : ""}`}>{mln(m.net)}</span></div>
        ))}
      </Section>

      <Section n={6} title="Yoqilg'i">
        <div className="grid grid-cols-2 gap-2"><Kpi label="7 kun" value={mln(d.fuel.last7)} /><Kpi label="Jami" value={mln(d.fuel.total)} /></div>
        {d.fuel.daily.length ? <MiniBars data={d.fuel.daily.map((x: any) => ({ label: x.date, v: x.v }))} fmt={mln} /> : <Empty t="So'nggi 14 kunda yoqilg'i xarajati yo'q" />}
      </Section>

      <Section n={7} title="HR / ishchi kuchi">
        <div className="grid grid-cols-2 gap-2"><Kpi label="Kishi-kun (7k)" value={String(d.hr.manDays7)} /><Kpi label="Xodimlar (30k)" value={String(d.hr.crew30)} /></div>
        {d.hr.daily.length ? <MiniBars data={d.hr.daily.map((x: any) => ({ label: x.date, v: x.n }))} /> : <Empty t="Davomat qayd etilmagan" />}
      </Section>

      <Section n={8} title="Ta'minot">
        <div className="grid grid-cols-3 gap-2">
          <Kpi label="Ochiq" value={String(d.procurement.open)} /><Kpi label="Kechikkan" value={String(d.procurement.overdue.length)} tone={d.procurement.overdue.length ? "bad" : undefined} /><Kpi label="Yetkazilgan" value={String(d.procurement.delivered)} />
        </div>
        {d.procurement.overdue.slice(0, 5).map((z: any) => <div key={z.id} className="text-xs text-destructive">⏰ {z.name} — {z.needed_date}</div>)}
        {d.procurement.next7.slice(0, 5).map((z: any) => <div key={z.id} className="text-xs">📦 {z.name} — {z.needed_date}</div>)}
      </Section>

      <Section n={9} title="HSE / QA-QC">
        <div className="grid grid-cols-2 gap-2"><Kpi label="HSE hodisa" value={String(hse.length)} tone={hse.length ? "bad" : "good"} /><Kpi label="Sifat nuqsoni" value={String(qa.length)} tone={qa.length ? "bad" : "good"} /></div>
        <div className="text-[11px] text-muted-foreground">Manba: DPR'dagi «muammolar» qayd etilgan matn.</div>
      </Section>

      <Section n={10} title="Muammolar">
        {d.insights.length === 0 && d.issues.length === 0 && <Empty t="Ochiq muammo yo'q" />}
        {d.insights.map((i: any) => (
          <div key={i.id} className="flex items-start gap-2"><Badge variant={i.severity === "critical" ? "destructive" : "secondary"} className="shrink-0">{i.severity === "critical" ? "Muhim" : i.severity === "warning" ? "Diqqat" : "Info"}</Badge><div><div>{i.title}</div><div className="text-xs text-muted-foreground">{i.metric}</div></div></div>
        ))}
        {d.issues.filter((i: any) => i.kind === "other").slice(0, 5).map((i: any, k: number) => <div key={k} className="text-xs">• {i.date}: {i.text}</div>)}
      </Section>

      <Section n={11} title="Harakatlar">
        {actions.length === 0 ? <Empty t="Hozircha zarur harakat yo'q" /> : Array.from(new Set(actions)).map((a: any, i) => <div key={i}>👉 {a}</div>)}
      </Section>
    </div>
  );
}
