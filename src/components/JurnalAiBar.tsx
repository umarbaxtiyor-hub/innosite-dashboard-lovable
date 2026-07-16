import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Mic, MicOff, Loader2, Wand2, Check, Pencil, Trash2, X, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { parseJurnalEntry } from "@/lib/jurnal-ai.functions";
import { fmtUZS } from "@/lib/queries";

type Item = {
  kind: "material" | "work" | "expense" | "income";
  matched_zayavka_id: string | null;
  boq_item_id?: string | null;
  boq_code?: string | null;
  master_material_id?: string | null;
  master_work_id?: string | null;
  category: string | null;
  payment_method?: string | null;
  name: string;
  unit: string | null;
  qty: number;
  unit_price: number;
  who: string | null;
  note: string | null;
  date: string | null;
};

const ACCENT = "#38bdf8";
const todayStr = () => new Date().toISOString().slice(0, 10);

function confidenceOf(it: Item): { dot: string; label: string; level: "high" | "mid" | "low" } {
  let score = 0;
  if (it.matched_zayavka_id) score += 2;
  if (it.name?.trim()) score += 1;
  if (Number(it.qty) > 0) score += 1;
  if (Number(it.unit_price) > 0) score += 1;
  if (it.unit) score += 0.5;
  if (score >= 4) return { dot: "🟢", label: "Yuqori", level: "high" };
  if (score >= 2.5) return { dot: "🟡", label: "O'rta", level: "mid" };
  return { dot: "🔴", label: "Past", level: "low" };
}

const paymentMethod = (v?: string | null) =>
  /bank|plastik|karta|o'?tkazma|hisob/i.test(String(v ?? "")) ? "Bank" : "Naqd";

export function JurnalAiBar({ projectId }: { projectId: string | null }) {
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [editing, setEditing] = useState<number | null>(null);
  const [listening, setListening] = useState(false);
  const [open, setOpen] = useState(false);
  const recRef = useRef<any>(null);
  const qc = useQueryClient();
  const parseFn = useServerFn(parseJurnalEntry);

  useEffect(() => () => { try { recRef.current?.stop(); } catch {} }, []);

  function startMic() {
    const SR: any = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SR) { toast.error("Brauzer ovozni qo'llab-quvvatlamaydi"); return; }
    const r = new SR();
    r.lang = "uz-UZ";
    r.continuous = true;
    r.interimResults = true;
    let finalText = text;
    r.onresult = (e: any) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += (finalText ? " " : "") + t;
        else interim += t;
      }
      setText(finalText + (interim ? " " + interim : ""));
    };
    r.onerror = () => setListening(false);
    r.onend = () => setListening(false);
    r.start();
    recRef.current = r;
    setListening(true);
  }
  function stopMic() {
    try { recRef.current?.stop(); } catch {}
    recRef.current = null;
    setListening(false);
  }

  const parseM = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Loyiha tanlanmagan");
      if (!text.trim()) throw new Error("Matn kiriting yoki ovoz orqali ayting");
      const res = await parseFn({ data: { projectId, text: text.trim() } });
      return (res?.items ?? []) as Item[];
    },
    onSuccess: (its) => {
      if (!its.length) { toast.error("AI hech narsa topa olmadi"); return; }
      setItems(its.map((i) => ({
        ...i,
        date: i.date ?? todayStr(),
        qty: Number(i.qty) || 1,
        unit_price: Number(i.unit_price) || 0,
      })));
      toast.success(`AI ${its.length} ta yozuv tayyorladi`);
    },
    onError: (e: any) => toast.error(e?.message ?? "AI tahlil xatosi"),
  });

  async function saveOne(i: number) {
    const it = items[i];
    if (!projectId) {
      if (it.kind === "material" || it.kind === "work") {
        toast.error("Material/Ish uchun loyiha tanlash shart");
        return;
      }
      const ok = typeof window !== "undefined" && window.confirm(
        "Loyiha tanlanmagan. Loyihasiz saqlashni tasdiqlaysizmi?",
      );
      if (!ok) return;
    }
    const date = it.date || todayStr();
    let err: any = null;

    if (it.kind === "material") {
      ({ error: err } = await supabase.from("material_receipts").insert({
        project_id: projectId, material_name: it.name, qty: it.qty, unit: it.unit,
        unit_price: it.unit_price, supplier_name: it.who, received_at: date,
        zayavka_id: it.matched_zayavka_id ?? undefined,
        boq_item_id: it.boq_item_id ?? undefined,
        boq_code: it.boq_code ?? undefined,
        master_material_id: it.master_material_id ?? undefined,
        source: "web_ai", source_note: it.note,
      } as any));
    } else if (it.kind === "work") {
      ({ error: err } = await supabase.from("work_progress").insert({
        project_id: projectId, work_type: it.name, qty_done: it.qty, unit: it.unit,
        unit_price: it.unit_price, brigade_name: it.who, work_date: date,
        zayavka_id: it.matched_zayavka_id ?? undefined,
        boq_item_id: it.boq_item_id ?? undefined,
        boq_code: it.boq_code ?? undefined,
        master_work_id: it.master_work_id ?? undefined,
        source: "web_ai", source_note: it.note,
      } as any));
    } else if (it.kind === "income") {
      const amount = (it.qty || 1) * (it.unit_price || 0) || it.unit_price;
      const _t = `${it.name ?? ""} ${it.note ?? ""} ${(it as any).category ?? ""}`.toLowerCase();
      const _isContract = /shartnom|kontrak|contract/.test(_t);
      ({ error: err } = await supabase.from("incomes").insert({
        project_id: projectId, category: _isContract ? "Shartnoma" : "Kirim", description: it.name, amount,
        payment_method: paymentMethod(it.payment_method || it.note || it.name),
        payer: it.who, income_date: date, source: "web_ai", source_note: it.note,
      } as any));
    } else {
      ({ error: err } = await supabase.from("expenses").insert({
        project_id: projectId, category: it.category?.trim() || "Boshqa",
        description: it.name, qty: it.qty, unit: it.unit, unit_price: it.unit_price,
        amount: (it.qty || 1) * (it.unit_price || 0), payment_method: "Naqd" as const,
        paid_by: it.who, expense_date: date,
        zayavka_id: it.matched_zayavka_id ?? undefined,
        boq_item_id: it.boq_item_id ?? undefined,
        boq_code: it.boq_code ?? undefined,
        source: "web_ai", source_note: it.note,
      } as any));
    }
    if (err) { toast.error(err.message); return; }
    toast.success("Saqlandi");
    setItems((arr) => arr.filter((_, idx) => idx !== i));
    qc.invalidateQueries({ queryKey: ["master-jadval"] });
  }

  async function saveAll() {
    for (let i = items.length - 1; i >= 0; i--) await saveOne(i);
    setText("");
  }

  function patch(i: number, p: Partial<Item>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  }

  return (
    <Card className="p-2.5 border" style={{ borderColor: `${ACCENT}33`, background: `linear-gradient(135deg, ${ACCENT}0a, transparent)` }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 text-left"
      >
        <Sparkles className="h-4 w-4" style={{ color: ACCENT }} />
        <span className="text-sm font-semibold">AI tezkor kiritish</span>
        <Badge variant="outline" className="text-[10px]" style={{ borderColor: `${ACCENT}66`, color: ACCENT }}>
          uz-UZ ovoz · matn
        </Badge>
        {items.length > 0 && (
          <Badge variant="secondary" className="text-[10px]">{items.length} tayyor</Badge>
        )}
        <span className="ml-auto text-muted-foreground">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </button>

      {open && (
        <div className="mt-2.5">
          <div className="relative">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Masalan: 45m² travertin S1, 4.5M to'landi"
              className="min-h-[64px] pr-12 text-sm resize-none"
              style={{ borderColor: `${ACCENT}55` }}
            />
            <Button
              size="icon"
              variant={listening ? "destructive" : "outline"}
              className="absolute right-1.5 top-1.5 h-8 w-8 rounded-full"
              style={listening ? undefined : { borderColor: ACCENT, color: ACCENT }}
              onClick={listening ? stopMic : startMic}
              type="button"
              title={listening ? "To'xtatish" : "Ovoz orqali yozish"}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          </div>

          <div className="mt-2 flex items-center gap-2">
            <Button
              size="sm"
              onClick={() => parseM.mutate()}
              disabled={parseM.isPending || !text.trim() || !projectId}
              style={{ background: ACCENT, color: "#0b1220" }}
              className="hover:opacity-90 h-8"
            >
              {parseM.isPending ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Wand2 className="mr-1.5 h-3.5 w-3.5" />}
              AI tahlil
            </Button>
            {!projectId && <span className="text-xs text-muted-foreground">Avval loyiha tanlang</span>}
            {items.length > 1 && (
              <Button variant="outline" size="sm" className="h-8" onClick={saveAll}>
                <Check className="mr-1 h-3.5 w-3.5" /> Hammasini ({items.length})
              </Button>
            )}
          </div>
        </div>
      )}
      {items.length > 0 && (
        <div className="mt-3 space-y-2">
          {items.map((it, i) => {
            const conf = confidenceOf(it);
            const total = (it.qty || 0) * (it.unit_price || 0);
            return (
              <div
                key={i}
                className="rounded-lg border bg-card p-3 text-sm"
                style={{ borderColor: conf.level === "high" ? "#22c55e55" : conf.level === "mid" ? "#eab30855" : "#ef444455" }}
              >
                {editing === i ? (
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <select
                        className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                        value={it.kind}
                        onChange={(e) => patch(i, { kind: e.target.value as Item["kind"] })}
                      >
                        <option value="material">Material</option>
                        <option value="work">Ish</option>
                        <option value="expense">Xarajat</option>
                        <option value="income">Kirim</option>
                      </select>
                      <Input className="h-8 flex-1 min-w-[180px]" value={it.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Nomi" />
                      <Input className="h-8 w-20" type="date" value={it.date ?? todayStr()} onChange={(e) => patch(i, { date: e.target.value })} />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Input className="h-8 w-20 text-right" inputMode="decimal" value={String(it.qty)} onChange={(e) => patch(i, { qty: Number(e.target.value) || 0 })} placeholder="Miqdor" />
                      <Input className="h-8 w-20" value={it.unit ?? ""} onChange={(e) => patch(i, { unit: e.target.value })} placeholder="dona" />
                      <Input className="h-8 w-32 text-right" inputMode="decimal" value={String(it.unit_price)} onChange={(e) => patch(i, { unit_price: Number(e.target.value) || 0 })} placeholder="Narx" />
                      <Input className="h-8 flex-1 min-w-[140px]" value={it.who ?? ""} onChange={(e) => patch(i, { who: e.target.value || null })} placeholder="Kim" />
                    </div>
                    <Input className="h-8" value={it.note ?? ""} onChange={(e) => patch(i, { note: e.target.value || null })} placeholder="Izoh" />
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}><X className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" onClick={() => setEditing(null)} style={{ background: ACCENT, color: "#0b1220" }}>Tayyor</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 flex-wrap">
                    <span title={`Ishonch: ${conf.label}`} className="text-lg leading-none">{conf.dot}</span>
                    <Badge variant="secondary" className="uppercase text-[10px]">{
                      it.kind === "material" ? "Material" : it.kind === "work" ? "Ish" : it.kind === "income" ? "Kirim" : "Xarajat"
                    }</Badge>
                    {it.matched_zayavka_id && (
                      <Badge variant="outline" className="text-[10px]" style={{ borderColor: ACCENT, color: ACCENT }}>
                        BOQ ✓
                      </Badge>
                    )}
                    <span className="font-medium truncate flex-1 min-w-[140px]">{it.name || <em className="text-muted-foreground">(nomi yo'q)</em>}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {it.qty} {it.unit ?? ""} × {fmtUZS(it.unit_price)}
                    </span>
                    <span className="font-semibold tabular-nums" style={{ color: ACCENT }}>{fmtUZS(total)}</span>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => setEditing(i)} title="Tahrirlash">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" onClick={() => saveOne(i)} style={{ background: ACCENT, color: "#0b1220" }} title="Saqlash">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setItems((a) => a.filter((_, idx) => idx !== i))} title="O'chirish">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
