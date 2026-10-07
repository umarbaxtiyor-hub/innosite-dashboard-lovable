import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/PageHeader";
import { useActiveProject } from "@/lib/project-context";
import { Trash2 } from "lucide-react";
import { SummaryCard } from "@/components/zayavka/SummaryCard";
import { DonutCard } from "@/components/zayavka/DonutCard";
import { ExcelUploadCard } from "@/components/zayavka/ExcelUploadCard";
import { ItemsTable } from "@/components/zayavka/ItemsTable";
import { OperatsionCategories } from "@/components/zayavka/OperatsionCategories";

import { AddItemDialog } from "@/components/zayavka/AddItemDialog";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useCurrentRoles } from "@/hooks/use-current-roles";
import type { Kind, Z } from "@/components/zayavka/types";
import { isMaterialMirrorExpense } from "@/lib/boq-category-map";


export const Route = createFileRoute("/master-zayavka")({
  validateSearch: (search: Record<string, unknown>): { tab?: "material" | "work" | "variations" | "ustalar" } => {
    const t = search.tab;
    return { tab: t === "work" || t === "variations" || t === "material" || t === "ustalar" ? t : undefined };
  },
  head: () => ({
    meta: [
      { title: "Smeta (B.O.Q) — QurilishNazorat" },
      { name: "description", content: "Loyiha bo'yicha master material va ish turlari rejasi." },
    ],
  }),
  component: ZayavkaPage,
});



function ZayavkaPage() {
  const { activeProjectId, activeProject } = useActiveProject();
  const { hasAny } = useCurrentRoles();
  const canEdit = hasAny(["admin", "finans"]);
  const showAmount = hasAny(["admin", "finans", "ceo"]);
  const search = Route.useSearch();
  const [items, setItems] = useState<Z[]>([]);
  const [tab, setTab] = useState<"material" | "work" | "variations">(search.tab === "ustalar" ? "work" : (search.tab ?? "material"));
  const [usage, setUsage] = useState<{ material: number; work: number; equipment: number }>({ material: 0, work: 0, equipment: 0 });
  const [opsLimit, setOpsLimit] = useState(0);
  const [opsUsed, setOpsUsed] = useState(0);

  useEffect(() => {
    if (!activeProjectId) { setOpsLimit(0); setOpsUsed(0); return; }
    (async () => {
      const [lim, exp, mat, pay] = await Promise.all([
        supabase.from("project_zayavka").select("unit_price,total").eq("project_id", activeProjectId).eq("kind", "equipment").is("parent_id", null).limit(1).maybeSingle(),
        supabase.from("expenses").select("amount,kind,source").eq("project_id", activeProjectId),
        supabase.from("material_receipts").select("qty,unit_price,total_price").eq("project_id", activeProjectId),
        supabase.from("brigade_payments").select("amount").eq("project_id", activeProjectId),
      ]);
      setOpsLimit(Number((lim.data as any)?.unit_price ?? (lim.data as any)?.total ?? 0));

      // Pul nazorati: Material + Ishlar + Operatsion = jami chiqim
      const exps = (exp.data ?? []).filter((r: any) => !isMaterialMirrorExpense(r));
      const expSum = exps.reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const matSum = (mat.data ?? []).reduce(
        (s: number, r: any) => s + (Number(r.total_price) || Number(r.qty) * Number(r.unit_price) || 0),
        0,
      );
      const paySum = (pay.data ?? []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const byKind = (ks: string[]) =>
        exps.filter((r: any) => ks.includes(String(r.kind ?? ""))).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
      const total = matSum + expSum + paySum;
      const usedMat = matSum + byKind(["boq_material"]);
      const usedWork = paySum + byKind(["boq_work", "ustalar"]);
      setUsage({ material: usedMat, work: usedWork, equipment: 0 });
      setOpsUsed(total - usedMat - usedWork);
    })();
  }, [activeProjectId]);


  
  useEffect(() => { if (search.tab) setTab(search.tab === "ustalar" ? "work" : search.tab); }, [search.tab]);
  // Sub-zayavkalardan hisoblanadi (parent_id orqali)
  const [reqByZ, setReqByZ] = useState<Record<string, number>>({});
  const [recvByZ, setRecvByZ] = useState<Record<string, number>>({});
  // Fakt birim narx (qabul/ish narxlaridan weighted average)
  const [factByZ, setFactByZ] = useState<Record<string, { qty: number; value: number; unitPrice: number }>>({});


  async function loadItems() {
    if (!activeProjectId) { setItems([]); setUsage({ material: 0, work: 0, equipment: 0 }); setReqByZ({}); setRecvByZ({}); setFactByZ({}); return; }
    const { data } = await supabase.from("project_zayavka").select("*").eq("project_id", activeProjectId).is("zayavka_no", null).order("created_at", { ascending: false });
    const all = (data ?? []) as (Z & { parent_id: string | null; qty_received: number | null; workflow_status: string; master_material_id: string | null; master_work_id: string | null })[];
    const masters = all.filter((r) => !r.parent_id);
    setItems(masters as Z[]);

    const req: Record<string, number> = {};
    const recv: Record<string, number> = {};
    masters.forEach((m) => { recv[m.id] = Number(m.qty_received || 0); });
    all.filter((r) => r.parent_id && !["rejected", "draft"].includes(r.workflow_status)).forEach((c) => {
      req[c.parent_id!] = (req[c.parent_id!] ?? 0) + Number(c.qty || 0);
      recv[c.parent_id!] = (recv[c.parent_id!] ?? 0) + Number(c.qty_received || 0);
    });
    setReqByZ(req);
    setRecvByZ(recv);

    // Master -> related zayavka ids (o'zi + sub-zayavkalar)
    const zayavkaToMaster: Record<string, string> = {};
    masters.forEach((m) => { zayavkaToMaster[m.id] = m.id; });
    all.forEach((r) => { if (r.parent_id && zayavkaToMaster[r.parent_id]) zayavkaToMaster[r.id] = r.parent_id; });

    const [mat, work] = await Promise.all([
      supabase.from("material_receipts").select("qty,unit_price,total_price,master_material_id,zayavka_id").eq("project_id", activeProjectId),
      supabase.from("work_progress").select("qty_done,unit_price,total_value,master_work_id,zayavka_id").eq("project_id", activeProjectId),
    ]);

    // Fakt narx: weighted average qty va total dan
    const fact: Record<string, { qty: number; value: number; unitPrice: number }> = {};
    const addFact = (mid: string, q: number, v: number) => {
      if (!mid || q <= 0) return;
      const cur = fact[mid] ?? { qty: 0, value: 0, unitPrice: 0 };
      cur.qty += q; cur.value += v;
      cur.unitPrice = cur.qty > 0 ? cur.value / cur.qty : 0;
      fact[mid] = cur;
    };
    (mat.data ?? []).forEach((r: any) => {
      const q = Number(r.qty || 0);
      const v = Number(r.total_price) || q * Number(r.unit_price || 0);
      let masterId: string | null = r.zayavka_id ? (zayavkaToMaster[r.zayavka_id] ?? null) : null;
      if (!masterId && r.master_material_id) {
        const m = masters.find((x) => x.master_material_id === r.master_material_id && x.kind === "material");
        if (m) masterId = m.id;
      }
      if (masterId) addFact(masterId, q, v);
    });
    (work.data ?? []).forEach((r: any) => {
      const q = Number(r.qty_done || 0);
      const v = Number(r.total_value) || q * Number(r.unit_price || 0);
      let masterId: string | null = r.zayavka_id ? (zayavkaToMaster[r.zayavka_id] ?? null) : null;
      if (!masterId && r.master_work_id) {
        const m = masters.find((x) => x.master_work_id === r.master_work_id && x.kind === "work");
        if (m) masterId = m.id;
      }
      if (masterId) addFact(masterId, q, v);
    });
    // Kunlik hisobot (Daily Report) satrlari — asosan 'ustalar' turi uchun hajm + hisob
    const { data: daily } = await supabase
      .from("daily_report_lines")
      .select("qty_done,zayavka_id")
      .in("zayavka_id", Object.keys(zayavkaToMaster));
    (daily ?? []).forEach((r: any) => {
      const q = Number(r.qty_done || 0);
      if (q <= 0) return;
      const masterId = r.zayavka_id ? (zayavkaToMaster[r.zayavka_id] ?? null) : null;
      if (!masterId) return;
      const m = masters.find((x) => x.id === masterId);
      if (!m) return;
      const v = q * Number(m.unit_price || 0);
      addFact(masterId, q, v);
    });
    setFactByZ(fact);
    // Per-card usage endi alohida hisoblanadi (usage effect) — pul nazorati mantiqiga mos.
    // Bu yerda fact bo'yicha progress ko'rsatkichlari uchun faqat fact qoladi.
  }

  useEffect(() => { loadItems(); }, [activeProjectId]);

  // Avtomatik refresh yo'q: smeta faqat sahifa ochilganda yoki pull-to-refresh orqali yangilanadi.



  const filtered = useMemo(() => {
    if (tab === "variations") return items.filter((i) => i.off_plan === true);
    if (tab === "work") return items.filter((i) => (i.kind === "work" || i.kind === "ustalar") && !i.off_plan);
    return items.filter((i) => i.kind === (tab as Kind) && !i.off_plan);
  }, [items, tab]);
  const totals = useMemo(() => {
    const sum = (...ks: Kind[]) => items.filter((i) => ks.includes(i.kind) && !i.off_plan)
      .reduce((s, i) => s + Number(i.total || 0), 0);
    return { material: sum("material"), work: sum("work", "ustalar"), equipment: sum("equipment") };
  }, [items]);

  
  

  async function deleteAllSmeta() {
    if (!activeProjectId) return;
    try {
      // Sub-zayavka items
      const { data: zs } = await supabase.from("project_zayavka").select("id").eq("project_id", activeProjectId);
      const ids = (zs ?? []).map((z: any) => z.id);
      if (ids.length) {
        await supabase.from("project_zayavka_items").delete().in("zayavka_id", ids);
      }
      await supabase.from("project_zayavka").delete().eq("project_id", activeProjectId);
      await supabase.from("boq_items").delete().eq("project_id", activeProjectId);
      toast.success("Smeta to'liq o'chirildi");
      loadItems();
    } catch (e: any) {
      toast.error(e?.message || "O'chirishda xatolik");
    }
  }

  return (
    <div className="space-y-3 p-3 sm:p-4">
      <PageHeader
        title="Smeta (B.O.Q)"
        actions={activeProjectId && canEdit ? (
          <div className="flex items-center gap-2 flex-wrap">
            <AddItemDialog onDone={loadItems} allowCategorySelect triggerLabel="Qo'shish" triggerClassName="bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm" />
            <ExcelUploadCard projectId={activeProjectId} onDone={loadItems} compact />
            {items.length > 0 && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-1" /> Smetani o'chirish
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Smetani to'liq o'chirishni tasdiqlaysizmi?</AlertDialogTitle>
                    <AlertDialogDescription>
                      "{activeProject?.name}" loyihasidagi barcha smeta (material, ish turlari, rejadan tashqari va BOQ) o'chiriladi. Bu amalni qaytarib bo'lmaydi.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Bekor qilish</AlertDialogCancel>
                    <AlertDialogAction onClick={deleteAllSmeta} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">O'chirish</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        ) : null}
      />

      {!activeProjectId ? (
        <div className="rounded-xl border bg-card p-10 text-center text-sm text-muted-foreground">
          Yuqori o'ng burchakdan loyiha tanlang.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border-2 border-[var(--card-frame)] bg-card p-2 sm:p-3 space-y-2">
            {(() => {
              const grandLimit = totals.material + totals.work + opsLimit;
              const grandUsed = usage.material + usage.work + opsUsed;
              return (
                <>
                  <SummaryCard label="Umumiy limit" value={grandLimit} used={grandUsed} frame="navy" highlight flat showAmount={showAmount} />
                  <div className="grid grid-cols-3 gap-2 sm:gap-3">
                    <DonutCard label="Materiallar" value={totals.material} used={usage.material} active={tab === "material"} onClick={() => setTab("material")} frame="navy" showAmount={showAmount} />
                    <DonutCard label="Ish turlari" value={totals.work} used={usage.work} active={tab === "work"} onClick={() => setTab("work")} frame="orange" showAmount={showAmount} />
                    <DonutCard label="Operatsion" value={opsLimit} used={opsUsed} active={tab === "variations"} onClick={() => setTab("variations")} frame="green" showAmount={showAmount} />
                  </div>
                </>
              );
            })()}
          </div>

          <div className="mt-4 space-y-3">
            {tab === "material" && (
              <ItemsTable rows={filtered} reqByZ={reqByZ} recvByZ={recvByZ} factByZ={factByZ} onChanged={loadItems} title="Materiallar — asosiy ulush" canEdit={canEdit} showAmount={showAmount} />
            )}
            {tab === "work" && (
              <ItemsTable rows={filtered} reqByZ={reqByZ} recvByZ={recvByZ} factByZ={factByZ} onChanged={loadItems} title="Ish turlari — asosiy ulush" canEdit={canEdit} showAmount={showAmount} />
            )}
            {tab === "variations" && (
              <OperatsionCategories projectId={activeProjectId} limit={opsLimit} showAmount={showAmount} />
            )}
          </div>
        </>
      )}

    </div>
  );
}

