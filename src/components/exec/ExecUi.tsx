import { Card, CardContent } from "@/components/ui/card";

export const mln = (v: number) => `${(Math.round(v / 100_000) / 10).toLocaleString("ru-RU")} mln`;

export function Kpi({ icon: Icon, label, value, sub, tone }: { icon?: any; label: string; value: string; sub?: string; tone?: "bad" | "good" | "warn" }) {
  const c = tone === "bad" ? "text-destructive" : tone === "good" ? "text-primary" : "";
  return (
    <Card className="overflow-hidden"><CardContent className="p-3.5">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{Icon && <Icon className="h-3.5 w-3.5" />}{label}</div>
      <div className={`mt-1 text-xl font-bold tabular-nums sm:text-2xl ${c}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </CardContent></Card>
  );
}

export function ProgressBar({ actual, planned }: { actual: number; planned: number | null }) {
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={`h-full rounded-full ${planned !== null && planned - actual > 20 ? "bg-destructive" : "bg-primary"}`} style={{ width: `${Math.min(100, actual)}%` }} />
      {planned !== null && <div className="absolute top-0 h-full w-0.5 bg-foreground/70" style={{ left: `${Math.min(100, planned)}%` }} title={`Reja ${planned}%`} />}
    </div>
  );
}

