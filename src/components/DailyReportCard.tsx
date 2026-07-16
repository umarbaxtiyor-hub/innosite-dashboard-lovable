import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Copy, Send } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { useActiveProject } from "@/lib/project-context";
import { fmtUZS, fmtUZSc } from "@/lib/queries";
import { sendTelegramReport } from "@/server/telegram-report.functions";

type DayRow = {
  date: string;
  category: string;
  name: string;
  unit: string | null;
  qty: number | null;
  in_amount: number;
  out_amount: number;
  who: string | null;
};

export function DailyReportCard() {
  const { activeProjectId, activeProject, projects } = useActiveProject() as any;
  const [reportDate, setReportDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [chatId, setChatId] = useState<string>(() =>
    typeof window !== "undefined" ? localStorage.getItem("tg_report_chat_id") ?? "" : "",
  );
  const [confirmed, setConfirmed] = useState(false);
  const [sending, setSending] = useState(false);

  const { data: rows = [] } = useQuery({
    queryKey: ["daily-report-rows", activeProjectId ?? "all"],
    queryFn: async (): Promise<DayRow[]> => {
      const eq = (b: any) => (activeProjectId ? b.eq("project_id", activeProjectId) : b);
      const [mat, work, exp, bp] = await Promise.all([
        eq(supabase.from("material_receipts").select("*")),
        eq(supabase.from("work_progress").select("*")),
        eq(supabase.from("expenses").select("*")),
        eq(supabase.from("brigade_payments").select("*")),
      ]);
      const out: DayRow[] = [];
      for (const r of (mat.data ?? []) as any[]) {
        const total = Number(r.total_price) || (Number(r.qty) * Number(r.unit_price)) || 0;
        out.push({ date: r.received_at, category: "Material", name: r.material_name, unit: r.unit, qty: Number(r.qty) || 0, in_amount: 0, out_amount: total, who: r.supplier_name });
      }
      for (const r of (work.data ?? []) as any[]) {
        out.push({ date: r.work_date, category: "Ish", name: r.work_type, unit: r.unit, qty: Number(r.qty_done) || 0, in_amount: 0, out_amount: 0, who: r.brigade_name });
      }
      for (const r of (exp.data ?? []) as any[]) {
        out.push({ date: r.expense_date, category: r.category || "Xarajat", name: r.description || r.category || "Xarajat", unit: r.unit, qty: Number(r.qty) || null, in_amount: 0, out_amount: Number(r.amount) || 0, who: r.paid_by });
      }
      for (const r of (bp.data ?? []) as any[]) {
        out.push({ date: r.payment_date, category: "Brigada to'lovi", name: `${r.kind ?? "to'lov"}${r.brigade_name ? " — " + r.brigade_name : ""}`, unit: null, qty: null, in_amount: 0, out_amount: Number(r.amount) || 0, who: r.brigade_name });
      }
      return out;
    },
    enabled: !!projects,
    staleTime: 30_000,
  });

  const report = useMemo(() => {
    const opening = rows.filter((r) => (r.date ?? "") < reportDate).reduce((a, r) => a + r.in_amount - r.out_amount, 0);
    const dayRows = rows.filter((r) => r.date?.slice(0, 10) === reportDate);
    const kirim = dayRows.reduce((a, r) => a + r.in_amount, 0);
    const chiqim = dayRows.reduce((a, r) => a + r.out_amount, 0);
    return { opening, kirim, chiqim, closing: opening + kirim - chiqim, dayRows };
  }, [rows, reportDate]);

  function buildText() {
    const lines: string[] = [];
    lines.push(`📊 <b>Kunlik hisobot</b> — ${reportDate}`);
    if (activeProject?.name) lines.push(`🏗 Loyiha: ${activeProject.name}`);
    lines.push("");
    lines.push(`💼 Kun boshidagi balans: <b>${fmtUZS(report.opening)}</b>`);
    lines.push(`➕ Kirim: <b>${fmtUZS(report.kirim)}</b>`);
    lines.push(`➖ Chiqim: <b>${fmtUZS(report.chiqim)}</b>`);
    lines.push(`💰 Kun oxiridagi kassa: <b>${fmtUZS(report.closing)}</b>`);
    if (report.dayRows.length) {
      lines.push("");
      lines.push("📝 <b>Operatsiyalar:</b>");
      for (const r of report.dayRows) {
        const sign = r.in_amount ? "+" : "-";
        const amt = r.in_amount || r.out_amount;
        lines.push(`• ${r.category} — ${r.name}${r.qty ? ` (${r.qty} ${r.unit ?? ""})` : ""} ${sign}${fmtUZS(amt)}`);
      }
    }
    return lines.join("\n");
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(buildText().replace(/<\/?b>/g, ""));
      toast.success("Hisobot nusxalandi");
    } catch {
      toast.error("Nusxalashda xatolik");
    }
  }

  async function sendReport() {
    if (!chatId.trim()) return toast.error("Telegram chat ID kiriting");
    if (!confirmed) return toast.error("Avval hisobotni tasdiqlang");
    setSending(true);
    try {
      localStorage.setItem("tg_report_chat_id", chatId.trim());
      await sendTelegramReport({ data: { text: buildText(), chat_id: chatId.trim() } });
      toast.success("Telegramga yuborildi");
    } catch (e: any) {
      toast.error(e?.message || "Yuborishda xato");
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-sm font-semibold">Kunlik kassa hisoboti</div>
          <div className="text-xs text-muted-foreground">Kun davomidagi operatsiyalar, balans va kassa qoldig'i.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Input type="date" value={reportDate} onChange={(e) => { setReportDate(e.target.value); setConfirmed(false); }} className="h-9 w-44" />
          <Button variant="outline" size="sm" onClick={copyReport}>
            <Copy className="mr-2 h-4 w-4" /> Nusxalash
          </Button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-md border border-border p-3">
          <div className="text-[11px] text-muted-foreground">Kun boshidagi balans</div>
          <div className="mt-1 font-semibold tabular-nums">{fmtUZSc(report.opening)}</div>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="text-[11px] text-muted-foreground">Kirim</div>
          <div className="mt-1 font-semibold text-success tabular-nums">{fmtUZSc(report.kirim)}</div>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="text-[11px] text-muted-foreground">Chiqim</div>
          <div className="mt-1 font-semibold text-destructive tabular-nums">{fmtUZSc(report.chiqim)}</div>
        </div>
        <div className="rounded-md border border-border p-3">
          <div className="text-[11px] text-muted-foreground">Kassa qoldig'i</div>
          <div className={`mt-1 font-semibold tabular-nums ${report.closing >= 0 ? "text-success" : "text-destructive"}`}>{fmtUZSc(report.closing)}</div>
        </div>
      </div>

      <div className="mt-4 rounded-md border border-border">
        <div className="flex items-center justify-between border-b border-border bg-muted/40 px-3 py-2">
          <div className="text-xs font-medium">Kun operatsiyalari ({report.dayRows.length})</div>
        </div>
        <div className="max-h-64 overflow-auto">
          {report.dayRows.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">Bu kunda operatsiyalar yo'q</div>
          ) : (
            <ul className="divide-y divide-border">
              {report.dayRows.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.name}</div>
                    <div className="text-muted-foreground">{r.category}{r.qty ? ` · ${r.qty} ${r.unit ?? ""}` : ""}{r.who ? ` · ${r.who}` : ""}</div>
                  </div>
                  <div className={`tabular-nums font-medium ${r.in_amount ? "text-success" : "text-destructive"}`}>
                    {r.in_amount ? `+${fmtUZS(r.in_amount)}` : `-${fmtUZS(r.out_amount)}`}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3 sm:flex-row sm:items-center">
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          Hisobotni tasdiqlayman
        </label>
        <Input
          placeholder="Telegram chat ID"
          value={chatId}
          onChange={(e) => setChatId(e.target.value)}
          className="h-8 text-xs sm:max-w-xs"
        />
        <Button size="sm" onClick={sendReport} disabled={sending || !confirmed || !chatId.trim()} className="sm:ml-auto">
          <Send className="mr-2 h-4 w-4" /> {sending ? "Yuborilmoqda..." : "Telegramga jo'natish"}
        </Button>
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">
        Chat ID — botga <code>/start</code> bosib aloqani ochgan foydalanuvchi yoki guruh ID si.
      </p>
    </Card>
  );
}
