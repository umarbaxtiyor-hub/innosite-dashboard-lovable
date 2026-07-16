import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Sparkles, Mic, MicOff, Loader2, Wand2, Trash2, Plus } from "lucide-react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { parseJurnalEntry } from "@/lib/jurnal-ai.functions";

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

const todayStr = () => new Date().toISOString().slice(0, 10);

const paymentMethod = (value?: string | null) =>
  /bank|plastik|karta|o'?tkazma|hisob/i.test(String(value ?? "")) ? "Bank" : "Naqd";

export function AiQuickEntryDialog({ projectId, disabled }: { projectId: string | null; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const qc = useQueryClient();
  const parseFn = useServerFn(parseJurnalEntry);

  useEffect(() => {
    if (!open) {
      setText(""); setItems([]); stopMic();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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
      setItems(its.map((i) => ({ ...i, date: i.date ?? todayStr(), qty: Number(i.qty) || 1, unit_price: Number(i.unit_price) || 0 })));
      toast.success(`AI ${its.length} ta yozuv tayyorladi`);
    },
    onError: (e: any) => toast.error(e?.message ?? "AI tahlil xatosi"),
  });

  const saveM = useMutation({
    mutationFn: async () => {
      if (!projectId) throw new Error("Loyiha tanlanmagan");
      if (!items.length) throw new Error("Yozuvlar yo'q");
      const mats: any[] = [];
      const works: any[] = [];
      const exps: any[] = [];
      const incs: any[] = [];
      for (const it of items) {
        const date = it.date || todayStr();
        if (it.kind === "material") {
          mats.push({
            project_id: projectId,
            material_name: it.name,
            qty: it.qty,
            unit: it.unit,
            unit_price: it.unit_price,
            supplier_name: it.who,
            received_at: date,
            zayavka_id: it.matched_zayavka_id ?? undefined,
            boq_item_id: it.boq_item_id ?? undefined,
            boq_code: it.boq_code ?? undefined,
            master_material_id: it.master_material_id ?? undefined,
            source: "web_ai",
            source_note: it.note,
          });
        } else if (it.kind === "work") {
          works.push({
            project_id: projectId,
            work_type: it.name,
            qty_done: it.qty,
            unit: it.unit,
            unit_price: it.unit_price,
            brigade_name: it.who,
            work_date: date,
            zayavka_id: it.matched_zayavka_id ?? undefined,
            boq_item_id: it.boq_item_id ?? undefined,
            boq_code: it.boq_code ?? undefined,
            master_work_id: it.master_work_id ?? undefined,
            source: "web_ai",
            source_note: it.note,
          });
        } else if (it.kind === "income") {
          const amount = Number(it.unit_price) || (Number(it.qty) || 1) * (Number(it.unit_price) || 0);
          const _t = `${it.name ?? ""} ${it.note ?? ""} ${it.category ?? ""}`.toLowerCase();
          const _isContract = /shartnom|kontrak|contract/.test(_t);
          incs.push({
            project_id: projectId,
            category: _isContract ? "Shartnoma" : "Kirim",
            description: it.name,
            amount,
            payment_method: paymentMethod(it.payment_method || it.note || it.name),
            payer: it.who,
            income_date: date,
            source: "web_ai",
            source_note: it.note,
          });
        } else {
          exps.push({
            project_id: projectId,
            category: it.category?.trim() || "Boshqa",
            description: it.name,
            qty: it.qty,
            unit: it.unit,
            unit_price: it.unit_price,
            amount: (it.qty || 1) * (it.unit_price || 0),
            payment_method: "Naqd" as const,
            paid_by: it.who,
            expense_date: date,
            zayavka_id: it.matched_zayavka_id ?? undefined,
            boq_item_id: it.boq_item_id ?? undefined,
            boq_code: it.boq_code ?? undefined,
            source: "web_ai",
            source_note: it.note,
          });
        }
      }
      const errs: string[] = [];
      if (mats.length) {
        const { error } = await supabase.from("material_receipts").insert(mats);
        if (error) errs.push(`Material: ${error.message}`);
      }
      if (works.length) {
        const { error } = await supabase.from("work_progress").insert(works);
        if (error) errs.push(`Ish: ${error.message}`);
      }
      if (exps.length) {
        const { error } = await supabase.from("expenses").insert(exps);
        if (error) errs.push(`Xarajat: ${error.message}`);
      }
      if (incs.length) {
        const { error } = await supabase.from("incomes").insert(incs);
        if (error) errs.push(`Kirim: ${error.message}`);
      }
      if (errs.length) throw new Error(errs.join("; "));
      return { mats: mats.length, works: works.length, exps: exps.length, incs: incs.length };
    },
    onSuccess: (s) => {
      toast.success(`Saqlandi — material: ${s.mats}, ish: ${s.works}, xarajat: ${s.exps}, kirim: ${s.incs}`);
      qc.invalidateQueries({ queryKey: ["master-jadval"] });
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Saqlashda xato"),
  });

  function patch(i: number, p: Partial<Item>) {
    setItems((arr) => arr.map((it, idx) => (idx === i ? { ...it, ...p } : it)));
  }
  function removeAt(i: number) { setItems((arr) => arr.filter((_, idx) => idx !== i)); }
  function addBlank() {
    setItems((arr) => [...arr, { kind: "expense", matched_zayavka_id: null, category: "Boshqa", name: "", unit: "dona", qty: 1, unit_price: 0, who: null, note: null, date: todayStr() }]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="secondary" onClick={() => setOpen(true)} disabled={disabled || !projectId}>
        <Sparkles className="mr-2 h-4 w-4" /> AI orqali kiritish
      </Button>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" /> AI bilan tezkor kiritish
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            Kirim uchun “bankdan 5 mln kirim”, “kassaga 2 mln naqd tushdi”, “pul oldim” deb yozing yoki ayting — tizim uni xarajat emas, kirim sifatida saqlaydi.
          </div>
          <div className="relative">
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Masalan: bankdan 5 mln kirim; kassaga 2 mln naqd tushdi; bugun 10 qop sement keldi 75000 dan; transport 200000"
              className="min-h-[100px] pr-12"
            />
            <Button
              size="icon"
              variant={listening ? "destructive" : "outline"}
              className="absolute right-2 top-2 h-8 w-8"
              onClick={listening ? stopMic : startMic}
              type="button"
              title={listening ? "To'xtatish" : "Ovoz orqali yozish"}
            >
              {listening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button onClick={() => parseM.mutate()} disabled={parseM.isPending || !text.trim()}>
              {parseM.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              AI tahlil qilsin
            </Button>
            {items.length > 0 && (
              <Button variant="outline" size="sm" onClick={addBlank}>
                <Plus className="mr-1 h-3.5 w-3.5" /> Qo'shish
              </Button>
            )}
          </div>

          {items.length > 0 && (
            <div className="max-h-[50vh] overflow-auto rounded-md border">
              <div className="divide-y">
                {items.map((it, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2 p-2 text-xs items-center">
                    <div className="col-span-2">
                      <Badge
                        variant={it.kind === "expense" ? "destructive" : it.kind === "work" ? "default" : it.kind === "income" ? "outline" : "secondary"}
                        className="cursor-pointer"
                        onClick={() => {
                          const next: Item["kind"] =
                            it.kind === "material" ? "work"
                            : it.kind === "work" ? "expense"
                            : it.kind === "expense" ? "income"
                            : "material";
                          patch(i, {
                            kind: next,
                            matched_zayavka_id: next === "expense" || next === "income" ? null : it.matched_zayavka_id,
                            category: next === "expense" ? (it.category || "Boshqa") : next === "income" ? "Kirim" : null,
                            payment_method: next === "income" ? (it.payment_method || "Naqd") : it.payment_method,
                          });
                        }}
                        title="Turini almashtirish (Material → Ish → Xarajat → Kirim)"
                      >
                        {it.kind === "material" ? "Material" : it.kind === "work" ? "Ish" : it.kind === "income" ? "💰 Kirim" : "Xarajat"}
                        {it.matched_zayavka_id ? " ✓" : ""}
                      </Badge>
                    </div>
                    <Input className="h-8 col-span-4" value={it.name} onChange={(e) => patch(i, { name: e.target.value })} placeholder="Nomi" />
                    <Input className="h-8 col-span-1 text-right" inputMode="decimal" value={String(it.qty)} onChange={(e) => patch(i, { qty: Number(e.target.value) || 0 })} />
                    <Input className="h-8 col-span-1" value={it.unit ?? ""} onChange={(e) => patch(i, { unit: e.target.value })} placeholder="dona" />
                    <Input className="h-8 col-span-2 text-right" inputMode="decimal" value={String(it.unit_price)} onChange={(e) => patch(i, { unit_price: Number(e.target.value) || 0 })} placeholder="narx" />
                    <Input className="h-8 col-span-1 text-xs" type="date" value={it.date ?? todayStr()} onChange={(e) => patch(i, { date: e.target.value })} />
                    <div className="col-span-1 flex justify-end">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeAt(i)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    {it.kind === "expense" && (
                      <Input
                        className="h-8 col-span-3 col-start-3 text-xs"
                        value={it.category ?? ""}
                        onChange={(e) => patch(i, { category: e.target.value })}
                        placeholder="Kategoriya (Bozorlik, Transport...)"
                      />
                    )}
                    {it.kind === "income" && (
                      <select
                        className="h-8 col-span-3 col-start-3 rounded-md border border-input bg-background px-2 text-xs"
                        value={paymentMethod(it.payment_method)}
                        onChange={(e) => patch(i, { payment_method: e.target.value })}
                      >
                        <option value="Naqd">Naqd</option>
                        <option value="Bank">Bank</option>
                      </select>
                    )}
                    <Input
                      className={`h-8 ${it.kind === "expense" || it.kind === "income" ? "col-span-3" : "col-span-6 col-start-3"} text-xs`}
                      value={it.who ?? ""}
                      onChange={(e) => patch(i, { who: e.target.value || null })}
                      placeholder={it.kind === "income" ? "Kimdan keldi" : "Kim (ta'minotchi/ishchi)"}
                    />
                    <Input className="h-8 col-span-5 text-xs" value={it.note ?? ""} onChange={(e) => patch(i, { note: e.target.value || null })} placeholder="Izoh" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Bekor</Button>
          <Button onClick={() => saveM.mutate()} disabled={saveM.isPending || !items.length}>
            {saveM.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Hammasini saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
