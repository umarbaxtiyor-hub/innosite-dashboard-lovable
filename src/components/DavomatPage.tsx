import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, LogIn, Calendar, Download, AlertTriangle, CheckCircle2, BarChart3, Search, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const UZ_MONTHS = ["Yanvar","Fevral","Mart","Aprel","May","Iyun","Iyul","Avgust","Sentabr","Oktabr","Noyabr","Dekabr"];

function MonthPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [y, m] = value.split("-").map((n) => parseInt(n, 10));
  const [year, setYear] = useState(y || new Date().getFullYear());
  const monthIdx = (m || 1) - 1;
  const label = `${UZ_MONTHS[monthIdx]} ${y}`;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-muted/50 px-3 text-xs font-semibold text-foreground shadow-sm hover:bg-muted"
        >
          <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="tabular-nums">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 rounded-2xl p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => setYear(year - 1)} className="rounded-lg p-1 hover:bg-muted"><ChevronLeft className="h-4 w-4" /></button>
          <div className="text-sm font-bold tabular-nums">{year}</div>
          <button type="button" onClick={() => setYear(year + 1)} className="rounded-lg p-1 hover:bg-muted"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="grid grid-cols-3 gap-1.5">
          {UZ_MONTHS.map((nm, i) => {
            const isActive = year === y && i === monthIdx;
            return (
              <button
                key={nm}
                type="button"
                onClick={() => {
                  onChange(`${year}-${String(i + 1).padStart(2, "0")}`);
                  setOpen(false);
                }}
                className={cn(
                  "rounded-lg px-2 py-2 text-[11px] font-semibold transition-colors",
                  isActive ? "bg-primary text-primary-foreground" : "bg-muted/40 hover:bg-muted text-foreground",
                )}
              >
                {nm.slice(0, 3)}
              </button>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

type Att = {
  id: string;
  employee_id: string | null;
  employee_name: string | null;
  project_id: string | null;
  kind: "check_in" | "check_out";
  lat: number | null;
  lng: number | null;
  address: string | null;
  attendance_date: string;
  created_at: string;
  note: string | null;
  is_within_geofence: boolean | null;
  distance_m: number | null;
};

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("uz-UZ", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Tashkent" });
}

function diffHours(a: string, b: string) {
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  return `${h}s ${m}d`;
}

function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return (h || 0) * 60 + (m || 0);
}
function checkInMinutesTashkent(iso: string) {
  const t = new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Tashkent" });
  return toMin(t);
}
function lateness(checkInIso: string, workStart: string, graceMin = 0): number {
  const cur = checkInMinutesTashkent(checkInIso);
  const start = toMin(workStart) + (Number.isFinite(graceMin) ? graceMin : 0);
  return cur - start;
}

function monthKey(dateStr: string) { return dateStr.slice(0, 7); }

function csvEscape(v: string | number | null | undefined) {
  const s = v == null ? "" : String(v);
  if (/[",\n;]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob(["\uFEFF" + content], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

export function DavomatPage() {
  const [rows, setRows] = useState<Att[]>([]);
  const [search, setSearch] = useState("");
  const [workStart, setWorkStart] = useState("09:00");
  const [graceMin, setGraceMin] = useState(10);
  const [statsMonth, setStatsMonth] = useState<string>(new Date().toISOString().slice(0, 7));
  const [empDetail, setEmpDetail] = useState<string | null>(null);

  async function loadAtt() {
    const { data } = await supabase
      .from("employee_attendance")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1000);
    setRows((data ?? []) as Att[]);
  }
  async function loadSettings() {
    const { data } = await supabase.from("app_settings").select("key, value").in("key", ["work_start_time", "lateness_grace_min"]);
    for (const r of data ?? []) {
      if (r.key === "work_start_time" && r.value) setWorkStart(String(r.value));
      else if (r.key === "lateness_grace_min" && r.value != null) setGraceMin(parseInt(String(r.value), 10) || 0);
    }
  }
  useEffect(() => { loadAtt(); loadSettings(); }, []);

  useEffect(() => {
    const ch = supabase
      .channel("att")
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_attendance" }, () => loadAtt())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const todayCount = rows.filter((r) => r.attendance_date === today && r.kind === "check_in").length;
  const lateToday = rows.filter((r) => r.attendance_date === today && r.kind === "check_in" && lateness(r.created_at, workStart, graceMin) > 0).length;

  // Oylik per-xodim statistika
  const monthStats = useMemo(() => {
    const inMonth = rows.filter((r) => monthKey(r.attendance_date) === statsMonth);
    const byEmpDate = new Map<string, Map<string, { in?: Att; out?: Att }>>();
    for (const r of inMonth) {
      const emp = r.employee_name ?? r.employee_id ?? "—";
      if (!byEmpDate.has(emp)) byEmpDate.set(emp, new Map());
      const days = byEmpDate.get(emp)!;
      const cur = days.get(r.attendance_date) ?? {};
      if (r.kind === "check_in") {
        if (!cur.in || new Date(r.created_at) < new Date(cur.in.created_at)) cur.in = r;
      } else {
        if (!cur.out || new Date(r.created_at) > new Date(cur.out.created_at)) cur.out = r;
      }
      days.set(r.attendance_date, cur);
    }
    const result: Array<{
      employee: string;
      daysPresent: number;
      lateCount: number;
      totalLateMin: number;
      totalHours: number;
      offsiteCount: number;
    }> = [];
    for (const [emp, days] of byEmpDate.entries()) {
      let lateCount = 0, totalLateMin = 0, totalMs = 0, offsiteCount = 0;
      for (const d of days.values()) {
        if (d.in) {
          const lm = lateness(d.in.created_at, workStart, graceMin);
          if (lm > 0) { lateCount++; totalLateMin += lm; }
          if (d.in.is_within_geofence === false) offsiteCount++;
        }
        if (d.in && d.out) totalMs += new Date(d.out.created_at).getTime() - new Date(d.in.created_at).getTime();
      }
      result.push({
        employee: emp,
        daysPresent: days.size,
        lateCount,
        totalLateMin,
        totalHours: Math.round((totalMs / 3_600_000) * 10) / 10,
        offsiteCount,
      });
    }
    return result.sort((a, b) => b.totalLateMin - a.totalLateMin || b.daysPresent - a.daysPresent);
  }, [rows, statsMonth, workStart, graceMin]);

  const filteredStats = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return monthStats;
    return monthStats.filter((r) => r.employee.toLowerCase().includes(s));
  }, [monthStats, search]);

  const empDetailDays = useMemo(() => {
    if (!empDetail) return [] as Array<{ date: string; in?: Att; out?: Att; lateMin: number | null; dur: string }>;
    const days = new Map<string, { in?: Att; out?: Att }>();
    for (const r of rows) {
      if (monthKey(r.attendance_date) !== statsMonth) continue;
      const emp = r.employee_name ?? r.employee_id ?? "—";
      if (emp !== empDetail) continue;
      const cur = days.get(r.attendance_date) ?? {};
      if (r.kind === "check_in") {
        if (!cur.in || new Date(r.created_at) < new Date(cur.in.created_at)) cur.in = r;
      } else {
        if (!cur.out || new Date(r.created_at) > new Date(cur.out.created_at)) cur.out = r;
      }
      days.set(r.attendance_date, cur);
    }
    return Array.from(days.entries())
      .map(([date, v]) => ({
        date,
        in: v.in, out: v.out,
        lateMin: v.in ? lateness(v.in.created_at, workStart, graceMin) : null,
        dur: v.in && v.out ? diffHours(v.in.created_at, v.out.created_at) : "—",
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }, [empDetail, rows, statsMonth, workStart, graceMin]);

  function exportMonthStats(format: "csv" | "xlsx") {
    const headers = ["Xodim", "Ish kunlari", "Kechikkan kunlar", "Jami kechikish (daq)", "Jami soat", "Obyektdan tashqarida (kun)"];
    const lines = monthStats.map((s) => [s.employee, s.daysPresent, s.lateCount, s.totalLateMin, s.totalHours, s.offsiteCount]);
    if (format === "csv") {
      const csv = [headers, ...lines].map((row) => row.map(csvEscape).join(",")).join("\n");
      downloadFile(`oylik-davomat-${statsMonth}.csv`, csv, "text/csv");
    } else {
      const html = `<table><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr>${lines
        .map((row) => `<tr>${row.map((c) => `<td>${(c ?? "").toString().replace(/&/g, "&amp;").replace(/</g, "&lt;")}</td>`).join("")}</tr>`)
        .join("")}</table>`;
      downloadFile(`oylik-davomat-${statsMonth}.xls`, html, "application/vnd.ms-excel");
    }
  }

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <PageHeader
        title="Davomat"
        subtitle="Telegram bot orqali kelish/ketish, kechikishlar."
      />

      {/* KPI - mobil uchun ixcham */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-card p-2.5 shadow-sm">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"><Calendar className="h-3 w-3" /> Bugun</div>
          <div className="mt-0.5 text-sm font-bold tabular-nums">{today.slice(5)}</div>
        </div>
        <div className="rounded-2xl bg-card p-2.5 shadow-sm">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"><LogIn className="h-3 w-3" /> Kelganlar</div>
          <div className="mt-0.5 text-lg font-extrabold tabular-nums text-emerald-600">{todayCount}</div>
        </div>
        <div className="rounded-2xl bg-card p-2.5 shadow-sm">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground"><AlertTriangle className="h-3 w-3" /> Kechikkan</div>
          <div className="mt-0.5 text-lg font-extrabold tabular-nums text-amber-600">{lateToday}</div>
        </div>
      </div>

      {/* Search + Oy + Export */}
      <div className="flex flex-row items-center gap-1.5">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Xodim qidirish..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 rounded-xl border-0 bg-muted/50 pl-8 text-sm shadow-sm"
          />
        </div>
        <MonthPicker value={statsMonth} onChange={setStatsMonth} />
        <Button size="icon" variant="secondary" className="h-9 w-9 shrink-0 rounded-xl" onClick={() => exportMonthStats("xlsx")} title="Excel">
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Oylik xodim kartochkalari */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 px-1 text-[11px] uppercase tracking-wide text-muted-foreground">
          <BarChart3 className="h-3.5 w-3.5" /> Oylik statistika
        </div>
        {filteredStats.length === 0 ? (
          <div className="rounded-2xl bg-card p-8 text-center text-sm text-muted-foreground shadow-sm">
            Bu oy uchun yozuv yo'q
          </div>
        ) : (
          <ul className="space-y-2">
            {filteredStats.map((s) => (
              <li key={s.employee}>
                <button
                  onClick={() => setEmpDetail(s.employee)}
                  className="flex w-full items-center gap-3 rounded-2xl bg-card px-3 py-3 text-left shadow-sm transition-colors hover:bg-muted/40"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sky-100 text-sm font-bold text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                    {s.employee.trim().charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[14px] font-semibold leading-tight">{s.employee}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="tabular-nums">{s.daysPresent} kun</span>
                      <span>•</span>
                      <span className="tabular-nums">{s.totalHours} s</span>
                      {s.lateCount > 0 && (
                        <>
                          <span>•</span>
                          <span className="tabular-nums text-destructive">{s.lateCount} kech</span>
                        </>
                      )}
                      {s.offsiteCount > 0 && (
                        <>
                          <span>•</span>
                          <span className="tabular-nums text-amber-600">{s.offsiteCount} tashq.</span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="ml-1 h-4 w-4 shrink-0 text-muted-foreground/60" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Xodim detal */}
      <Dialog open={!!empDetail} onOpenChange={(v) => !v && setEmpDetail(null)}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-auto p-4">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              {empDetail}
            </DialogTitle>
            <div className="text-xs text-muted-foreground">{statsMonth} — kunlik davomat</div>
          </DialogHeader>
          <div className="mt-2 space-y-2">
            {empDetailDays.length === 0 && (
              <div className="rounded-xl bg-muted/40 py-8 text-center text-sm text-muted-foreground">Yozuv yo'q</div>
            )}
            {empDetailDays.map((d, i) => {
              const within = d.in?.is_within_geofence ?? d.out?.is_within_geofence ?? null;
              return (
                <div key={i} className="rounded-xl border bg-card p-3 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold tabular-nums">{d.date.slice(5)}</div>
                    {d.lateMin != null && d.lateMin > 0 ? (
                      <Badge variant="destructive" className="text-[10px]">+{d.lateMin} daq</Badge>
                    ) : d.in ? (
                      <Badge variant="secondary" className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30 text-[10px]">O'z vaqtida</Badge>
                    ) : null}
                  </div>
                  <div className="mt-1.5 flex items-center gap-3 text-xs">
                    <span className="tabular-nums"><span className="text-emerald-600">●</span> {d.in ? fmtTime(d.in.created_at) : "—"}</span>
                    <span className="tabular-nums"><span className="text-rose-600">●</span> {d.out ? fmtTime(d.out.created_at) : "—"}</span>
                    <span className="ml-auto tabular-nums text-muted-foreground">{d.dur}</span>
                  </div>
                  {within != null && (
                    <div className={cn("mt-1.5 inline-flex items-center gap-1 text-[10px]",
                      within ? "text-emerald-700" : "text-amber-700")}>
                      {within ? <CheckCircle2 className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                      {within ? "Obyektda" : "Tashqarida"} · {d.in?.distance_m ?? d.out?.distance_m ?? "?"} m
                      {(d.in?.lat && d.in?.lng) && (
                        <a href={`https://www.google.com/maps?q=${d.in.lat},${d.in.lng}`} target="_blank" rel="noreferrer" className="ml-1 inline-flex items-center text-primary hover:underline">
                          <MapPin className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
