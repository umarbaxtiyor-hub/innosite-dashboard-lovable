// Management Intelligence: DB ma'lumotlaridan deterministik signallar, takrorsiz saqlash,
// critical signallar uchun Telegram (spamsiz), kunlik yagona summary va sync health.
import { computeInsights, partitionNew, syncHealth, type ProjectInput } from "@/lib/insights-rules";
import { ruleSheetCategory } from "@/lib/sheet-category";

const FUEL = (c: string, d: string) => ruleSheetCategory(c, d) === "Yoqilg‘i";
const today = () => new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10); // Toshkent
const shift = (d: string, days: number) => new Date(Date.parse(d) + days * 86_400_000).toISOString().slice(0, 10);

async function all(build: (f: number, t: number) => any): Promise<any[]> {
  const out: any[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await build(f, f + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export async function loadProjectInputs(db: any): Promise<ProjectInput[]> {
  const t = today();
  const d30 = shift(t, -30), d35 = shift(t, -35), d7 = shift(t, -7);
  const projects = await all((f, to) => db.from("projects").select("id,name,total_budget,start_date,end_date,status").range(f, to));
  const boq = await all((f, to) => db.from("boq_items").select("project_id,planned_cost,actual_cost").range(f, to));
  const exp = await all((f, to) => db.from("expenses").select("id,project_id,amount,category,description,expense_date").range(f, to));
  const inc = await all((f, to) => db.from("incomes").select("project_id,amount,category").range(f, to));
  const att = await all((f, to) => db.from("employee_attendance").select("project_id,employee_id,attendance_date").gte("attendance_date", d30).range(f, to));
  const dr = await all((f, to) => db.from("daily_reports").select("project_id,report_date,issues").gte("report_date", d35).range(f, to));
  const zy = await all((f, to) => db.from("project_zayavka").select("project_id,workflow_status,needed_date,submitted_at,created_at").range(f, to));
  return projects.filter((p: any) => String(p.status ?? "active").toLowerCase() !== "archived").map((p: any) => {
    const b = boq.filter((x) => x.project_id === p.id);
    const e = exp.filter((x) => x.project_id === p.id && String(x.category) !== "Transfer");
    const i = inc.filter((x) => x.project_id === p.id && String(x.category) !== "Transfer");
    const fuel = e.filter((x) => FUEL(x.category, x.description));
    const z = zy.filter((x) => x.project_id === p.id);
    const open = (s: string) => !["delivered", "invoiced", "paid", "rejected", "draft"].includes(s);
    const dates = dr.filter((x) => x.project_id === p.id).map((x) => x.report_date).sort();
    const attP = att.filter((x) => x.project_id === p.id);
    return {
      id: p.id, name: p.name, total_budget: p.total_budget, start_date: p.start_date, end_date: p.end_date,
      boq_planned: b.reduce((s, x) => s + Number(x.planned_cost ?? 0), 0),
      boq_actual: b.reduce((s, x) => s + Number(x.actual_cost ?? 0), 0),
      expense_total: e.reduce((s, x) => s + Number(x.amount ?? 0), 0),
      income_total: i.reduce((s, x) => s + Number(x.amount ?? 0), 0),
      expenses_30d: e.filter((x) => x.expense_date >= d30).map((x) => ({ id: x.id, amount: Number(x.amount ?? 0), category: String(x.category ?? ""), date: x.expense_date })),
      fuel_7d: fuel.filter((x) => x.expense_date >= d7).reduce((s, x) => s + Number(x.amount ?? 0), 0),
      fuel_prev28d: fuel.filter((x) => x.expense_date < d7 && x.expense_date >= shift(t, -35)).reduce((s, x) => s + Number(x.amount ?? 0), 0),
      attendance_7d_days: new Set(attP.filter((x) => x.attendance_date >= d7).map((x) => `${x.employee_id}|${x.attendance_date}`)).size,
      employees_active: new Set(attP.map((x) => x.employee_id).filter(Boolean)).size,
      dpr_last_date: dates.length ? dates[dates.length - 1] : null,
      zayavka_overdue: z.filter((x) => open(x.workflow_status) && x.needed_date && x.needed_date < t).length,
      issues_7d: dr.filter((x) => x.project_id === p.id && x.report_date >= d7 && String(x.issues ?? "").trim()).map((x) => ({ date: x.report_date, text: String(x.issues) })),
      zayavka_pending_old: z.filter((x) => ["submitted", "pending_pm", "waiting_ceo"].includes(x.workflow_status) && String(x.submitted_at ?? x.created_at).slice(0, 10) < d7).length,
    } as ProjectInput;
  });
}

export async function runInsights(db: any, opts: { notify?: boolean } = {}) {
  const inputs = await loadProjectInputs(db);
  const insights = computeInsights(inputs, today());
  const { data: ex } = await db.from("ai_insights").select("fingerprint").in("fingerprint", insights.map((i) => i.fingerprint).slice(0, 1000));
  const { fresh, repeat } = partitionNew(insights, new Set((ex ?? []).map((r: any) => r.fingerprint)));
  if (fresh.length) {
    const { error } = await db.from("ai_insights").upsert(fresh.map((i) => ({ ...i, source: "rules" })), { onConflict: "fingerprint", ignoreDuplicates: true });
    if (error) throw new Error(error.message);
  }
  if (repeat.length) await db.from("ai_insights").update({ last_seen_at: new Date().toISOString() }).in("fingerprint", repeat.map((i) => i.fingerprint));
  let notified = 0;
  if (opts.notify) notified = await notifyCritical(db);
  return { computed: insights.length, created: fresh.length, notified };
}

/** Yangi critical signallar — har biri bir marta, bir yuborishda ko'pi bilan 5 ta. */
async function notifyCritical(db: any): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return 0;
  const { data: rows } = await db.from("ai_insights").select("id,title,metric,recommended_action,evidence")
    .eq("severity", "critical").eq("status", "open").is("notified_at", null).order("created_at").limit(5);
  if (!rows?.length) return 0;
  const chats = await managementChats(db);
  if (!chats.length) return 0;
  const esc = (s: string) => String(s ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  const text = `🚨 <b>Muhim signallar</b>\n\n` + rows.map((r: any) =>
    `• <b>${esc(r.evidence?.project ?? "")}</b>: ${esc(r.title)}\n  ${esc(r.metric ?? "")}\n  👉 ${esc(r.recommended_action ?? "")}`).join("\n\n");
  // Avval belgilaymiz — Telegram xatosida ham qayta-qayta spam bo'lmasin
  await db.from("ai_insights").update({ notified_at: new Date().toISOString() }).in("id", rows.map((r: any) => r.id));
  for (const chat_id of chats) {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id, text, parse_mode: "HTML" }),
    });
    if (!r.ok) console.error("[insights] telegram:", r.status, (await r.text().catch(() => "")).slice(0, 200));
  }
  return rows.length;
}

async function managementChats(db: any): Promise<number[]> {
  const { data: roleRows } = await db.from("user_roles").select("user_id").in("role", ["ceo", "admin"]);
  const ids = Array.from(new Set((roleRows ?? []).map((r: any) => r.user_id)));
  if (!ids.length) return [];
  const { data: profs } = await db.from("profiles").select("telegram_user_id,is_active").in("id", ids);
  return Array.from(new Set((profs ?? []).filter((p: any) => p.is_active !== false && p.telegram_user_id).map((p: any) => Number(p.telegram_user_id))));
}

export async function syncHealthSnapshot(db: any) {
  const q = await all((f, t) => db.from("sheet_sync_queue").select("status,attempts,error,synced_at,created_at,needs_update").range(f, t));
  const stuckBefore = Date.now() - 15 * 60_000;
  const k = {
    pending: q.filter((r) => r.status === "pending" && !(r.attempts > 0)).length,
    processing: q.filter((r) => r.status === "processing").length,
    synced: q.filter((r) => r.status === "synced").length,
    failed: q.filter((r) => (r.status === "pending" && r.attempts > 0) || r.status === "error" || r.status === "skipped").length,
    stuck: q.filter((r) => r.status === "processing" && Date.parse(r.synced_at ?? r.created_at) < stuckBefore).length,
    retries: q.reduce((s, r) => s + Number(r.attempts ?? 0), 0),
    needsUpdate: q.filter((r) => r.needs_update).length,
    lastSync: q.map((r) => r.status === "synced" ? r.synced_at : null).filter(Boolean).sort().pop() ?? null,
  };
  const { count: warnings } = await db.from("sheet_sync_warnings").select("id", { count: "exact", head: true }).eq("resolved", false);
  const { count: outboxPending } = await db.from("bot_sheet_outbox").select("id", { count: "exact", head: true }).eq("status", "pending");
  const led = await all((f, t) => db.from("sheet_sync_ledger").select("source_table,record_id,spreadsheet_id,tab").range(f, t));
  const seen = new Set<string>(); let duplicates = 0;
  for (const l of led) { const key = `${l.source_table}|${l.record_id}|${l.spreadsheet_id}|${l.tab}`; if (seen.has(key)) duplicates++; seen.add(key); }
  const health = syncHealth({ failed: k.failed + (outboxPending ?? 0), stuck: k.stuck, pending: k.pending, duplicates, warnings: warnings ?? 0 });
  return { ...k, warnings: warnings ?? 0, outboxPending: outboxPending ?? 0, duplicates, health };
}

/** Kunlik CEO hisobot (DB dan): Bugun/Kecha → Progress → Pul → Muammolar → Muhim xavflar → Keyingi 7 kun → Harakatlar. */
export async function buildDailySummaryText(db: any): Promise<string> {
  const t = today(), y = shift(t, -1), n7 = shift(t, 7);
  const exp = await all((f, to) => db.from("expenses").select("amount,category,description,expense_date").in("expense_date", [t, y]).range(f, to));
  const inc = await all((f, to) => db.from("incomes").select("amount,category,income_date").in("income_date", [t, y]).range(f, to));
  const att = await all((f, to) => db.from("employee_attendance").select("employee_id,employee_name,attendance_date").in("attendance_date", [t, y]).range(f, to));
  const drs = await all((f, to) => db.from("daily_reports").select("project_id,report_date").in("report_date", [t, y]).range(f, to));
  const inputs = await loadProjectInputs(db);
  const { data: ins } = await db.from("ai_insights").select("severity,title,recommended_action,evidence").eq("status", "open").order("created_at", { ascending: false }).limit(50);
  const { data: zy } = await db.from("project_zayavka").select("name,needed_date,project_id").gte("needed_date", t).lte("needed_date", n7).order("needed_date").limit(8);
  const fmt = (v: number) => `${(Math.round(v / 100_000) / 10).toLocaleString("ru-RU")} mln`;
  const sum = (a: any[]) => a.reduce((s, x) => s + Number(x.amount ?? 0), 0);
  const esc = (x: string) => String(x ?? "").replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]!));
  const day = (d: string) => {
    const e = exp.filter((x) => x.expense_date === d && x.category !== "Transfer");
    const i = inc.filter((x) => x.income_date === d && x.category !== "Transfer");
    return { in: sum(i), out: sum(e), fuel: sum(e.filter((x) => FUEL(x.category, x.description))), crew: new Set(att.filter((a) => a.attendance_date === d).map((a) => a.employee_id ?? a.employee_name)).size, dpr: new Set(drs.filter((r) => r.report_date === d).map((r) => r.project_id)).size };
  };
  const T = day(t), Y = day(y);
  const totIn = inputs.reduce((s, p) => s + p.income_total, 0), totOut = inputs.reduce((s, p) => s + p.expense_total, 0);
  const prog = inputs.map((p) => `• ${esc(p.name)}: ${p.boq_planned > 0 ? Math.round((p.boq_actual / p.boq_planned) * 100) : 0}%`).slice(0, 8);
  const crit = (ins ?? []).filter((i: any) => i.severity === "critical");
  const warn = (ins ?? []).filter((i: any) => i.severity === "warning");
  const pn = new Map(inputs.map((p) => [p.id, p.name]));
  const actions = Array.from(new Set([...crit, ...warn].map((i: any) => i.recommended_action).filter(Boolean))).slice(0, 4);
  return [
    `🗓 <b>Kunlik hisobot — ${t}</b>`,
    ``,
    `<b>Bugun / Kecha</b>`,
    `💰 Kirim: ${fmt(T.in)} / ${fmt(Y.in)}`,
    `💸 Chiqim: ${fmt(T.out)} / ${fmt(Y.out)}`,
    `⛽ Yoqilg'i: ${fmt(T.fuel)} / ${fmt(Y.fuel)}`,
    `👥 Ishchilar: ${T.crew} / ${Y.crew}  ·  📄 DPR: ${T.dpr}/${inputs.length} loyiha`,
    ``,
    `<b>Progress</b>`, ...(prog.length ? prog : ["—"]),
    ``,
    `<b>Pul</b>`,
    `Sof pul oqimi (jami): <b>${fmt(totIn - totOut)}</b>  (kirim ${fmt(totIn)}, chiqim ${fmt(totOut)})`,
    ``,
    `<b>Muammolar</b>: ${warn.length ? `${warn.length} ta diqqat talab` : "yo'q"}`,
    ...warn.slice(0, 3).map((i: any) => `• ${esc(i.title)}`),
    ``,
    `<b>Muhim xavflar</b>: ${crit.length ? "" : "yo'q"}`,
    ...crit.slice(0, 4).map((i: any) => `🚨 ${esc(i.evidence?.project ?? "")}: ${esc(i.title)}`),
    ``,
    `<b>Keyingi 7 kun</b>`,
    ...((zy ?? []).length ? (zy ?? []).map((z: any) => `• ${z.needed_date.slice(5)} — ${esc(z.name)} (${esc(pn.get(z.project_id) ?? "")})`) : ["—"]),
    ``,
    `<b>Harakatlar</b>`,
    ...(actions.length ? actions.map((a) => `👉 ${esc(String(a))}`) : ["—"]),
  ].join("\n");
}
