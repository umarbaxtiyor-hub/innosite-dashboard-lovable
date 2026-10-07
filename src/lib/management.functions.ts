// Sync Monitor, legacy reconciliation, kategoriya mapping, CEO dashboard va AI Control Center server funksiyalari.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Server 1000 qatordan ko'p qaytarmaydi — jami summalar to'liq bo'lishi uchun sahifalab o'qiladi.
async function allPages(build: (f: number, t: number) => any): Promise<{ data: any[] }> {
  const out: any[] = [];
  for (let f = 0; f < 200_000; f += 1000) {
    const { data, error } = await build(f, f + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { data: out };
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as any;
}
async function requireRole(ctx: any, roles: string[]) {
  const { data } = await ctx.supabase.from("user_roles").select("role").eq("user_id", ctx.userId);
  const mine = (data ?? []).map((r: any) => r.role);
  if (!roles.some((r) => mine.includes(r))) throw new Error("Bu bo'lim uchun ruxsat yo'q");
  return mine as string[];
}
const MGMT = ["admin", "finans"];

/** Ichki texnik xatoni tushunarli qilib, secret/URL larsiz ko'rsatadi. */
export function friendlyError(e: string | null): string | null {
  if (!e) return null;
  const s = e.replace(/https?:\/\/\S+/g, "[url]").replace(/[A-Za-z0-9_-]{32,}/g, "[…]");
  if (/\[429\]|rate/i.test(s)) return "Google Sheets band (limit) — avtomatik qayta urinadi";
  if (/\[40[13]\]/.test(s)) return "Google Sheets ruxsati yo'q — ulanishni tekshiring";
  if (/\[404\]|topilmadi/.test(s)) return `Jadval yoki varaq topilmadi: ${s.slice(0, 120)}`;
  if (/\[5\d\d\]|timeout|fetch failed/i.test(s)) return "Google Sheets vaqtincha javob bermadi — qayta urinadi";
  return s.slice(0, 200);
}

export const getSyncMonitor = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireRole(context, MGMT);
  const db = await admin();
  const { syncHealthSnapshot } = await import("@/server/insights.server");
  const kpi = await syncHealthSnapshot(db);
  const { data: rows } = await db.from("sheet_sync_queue")
    .select("id,source_table,record_id,project_id,status,attempts,error,created_at,synced_at,needs_update,update_seq")
    .order("created_at", { ascending: false }).limit(300);
  const pids = Array.from(new Set((rows ?? []).map((r: any) => r.project_id).filter(Boolean)));
  const { data: projs } = pids.length ? await db.from("projects").select("id,name").in("id", pids) : { data: [] };
  const pn = new Map((projs ?? []).map((p: any) => [p.id, p.name]));
  const stuckBefore = Date.now() - 15 * 60_000;
  const list = (rows ?? []).map((r: any) => ({
    ...r, project: pn.get(r.project_id) ?? "—", error: friendlyError(r.error),
    failed: (r.status === "pending" && r.attempts > 0) || r.status === "error" || r.status === "skipped",
    stuck: r.status === "processing" && Date.parse(r.synced_at ?? r.created_at) < stuckBefore,
  })).sort((a: any, b: any) => Number(b.failed || b.stuck) - Number(a.failed || a.stuck));
  const { data: warns } = await db.from("sheet_sync_warnings").select("source_table,record_id,detail,occurrences,last_seen").eq("resolved", false).order("last_seen", { ascending: false }).limit(50);
  const { data: outbox } = await db.from("bot_sheet_outbox").select("id,kind,status,attempts,error,created_at,written_at").order("created_at", { ascending: false }).limit(30);
  const { data: links } = await db.from("sheet_legacy_links").select("tab,sheet_row,source_table,record_id,linked_by_email,created_at,note").order("created_at", { ascending: false }).limit(50);
  return { kpi, rows: list, warnings: warns ?? [], outbox: (outbox ?? []).map((o: any) => ({ ...o, error: friendlyError(o.error) })), links: links ?? [] };
});

export const retrySync = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { ids: string[] }) => ({ ids: (d?.ids ?? []).filter((x) => /^[0-9a-f-]{36}$/i.test(x)).slice(0, 200) }))
  .handler(async ({ context, data }) => {
    await requireRole(context, MGMT);
    const db = await admin();
    // Xavfsiz: faqat navbat holati qaytariladi; ledger takror yozishga yo'l qo'ymaydi
    if (data.ids.length) {
      await db.from("sheet_sync_queue").update({ status: "pending", error: null }).in("id", data.ids).in("status", ["pending", "error", "skipped", "processing"]);
    }
    const { flushSheetSync, flushBotOutbox } = await import("@/server/sheets-sync.server");
    const r = await flushSheetSync(100);
    const o = await flushBotOutbox(20);
    return { appended: r.appended, errors: r.errors.map((e) => friendlyError(e)), outbox: o };
  });

export const getLegacyPreview = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { target: number }) => ({ target: Number(d?.target ?? 0) }))
  .handler(async ({ context, data }) => {
    await requireRole(context, MGMT);
    const { syncTargets, legacyPreview } = await import("@/server/sheets-sync.server");
    const targets = await syncTargets();
    const t = targets[data.target];
    if (!t) return { targets: targets.map((x) => x.label), preview: null };
    return { targets: targets.map((x) => x.label), preview: await legacyPreview(t, t.width) };
  });

export const linkLegacyRow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { target: number; row: number; source: "expenses" | "incomes"; recordId: string; note?: string }) => ({
    target: Number(d.target), row: Number(d.row), source: d.source === "incomes" ? "incomes" as const : "expenses" as const,
    recordId: String(d.recordId ?? "").trim().toLowerCase(), note: d.note ? String(d.note).slice(0, 300) : undefined,
  }))
  .handler(async ({ context, data }) => {
    await requireRole(context, ["admin"]);
    const { syncTargets, legacyLink } = await import("@/server/sheets-sync.server");
    const t = (await syncTargets())[data.target];
    if (!t) throw new Error("Jadval topilmadi");
    const email = (context as any).claims?.email ?? null;
    return legacyLink(t, t.width, data.row, data.source, data.recordId, { id: context.userId, email }, data.note);
  });

export const getCategoryMapping = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireRole(context, MGMT);
  const db = await admin();
  const { data: map } = await db.from("sheet_category_map").select("id,kind,source_category,sheet_category,active").order("kind").order("source_category");
  const { data: cats } = await db.from("expense_categories").select("name,kind").order("name");
  return { map: map ?? [], categories: cats ?? [] };
});

export const saveCategoryMapping = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { kind: "expense" | "income"; source: string; sheet: string; active?: boolean }) => ({
    kind: d.kind === "income" ? "income" as const : "expense" as const,
    source: String(d.source ?? "").trim().slice(0, 120), sheet: String(d.sheet ?? "").trim().slice(0, 120), active: d.active !== false,
  }))
  .handler(async ({ context, data }) => {
    await requireRole(context, MGMT);
    if (!data.source || !data.sheet) throw new Error("Ikkala maydon ham kerak");
    // RLS bilan, foydalanuvchi nomidan (audit log kim o'zgartirganini yozadi)
    const sb = context.supabase as any;
    const { data: ex } = await sb.from("sheet_category_map").select("id,source_category").eq("kind", data.kind);
    const hit = (ex ?? []).find((r: any) => r.source_category.trim().toLowerCase() === data.source.toLowerCase());
    const { error } = hit
      ? await sb.from("sheet_category_map").update({ sheet_category: data.sheet, active: data.active }).eq("id", hit.id)
      : await sb.from("sheet_category_map").insert({ kind: data.kind, source_category: data.source, sheet_category: data.sheet, active: data.active });
    if (error) throw new Error(error.message);
    // Shu kategoriyadagi ogohlantirishlarni yopamiz (keyingi syncda qayta tekshiriladi)
    const db = await admin();
    const tbl = data.kind === "income" ? "incomes" : "expenses";
    const { data: w } = await db.from("sheet_sync_warnings").select("id,record_id").eq("source_table", tbl).eq("resolved", false);
    const ids = (w ?? []).map((x: any) => x.record_id);
    if (ids.length) {
      const { data: recs } = await db.from(tbl).select("id,category").in("id", ids);
      const match = (recs ?? []).filter((r: any) => String(r.category ?? "").trim().toLowerCase() === data.source.toLowerCase()).map((r: any) => r.id);
      if (match.length) await db.from("sheet_sync_warnings").update({ resolved: true }).eq("source_table", tbl).in("record_id", match);
    }
    return { ok: true };
  });

export const getCeoDashboard = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireRole(context, ["admin", "finans", "ceo"]);
  const db = await admin();
  const { loadProjectInputs } = await import("@/server/insights.server");
  const { timeElapsedPct } = await import("@/lib/insights-rules");
  const inputs = await loadProjectInputs(db);
  const t = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
  const next7 = new Date(Date.parse(t) + 7 * 86_400_000).toISOString().slice(0, 10);
  const { data: zy } = await db.from("project_zayavka").select("project_id,name,workflow_status,needed_date").gte("needed_date", t).lte("needed_date", next7).limit(200);
  const { data: open } = await db.from("ai_insights").select("id,severity,project_id,title,metric,recommended_action,created_at").eq("status", "open").order("created_at", { ascending: false }).limit(200);
  const projects = inputs.map((p) => {
    const budget = Number(p.total_budget ?? 0) || p.boq_planned;
    const progress = p.boq_planned > 0 ? Math.round((p.boq_actual / p.boq_planned) * 1000) / 10 : 0;
    const planned = timeElapsedPct(p.start_date, p.end_date, t);
    const ins = (open ?? []).filter((i: any) => i.project_id === p.id);
    return {
      id: p.id, name: p.name, start: p.start_date, end: p.end_date, budget, actual: p.expense_total, income: p.income_total,
      netCash: p.income_total - p.expense_total, progress, planned, boqPlanned: p.boq_planned, boqActual: p.boq_actual,
      dprLast: p.dpr_last_date, fuel7d: p.fuel_7d, manDays7d: p.attendance_7d_days, crew: p.employees_active,
      procurementOverdue: p.zayavka_overdue, procurementPending: p.zayavka_pending_old,
      critical: ins.filter((i: any) => i.severity === "critical").length, warning: ins.filter((i: any) => i.severity === "warning").length,
      next7: (zy ?? []).filter((z: any) => z.project_id === p.id).map((z: any) => ({ name: z.name, date: z.needed_date, status: z.workflow_status })),
    };
  });
  const { data: drs } = await db.from("daily_reports").select("project_id,issues,report_date").gte("report_date", new Date(Date.parse(t) - 7 * 86_400_000).toISOString().slice(0, 10));
  const { classifyIssue } = await import("@/lib/insights-rules");
  const iss = ((drs ?? []) as any[]).filter((r) => String(r.issues ?? "").trim());
  const withIssues = projects.map((p) => {
    const mine = iss.filter((r) => r.project_id === p.id);
    return { ...p, contract: Number(inputs.find((x) => x.id === p.id)?.total_budget ?? 0),
      hse: mine.filter((r) => classifyIssue(r.issues) === "hse").length, qaqc: mine.filter((r) => classifyIssue(r.issues) === "qaqc").length, issues: mine.length };
  });
  return { today: t, projects: withIssues, insights: open ?? [] };
});

export const getInsights = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth]).handler(async ({ context }) => {
  await requireRole(context, ["admin", "finans", "ceo"]);
  const db = await admin();
  const { data } = await db.from("ai_insights").select("id,rule_key,severity,project_id,title,metric,evidence,source,recommended_action,status,created_at,last_seen_at,notified_at").order("created_at", { ascending: false }).limit(300);
  return data ?? [];
});

export const runInsightsNow = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { notify?: boolean }) => ({ notify: !!d?.notify }))
  .handler(async ({ context, data }) => {
    await requireRole(context, MGMT);
    const { runInsights } = await import("@/server/insights.server");
    return runInsights(await admin(), { notify: data.notify });
  });

export const resolveInsight = createServerFn({ method: "POST" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d.id) }))
  .handler(async ({ context, data }) => {
    await requireRole(context, MGMT);
    const db = await admin();
    await db.from("ai_insights").update({ status: "resolved" }).eq("id", data.id);
    return { ok: true };
  });

export const getProjectControl = createServerFn({ method: "GET" }).middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => ({ id: String(d?.id ?? "") }))
  .handler(async ({ context, data }) => {
    await requireRole(context, ["admin", "finans", "ceo"]);
    const db = await admin();
    const { loadProjectInputs } = await import("@/server/insights.server");
    const { timeElapsedPct, classifyIssue } = await import("@/lib/insights-rules");
    const { ruleSheetCategory } = await import("@/lib/sheet-category");
    const t = new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
    const d30 = new Date(Date.parse(t) - 30 * 86_400_000).toISOString().slice(0, 10);
    const d14 = new Date(Date.parse(t) - 14 * 86_400_000).toISOString().slice(0, 10);
    const next7 = new Date(Date.parse(t) + 7 * 86_400_000).toISOString().slice(0, 10);
    const { data: proj } = await db.from("projects").select("id,name,code,location,start_date,end_date,total_budget,pm_name,prorab_name").eq("id", data.id).maybeSingle();
    if (!proj) throw new Error("Loyiha topilmadi");
    const base = (await loadProjectInputs(db)).find((p) => p.id === data.id);
    const [boq, exp, inc, dr, att, zy, ins] = await Promise.all([
      db.from("boq_items").select("id,code,description,category,unit,qty,planned_cost,actual_cost").eq("project_id", data.id).order("code").limit(1000),
      allPages((f, t) => db.from("expenses").select("amount,category,description,expense_date,boq_item_id").eq("project_id", data.id).order("id").range(f, t)),
      allPages((f, t) => db.from("incomes").select("amount,category,income_date").eq("project_id", data.id).order("id").range(f, t)),
      db.from("daily_reports").select("id,report_date,reporter_name,issues,notes").eq("project_id", data.id).gte("report_date", d14).order("report_date", { ascending: false }),
      db.from("employee_attendance").select("employee_id,attendance_date").eq("project_id", data.id).gte("attendance_date", d14),
      db.from("project_zayavka").select("id,name,kind,workflow_status,needed_date,total,qty,qty_received").eq("project_id", data.id).order("needed_date", { ascending: true }).limit(500),
      db.from("ai_insights").select("id,severity,title,metric,recommended_action,created_at").eq("project_id", data.id).eq("status", "open").order("created_at", { ascending: false }),
    ]);
    const E = ((exp.data ?? []) as any[]).filter((e) => e.category !== "Transfer");
    const I = ((inc.data ?? []) as any[]).filter((e) => e.category !== "Transfer");
    const sum = (a: any[]) => a.reduce((s, x) => s + Number(x.amount ?? 0), 0);
    const byCat = new Map<string, number>();
    E.forEach((e) => { const k = ruleSheetCategory(e.category, e.description) ?? (e.category || "Boshqa"); byCat.set(k, (byCat.get(k) ?? 0) + Number(e.amount ?? 0)); });
    const months = new Map<string, { in: number; out: number }>();
    I.forEach((x) => { const m = String(x.income_date).slice(0, 7); const v = months.get(m) ?? { in: 0, out: 0 }; v.in += Number(x.amount ?? 0); months.set(m, v); });
    E.forEach((x) => { const m = String(x.expense_date).slice(0, 7); const v = months.get(m) ?? { in: 0, out: 0 }; v.out += Number(x.amount ?? 0); months.set(m, v); });
    const fuel = E.filter((e) => ruleSheetCategory(e.category, e.description) === "Yoqilg‘i");
    const fuelDaily = new Map<string, number>();
    fuel.filter((f) => f.expense_date >= d14).forEach((f) => fuelDaily.set(f.expense_date, (fuelDaily.get(f.expense_date) ?? 0) + Number(f.amount ?? 0)));
    const attDaily = new Map<string, Set<string>>();
    ((att.data ?? []) as any[]).forEach((a) => { if (!attDaily.has(a.attendance_date)) attDaily.set(a.attendance_date, new Set()); attDaily.get(a.attendance_date)!.add(a.employee_id); });
    const boqRows = ((boq.data ?? []) as any[]).map((b) => ({ ...b, pct: Number(b.planned_cost) > 0 ? Math.round((Number(b.actual_cost ?? 0) / Number(b.planned_cost)) * 100) : 0 }));
    const linked = E.filter((e) => e.boq_item_id).length;
    const issues = ((dr.data ?? []) as any[]).filter((r) => String(r.issues ?? "").trim()).map((r) => ({ date: r.report_date, text: r.issues, kind: classifyIssue(r.issues) }));
    const Z = (zy.data ?? []) as any[];
    const done = ["delivered", "invoiced", "paid"];
    return {
      today: t,
      project: proj,
      progress: base && base.boq_planned > 0 ? Math.round((base.boq_actual / base.boq_planned) * 1000) / 10 : 0,
      planned: timeElapsedPct(proj.start_date, proj.end_date, t),
      contract: Number(proj.total_budget ?? 0),
      boqPlanned: base?.boq_planned ?? 0, boqActual: base?.boq_actual ?? 0,
      boq: boqRows, boqLinkedExpenses: linked, expenseCount: E.length,
      dpr: ((dr.data ?? []) as any[]).map((r) => ({ date: r.report_date, by: r.reporter_name, issues: r.issues, notes: r.notes })),
      cost: { total: sum(E), last30: sum(E.filter((e) => e.expense_date >= d30)), byCategory: [...byCat].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value) },
      cash: { income: sum(I), expense: sum(E), net: sum(I) - sum(E), monthly: [...months].sort().slice(-6).map(([m, v]) => ({ month: m, ...v, net: v.in - v.out })) },
      fuel: { total: sum(fuel), last7: base?.fuel_7d ?? 0, daily: [...fuelDaily].sort().map(([date, v]) => ({ date, v })) },
      hr: { crew30: base?.employees_active ?? 0, manDays7: base?.attendance_7d_days ?? 0, daily: [...attDaily].sort().map(([date, s]) => ({ date, n: s.size })) },
      procurement: {
        open: Z.filter((z) => !done.includes(z.workflow_status) && z.workflow_status !== "rejected" && z.workflow_status !== "draft").length,
        overdue: Z.filter((z) => !done.includes(z.workflow_status) && z.workflow_status !== "rejected" && z.needed_date && z.needed_date < t),
        next7: Z.filter((z) => z.needed_date && z.needed_date >= t && z.needed_date <= next7),
        delivered: Z.filter((z) => done.includes(z.workflow_status)).length,
      },
      issues,
      insights: ins.data ?? [],
    };
  });
