import { cn } from "@/lib/utils";

type Tone = "ok" | "warn" | "critical" | "info" | "muted" | "success";

const toneMap: Record<Tone, string> = {
  ok: "bg-success/10 text-success border border-success/20",
  success: "bg-success/10 text-success border border-success/20",
  warn: "bg-warning/15 text-warning-foreground border border-warning/30",
  critical: "bg-destructive/10 text-destructive border border-destructive/20",
  info: "bg-primary/10 text-primary border border-primary/20",
  muted: "bg-muted text-muted-foreground border border-border",
};

export function StatusBadge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        toneMap[tone],
      )}
    >
      {children}
    </span>
  );
}
