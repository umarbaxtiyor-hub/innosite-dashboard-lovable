import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: string;
  icon: LucideIcon;
  trend?: { value: string; tone?: "up" | "down" | "neutral" };
  hint?: string;
  accent?: "primary" | "steel" | "success" | "warning" | "destructive";
};

const accentMap: Record<NonNullable<Props["accent"]>, string> = {
  primary: "bg-primary/10 text-primary",
  steel: "bg-steel/10 text-steel",
  success: "bg-success/10 text-success",
  warning: "bg-warning/15 text-warning-foreground",
  destructive: "bg-destructive/10 text-destructive",
};

export function StatCard({ label, value, icon: Icon, trend, hint, accent = "primary" }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm transition hover:shadow-md sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground sm:text-xs">{label}</p>
          <p className="mt-1.5 text-base font-semibold tracking-tight text-foreground sm:mt-2 sm:text-2xl break-words">{value}</p>
        </div>
        <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-lg sm:h-10 sm:w-10", accentMap[accent])}>
          <Icon className="h-4 w-4 sm:h-5 sm:w-5" />
        </div>
      </div>
      {(trend || hint) && (
        <div className="mt-3 flex items-center justify-between text-xs">
          {trend && (
            <span
              className={cn(
                "rounded-md px-1.5 py-0.5 font-medium",
                trend.tone === "up" && "bg-destructive/10 text-destructive",
                trend.tone === "down" && "bg-success/10 text-success",
                (!trend.tone || trend.tone === "neutral") && "bg-muted text-muted-foreground",
              )}
            >
              {trend.value}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  );
}
