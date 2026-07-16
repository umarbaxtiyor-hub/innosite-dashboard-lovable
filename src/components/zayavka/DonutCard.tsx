import { fmtUZSc } from "@/lib/queries";

const FRAMES = {
  navy:   { border: "border-[#0F1B3D]",   stroke: "#0F1B3D",  text: "text-[#0F1B3D] dark:text-sky-200" },
  orange: { border: "border-orange-500",  stroke: "#f97316",  text: "text-orange-600 dark:text-orange-300" },
  green:  { border: "border-emerald-600", stroke: "#059669",  text: "text-emerald-700 dark:text-emerald-300" },
  red:    { border: "border-rose-600",    stroke: "#e11d48",  text: "text-rose-700 dark:text-rose-300" },
} as const;

export function DonutCard({
  label,
  value,
  used = 0,
  active,
  onClick,
  frame = "navy",
  showAmount = true,
}: {
  label: string;
  value: number;
  used?: number;
  active?: boolean;
  onClick?: () => void;
  frame?: keyof typeof FRAMES;
  showAmount?: boolean;
}) {
  const pct = value > 0 ? Math.round((used / value) * 100) : 0;
  const over = used > value && value > 0;
  const f = FRAMES[over ? "red" : frame];

  const size = 80;
  const stroke = 9;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const dash = (Math.min(100, pct) / 100) * c;

  const Comp: any = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={[
        "w-full text-left rounded-2xl bg-card p-3 transition-all flex flex-col items-center gap-2",
        onClick ? "cursor-pointer hover:shadow-md hover:-translate-y-0.5" : "",
        active ? "ring-2 ring-primary" : "",
      ].join(" ")}
    >
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground text-center leading-tight">
        {label}
      </div>
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-muted opacity-40" />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={f.stroke}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            className="transition-all"
          />
        </svg>
        <div className={`absolute inset-0 flex items-center justify-center text-sm font-extrabold tabular-nums ${f.text}`}>
          {pct}%
        </div>
      </div>
      {showAmount && (
        <div className={`text-sm sm:text-base font-extrabold tabular-nums tracking-tight text-center ${f.text}`}>
          {fmtUZSc(used)}
        </div>
      )}
    </Comp>
  );
}
