import { fmtUZSc } from "@/lib/queries";

const FRAMES = {
  navy:    { border: "border-[#0F1B3D]",  bar: "bg-[#0F1B3D]",  value: "text-[#0F1B3D] dark:text-sky-200" },
  orange:  { border: "border-orange-500", bar: "bg-orange-500", value: "text-orange-600 dark:text-orange-300" },
  green:   { border: "border-emerald-600", bar: "bg-emerald-600", value: "text-emerald-700 dark:text-emerald-300" },
  red:     { border: "border-rose-600",   bar: "bg-rose-600",   value: "text-rose-700 dark:text-rose-300" },
} as const;

export function SummaryCard({
  label,
  value,
  used = 0,
  highlight,
  active,
  onClick,
  frame = "navy",
  flat,
  showAmount = true,
}: {
  label: string;
  value: number;
  used?: number;
  highlight?: boolean;
  active?: boolean;
  onClick?: () => void;
  frame?: keyof typeof FRAMES;
  flat?: boolean;
  showAmount?: boolean;
}) {
  const pctRaw = value > 0 ? Math.round((used / value) * 100) : 0;
  const over = used > value && value > 0;
  const f = FRAMES[over ? "red" : frame];
  const barWidth = Math.min(100, pctRaw);

  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={[
        "text-left rounded-2xl bg-card p-3 transition-all w-full",
        flat ? "" : `border-2 ${f.border}`,
        onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : "",
        active ? "ring-2 ring-primary" : "",
      ].join(" ")}
    >
      <div className="flex items-baseline justify-between gap-2">
        <div className={`font-bold uppercase tracking-wider text-muted-foreground truncate ${highlight ? "text-[9px]" : "text-[10px]"}`}>{label}</div>
        {showAmount && (
          <div className={`tabular-nums font-extrabold tracking-tight truncate ${highlight ? "text-sm sm:text-base text-primary" : `text-base sm:text-lg ${f.value}`}`}>{fmtUZSc(value)}</div>
        )}
      </div>
      <div className={`mt-1.5 text-right font-bold ${f.value} ${highlight ? "text-[10px]" : "text-[11px]"}`}>{pctRaw}%</div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${f.bar} transition-all`} style={{ width: `${barWidth}%` }} />
      </div>
    </Comp>
  );
}
