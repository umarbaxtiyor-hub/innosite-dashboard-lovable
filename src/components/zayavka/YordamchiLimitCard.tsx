import { fmtUZSc } from "@/lib/queries";
import type { Z } from "./types";

export function YordamchiLimitCard({
  items,
  used = 0,
  active,
  onClick,
}: {
  items: Z[];
  used?: number;
  active?: boolean;
  onClick?: () => void;
}) {
  // Limit — equipment turidagi yagona qator (parent_id null)
  const equipRow = items.find((i: any) => i.kind === "equipment" && !i.parent_id);
  const limit = Number((equipRow as any)?.total ?? (equipRow as any)?.unit_price ?? 0);
  const pct = limit > 0 ? Math.round((used / limit) * 100) : 0;
  const over = used > limit && limit > 0;
  const barWidth = Math.min(100, pct);

  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={[
        "text-left rounded-2xl border-2 bg-card p-4 transition-all",
        over ? "border-rose-600" : "border-emerald-600",
        onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : "",
        active ? "ring-2 ring-primary" : "",
      ].join(" ")}
    >
      <div className="text-xs font-medium text-muted-foreground">Yordamchi</div>
      <div className={`mt-1 text-lg font-extrabold tabular-nums tracking-tight ${over ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}`}>
        {fmtUZSc(limit)}
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full transition-all ${over ? "bg-rose-600" : "bg-emerald-600"}`} style={{ width: `${barWidth}%` }} />
      </div>
      <div className="mt-1.5 text-[10px] font-bold">
        <span className={over ? "text-rose-700 dark:text-rose-300" : "text-emerald-700 dark:text-emerald-300"}>{pct}%</span>
      </div>
    </Comp>
  );
}
