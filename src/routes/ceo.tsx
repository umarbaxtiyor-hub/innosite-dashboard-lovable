import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, ChevronRight, CalendarClock, HardHat, ShieldAlert, Fuel, Users, Package, TrendingUp, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCeoDashboard } from "@/lib/management.functions";
import { Kpi, ProgressBar, mln } from "@/components/exec/ExecUi";

export const Route = createFileRoute("/ceo")({
  head: () => ({
    meta: [
      { title: "CEO Dashboard — Innosite" },
      { name: "description", content: "Barcha loyihalar holati 30 soniyada: progress, reja/fakt, sof pul oqimi, DPR, yoqilg'i, ishchi kuchi, ta'minot, HSE va muammolar." },
      { property: "og:title", content: "CEO Dashboard — Innosite" },
      { property: "og:description", content: "Qurilish loyihalari boshqaruv paneli." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: CeoPage,
});

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);

function status(p: any): { label: string; tone: "destructive" | "secondary" | "default" } {
  if (p.critical > 0 || p.hse > 0 || p.netCash < -0.2 * Math.max(1, p.actual)) return { label: "Xavf", tone: "destructive" };
  if (p.warning > 0 || (p.planned !== null && p.planned - p.progress > 15) || p.netCash < 0) return { label: "E'tibor", tone: "secondary" };
  return { label: "Yaxshi", tone: "default" };
}

function CeoPage() {
  const fn = useServerFn(getCeoDashboard);
  const q = useQuery({ queryKey: ["ceo-dash"], queryFn: () => fn() });
  if (q.isError) return <div className="p-6 text-sm text-destructive">{String((q.error as any)?.message ?? "Xato")}</div>;
  if (q.isLoading || !q.data) return <div className="p-6 text-sm text-muted-foreground">Yuklanmoqda…</div>;
  const { projects, insights, today } = q.data;
  const T = projects.reduce((a, p) => ({
    contract: a.contract + (p.contract || p.budget), actual: a.actual + p.actual, income: a.income + p.income, boqP: a.boqP + p.boqPlanned, boqA: a.boqA + p.boqActual,
    fuel: a.fuel + p.fuel7d, man: a.man + p.manDays7d, procO: a.procO + p.procurementOverdue, procP: a.procP + p.procurementPending, hse: a.hse + p.hse, qa: a.qa + p.qaqc, iss: a.iss + p.issues,
  }), { contract: 0, actual: 0, income: 0, boqP: 0, boqA: 0, fuel: 0, man: 0, procO: 0, procP: 0, hse: 0, qa: 0, iss: 0 });
  const net = T.income - T.actual;
  const plannedAvg = (() => { const v = projects.map((p) => p.planned).filter((x): x is number => x !== null); return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null; })();
  const progress = pct(T.boqA, T.boqP);
  const dprToday = projects.filter((p) => p.dprLast === today).length;
  const crit = insights.filter((i: any) => i.severity === "critical");
  const next7 = projects.flatMap((p) => p.next7.map((n: any) => ({ ...n, project: p.name }))).sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Boshqaruv paneli</h1>
        <p className="text-sm text-muted-foreground">{today} · {projects.length} loyiha</p>
      </div>

      {crit.length > 0 && (
        <Link to="/ai-insights" className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-sm font-medium text-destructive">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {crit.length} ta muhim xavf — ko'rish <ChevronRight className="ml-auto h-4 w-4" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Kpi icon={Wallet} label="Sof pul oqimi" value={mln(net)} tone={net < 0 ? "bad" : "good"} sub={`Kirim ${mln(T.income)} · Chiqim ${mln(T.actual)}`} />
        <Kpi icon={TrendingUp} label="Umumiy progress" value={`${progress}%`} sub={plannedAvg !== null ? `Reja bo'yicha ${plannedAvg}%` : "BOQ bo'yicha"} tone={plannedAvg !== null && plannedAvg - progress > 15 ? "bad" : undefined} />
        <Kpi label="Shartnoma / Byudjet" value={mln(T.contract)} sub={`Fakt xarajat ${mln(T.actual)} (${pct(T.actual, T.contract)}%)`} tone={T.actual > T.contract && T.contract > 0 ? "bad" : undefined} />
        <Kpi label="BOQ reja vs fakt" value={`${mln(T.boqA)}`} sub={`Reja ${mln(T.boqP)}`} />
      </div>
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        <Kpi icon={CalendarClock} label="DPR bugun" value={`${dprToday}/${projects.length}`} tone={dprToday < projects.length ? "warn" : "good"} />
        <Kpi icon={Fuel} label="Yoqilg'i 7k" value={mln(T.fuel)} />
        <Kpi icon={Users} label="Ishchi 7k" value={String(T.man)} sub="kishi-kun" />
        <Kpi icon={Package} label="Ta'minot" value={String(T.procO)} sub={`kechikkan · ${T.procP} kutmoqda`} tone={T.procO ? "bad" : undefined} />
        <Kpi icon={ShieldAlert} label="HSE" value={String(T.hse)} sub="7 kun hodisa" tone={T.hse ? "bad" : "good"} />
        <Kpi icon={HardHat} label="QA/QC" value={String(T.qa)} sub="7 kun nuqson" tone={T.qa ? "bad" : "good"} />
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Loyihalar</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {projects.map((p) => {
            const s = status(p);
            return (
              <Link key={p.id} to="/loyiha/$id" params={{ id: p.id }} className="block rounded-xl border p-3 transition-colors hover:bg-muted/40">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{p.name}</span>
                  <Badge variant={s.tone}>{s.label}</Badge>
                  <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <ProgressBar actual={p.progress} planned={p.planned} />
                  <span className="w-20 shrink-0 text-right tabular-nums">{p.progress}%{p.planned !== null ? ` / ${p.planned}%` : ""}</span>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-1 text-[11px] text-muted-foreground">
                  <span>Pul oqimi <b className={p.netCash < 0 ? "text-destructive" : "text-foreground"}>{mln(p.netCash)}</b></span>
                  <span>Xarajat <b className="text-foreground">{mln(p.actual)}</b></span>
                  <span>DPR <b className={p.dprLast === today ? "text-foreground" : "text-destructive"}>{p.dprLast === today ? "bor" : p.dprLast ?? "yo'q"}</b></span>
                </div>
              </Link>
            );
          })}
          {!projects.length && <div className="text-sm text-muted-foreground">Faol loyiha yo'q</div>}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between pb-2">
            <CardTitle className="text-base">Muammolar va xavflar</CardTitle>
            <Link to="/ai-insights" className="text-xs text-primary hover:underline">Hammasi →</Link>
          </CardHeader>
          <CardContent className="space-y-2">
            {insights.length === 0 && <div className="text-sm text-muted-foreground">Ochiq muammo yo'q</div>}
            {insights.slice(0, 8).map((i: any) => (
              <div key={i.id} className="flex items-start gap-2 text-sm">
                <Badge variant={i.severity === "critical" ? "destructive" : "secondary"} className="shrink-0">{i.severity === "critical" ? "Muhim" : i.severity === "warning" ? "Diqqat" : "Info"}</Badge>
                <div><div className="leading-snug">{i.title}</div><div className="text-xs text-muted-foreground">👉 {i.recommended_action}</div></div>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Keyingi 7 kun</CardTitle></CardHeader>
          <CardContent className="space-y-1.5 text-sm">
            {next7.length === 0 && <div className="text-muted-foreground">Rejalashtirilgan yetkazib berish yo'q</div>}
            {next7.slice(0, 10).map((n, i) => (
              <div key={i} className="flex gap-2"><span className="w-20 shrink-0 tabular-nums text-muted-foreground">{n.date.slice(5)}</span><span className="truncate">{n.name}</span><span className="ml-auto shrink-0 text-xs text-muted-foreground">{n.project}</span></div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
