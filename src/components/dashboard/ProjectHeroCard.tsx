import { fmtUZSc } from "@/lib/queries";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type Props = {
  name: string;
  subtitle?: string;
  startDate?: string | null;
  endDate?: string | null;
  adminName?: string | null;
  daysLeft?: number | null;
  shartnoma: number;
  tushgan: number;
  qoldiq: number;
  progress: number;
  topSlot?: ReactNode;
};

function fmtDate(d?: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}.${m}.${y}`;
}

function daysSince(d?: string | null): number | null {
  if (!d) return null;
  const start = new Date(d).getTime();
  if (Number.isNaN(start)) return null;
  const now = Date.now();
  return Math.floor((now - start) / (1000 * 60 * 60 * 24));
}

export function ProjectHeroCard({
  name, subtitle, startDate, endDate, adminName, daysLeft, shartnoma, tushgan, qoldiq, progress, topSlot,
}: Props) {
  const pctTushgan = shartnoma > 0 ? Math.round((tushgan / shartnoma) * 100) : 0;
  const pctQoldiq = shartnoma > 0 ? Math.round((qoldiq / shartnoma) * 100) : 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border-2 border-[var(--card-frame)] bg-gradient-to-br from-[#0F172A] via-[#1E293B] to-[#0F172A] text-white shadow-xl dark:from-[#020617] dark:via-[#0F172A] dark:to-[#020617]">
      {/* glow */}
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-[#F97316]/30 blur-3xl" />
      <div className="pointer-events-none absolute -left-10 bottom-0 h-40 w-40 rounded-full bg-[#F97316]/20 blur-3xl" />

      <div className="relative p-3 sm:p-4">
        {/* Top row: o'tdi (chap) | picker (markaz) | kunlar + rahbar (o'ng) */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex w-[26%] flex-col items-start gap-1.5">
            <div className="rounded-xl border border-white/10 bg-white/[0.08] backdrop-blur-md px-2.5 py-1.5 text-center shadow-lg shadow-black/20">
              <div className="text-sm font-extrabold text-sky-300 tabular-nums leading-tight">
                {(() => {
                  const v = daysSince(startDate);
                  return v == null ? "—" : v < 0 ? `+${Math.abs(v)}k` : `${v} kun`;
                })()}
              </div>
              <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-white/60">O'tdi</div>
            </div>
          </div>

          <div className="flex flex-1 justify-center" data-no-pull>
            {topSlot}
          </div>

          <div className="flex w-[26%] flex-col items-end gap-1.5">
            <div
              key={`days-${daysLeft ?? "none"}`}
              className="rounded-xl border border-white/10 bg-white/[0.08] backdrop-blur-md px-2.5 py-1.5 text-center shadow-lg shadow-black/20 animate-scale-in"
            >
              <div className={cn(
                "text-lg font-black leading-none tracking-tight drop-shadow-sm sm:text-2xl transition-colors",
                daysLeft != null && daysLeft < 0 ? "text-rose-400 animate-pulse" :
                daysLeft != null && daysLeft < 14 ? "text-amber-400 animate-pulse" : "text-emerald-400",
              )}>
                {daysLeft == null ? "—" : Math.abs(daysLeft)}
              </div>
              <div className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-white/70">
                {daysLeft != null && daysLeft < 0 ? "kechikdi" : "qoldi"}
              </div>
            </div>
            {false && adminName && null}
          </div>
        </div>

        {subtitle && (
          <p className="mt-2 truncate text-center text-[11px] text-white/70">{subtitle}</p>
        )}
        {false && <span className="hidden">{name}</span>}


        {/* Center: Boshlash / Tugash sanalari */}
        <div className="mt-2 flex items-center justify-center gap-4 rounded-lg bg-white/5 px-3 py-2">
          <div className="text-center">
            <div className="text-[9px] font-bold uppercase tracking-wide text-white/60">Boshlash</div>
            <div className="text-sm font-extrabold text-white tabular-nums sm:text-base">{fmtDate(startDate)}</div>
          </div>
          <div className="h-8 w-px bg-white/15" />
          <div className="text-center">
            <div className="text-[9px] font-bold uppercase tracking-wide text-white/60">Tugash</div>
            <div className="text-sm font-extrabold text-white tabular-nums sm:text-base">{fmtDate(endDate)}</div>
          </div>
        </div>


        {/* Stats: Shartnoma + Kirim + Qoldiq (markazda, kattaroq) */}
        <div className="mt-4 grid grid-cols-3 gap-3 items-start text-center justify-items-center">
          <Stat label="Shartnoma" value={shartnoma} pct={100} tone="primary" />
          <Stat label="Kirim" value={tushgan} pct={pctTushgan} tone="success" />
          <Stat label="Qoldiq" value={qoldiq} pct={pctQoldiq} tone="warn" />
        </div>

        {/* Progress */}
        <div className="mt-3">
          <div className="flex items-center justify-between text-xs text-white/80">
            <span className="font-semibold">Loyiha bajarilishi</span>
            <span className="text-lg font-extrabold text-white sm:text-xl drop-shadow-sm">{progress}%</span>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div
              className="h-full rounded-full bg-gradient-to-r from-sky-400 to-blue-300 transition-all"
              style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, pct, tone }: { label: string; value: number; pct: number; tone: "primary" | "warn" | "success" }) {
  const chip = {
    primary: "bg-blue-400 text-slate-950",
    warn: "bg-orange-400 text-slate-950",
    success: "bg-emerald-400 text-slate-950",
  }[tone];
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 text-center">
      <div className="text-[11px] font-bold uppercase tracking-wide text-white/90">{label}</div>
      <span className={cn("inline-block rounded-md px-2 py-0.5 text-[11px] font-extrabold", chip)}>{pct}%</span>
      <div className="truncate text-lg font-extrabold leading-tight tracking-tight text-white sm:text-2xl drop-shadow-sm">{fmtUZSc(value)}</div>
    </div>
  );
}
