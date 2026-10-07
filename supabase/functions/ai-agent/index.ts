// AI agent for QurilishNazorat. Uses Lovable AI gateway with tool calling.
// Xavfsizlik: foydalanuvchi so'rovlari uning JWT si bilan (RLS amal qiladi) o'qiladi;
// service role faqat ichki server (Telegram bot) uchun, kalit aniq tengligi bilan.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { ORG_ONLY_TOOLS, selectToolNames, recentUserText } from "./tool-select.ts";

// CORS himoya emas — asosiy himoya pastdagi JWT + rol + loyiha doirasi tekshiruvi.
const ALLOWED_ORIGINS = ["https://innosite.io", "https://www.innosite.io", "https://innosite.lovable.app"];
const baseCors: Record<string, string> = {
  "Vary": "Origin",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const corsFor = (req: Request) => {
  const origin = req.headers.get("origin") ?? "";
  return { ...baseCors, "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0] };
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;
const AI_MODEL = Deno.env.get("AI_MODEL") ?? "google/gemini-3.7-flash";
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Har so'rov uchun alohida kontekst (parallel so'rovlar o'rtasida holat ulashilmaydi).
// allowedProjects: null = butun tashkilot; massiv = faqat shu loyihalar.
type ToolCtx = { sb: any; allowedProjects: string[] | null };

// Real app_role modeli (public.user_roles). Boshqa rollar → 403.
// Biznes qoidasi: PM ham barcha loyihalarni ko'radi (CEO kabi).
const ORG_WIDE_ROLES = ["admin", "ceo", "direktor", "finans", "buxgalter", "accountant", "pm", "project_manager"];
const PROJECT_ROLES: string[] = [];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_TOOL_CALLS_PER_TURN = 8;
const clampLimit = (v: unknown, def: number) => { const n = Math.floor(Number(v)); return Number.isFinite(n) ? Math.min(100, Math.max(1, n)) : def; };
// Jami summalar uchun: server 1000 qatorda kesadi, shuning uchun sahifalab hammasini o'qiymiz.
async function allRows(build: (from: number, to: number) => any): Promise<{ data: any[] }> {
  const out: any[] = [];
  for (let from = 0; from < 200_000; from += 1000) {
    const { data, error } = await build(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return { data: out };
}
function safeEq(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
// Kalit rotatsiyasidan keyin env bilan mos kelmasligi mumkin: role=service_role claim + faqat
// service role o'qiy oladigan (policy'siz) jadvaldan haqiqiy qator qaytishi bilan tasdiqlanadi.
// Oddiy foydalanuvchi/anon JWT RLS tufayli bo'sh natija oladi → ichki hisoblanmaydi.
async function isServiceRoleJwt(jwt: string): Promise<boolean> {
  try {
    const part = jwt.split(".")[1];
    if (!part) return false;
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
    if (payload?.role !== "service_role") return false;
    const probe = createClient(SUPABASE_URL, jwt, { auth: { persistSession: false } });
    const { data, error } = await probe.from("internal_secrets").select("key").limit(1);
    return !error && Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

const tools = [
  { type: "function", function: { name: "list_projects", description: "Loyihalar ro'yxati (id, nom, status, byudjet). Loyiha ID topish uchun.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "list_firms", description: "Firmalar ro'yxati (faqat firma ID kerak bo'lsa).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_project", description: "Bitta loyiha pasporti: sanalar, byudjet, firma, status. Pul uchun get_summary.", parameters: { type: "object", properties: { project_id: { type: "string" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_master_zayavka", description: "Loyiha reja qatorlari (material/ish): rejada, qabul qilingan, qoldi.", parameters: { type: "object", properties: { project_id: { type: "string" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_zayavka_workflow", description: "Zayavkalar tasdiq/xarid holati. status: pending_pm/approved/rejected/in_purchase/delivered/invoiced/paid.", parameters: { type: "object", properties: { project_id: { type: "string" }, status: { type: "string" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_summary", description: "ASOSIY loyiha moliyasi: kirim (Naqd/Bank), chiqim kategoriyalari, balans, shartnoma kirimi, bajarilish %, deadline. Jami/qoldiq savollariga shu.", parameters: { type: "object", properties: { project_id: { type: "string" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_warehouse_receipts", description: "Omborga kelgan nakladnoylar (material qabuli).", parameters: { type: "object", properties: { project_id: { type: "string" }, limit: { type: "number" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_expenses", description: "Xarajat qatorlari (ro'yxat/qidiruv). Filter: kategoriya, payment_method, sana. Jami uchun get_summary.", parameters: { type: "object", properties: { project_id: { type: "string" }, category: { type: "string" }, payment_method: { type: "string" }, since: { type: "string" }, until: { type: "string" }, limit: { type: "number" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_incomes", description: "Kirim qatorlari (ro'yxat): naqd/bank va shartnoma kirimi alohida.", parameters: { type: "object", properties: { project_id: { type: "string" }, since: { type: "string" }, until: { type: "string" }, limit: { type: "number" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_work_progress", description: "Bajarilgan ish yozuvlari (tur, hajm, summa, brigada, sana).", parameters: { type: "object", properties: { project_id: { type: "string" }, since: { type: "string" }, until: { type: "string" }, limit: { type: "number" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_boq", description: "BOQ/smeta qatorlari: reja vs fakt, bajarilish %.", parameters: { type: "object", properties: { project_id: { type: "string" }, category: { type: "string" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_variations", description: "Qo'shimcha ish/o'zgartirishlar (variations) va statuslari.", parameters: { type: "object", properties: { project_id: { type: "string" }, status: { type: "string" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_brigades", description: "Barcha brigadalar balansi (ishlangan − to'langan).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_brigade_detail", description: "Bitta brigada: a'zolar, to'lovlar, ishlar.", parameters: { type: "object", properties: { brigade_id: { type: "string" } }, required: ["brigade_id"] } } },
  { type: "function", function: { name: "get_employees", description: "Xodimlar ro'yxati (lavozim, oylik, faollik).", parameters: { type: "object", properties: { firm_id: { type: "string" } } } } },
  { type: "function", function: { name: "get_employee_payments", description: "Xodimlarga oylik/avans to'lovlari. Filter: employee_id, project_id, sana.", parameters: { type: "object", properties: { employee_id: { type: "string" }, project_id: { type: "string" }, since: { type: "string" }, until: { type: "string" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "get_suppliers", description: "Yetkazib beruvchilar va kontaktlari.", parameters: { type: "object", properties: { firm_id: { type: "string" } } } } },
  { type: "function", function: { name: "get_supplier_contracts", description: "Yetkazib beruvchilar bilan shartnomalar.", parameters: { type: "object", properties: { supplier_id: { type: "string" }, firm_id: { type: "string" } } } } },
  { type: "function", function: { name: "search_master", description: "Master katalogda material/ish nomini qidirish.", parameters: { type: "object", properties: { q: { type: "string" }, kind: { type: "string", enum: ["material", "work"] } }, required: ["q"] } } },
  { type: "function", function: { name: "get_recent_activity", description: "Loyihadagi so'nggi o'zgarishlar (xarajat, kirim, ish, qabul, zayavka).", parameters: { type: "object", properties: { project_id: { type: "string" }, limit: { type: "number" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "global_finance", description: "Butun tashkilot/firma moliyasi (loyihasiz savol): kirim, chiqim, kassa qoldig'i, sof pul oqimi.", parameters: { type: "object", properties: { firm_id: { type: "string" } } } } },
];

const sum = (rows: any[] = [], k: string) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);

// Shartnoma bo'yicha kirim — kassaga qo'shilmaydi (alohida ko'rsatiladi)
const isContractIncome = (r: any) => /shartnoma|kontrak/i.test(String(r?.category ?? ""));

// Yagona moliyaviy model: JURNAL — yagona manba.
// Chiqim = material + ish + xodim (oylik) + usta (brigada) + boshqa xarajat.
// Har bir yozuv faqat bitta kategoriyaga tushadi (takror sanash yo'q).
// BOQ ga bog'langan xarajat expenses'ga source='web_boq' bo'lib mirror qilinadi —
// u material/ish summasida sanaladi, shuning uchun bu yerda chiqarib tashlanadi.
function finance({ exp, inc, mat, work, pay }: { exp?: any[]; inc?: any[]; mat?: any[]; work?: any[]; pay?: any[] }) {
  const expenses = (exp ?? []).filter((r: any) => String(r.source ?? "") !== "web_boq");
  const material = (mat ?? []).reduce((s, r: any) => s + (Number(r.total_price) || Number(r.qty) * Number(r.unit_price) || 0), 0);
  const ish = (work ?? []).reduce((s, r: any) => s + (Number(r.total_value) || Number(r.qty_done) * Number(r.unit_price) || 0), 0);
  const usta = sum(pay ?? [], "amount");
  const isSalary = (r: any) => /oylik|ish haqi|maosh|xodim/i.test(String(r.category ?? ""));
  const xodim = expenses.filter(isSalary).reduce((s, r: any) => s + Number(r.amount || 0), 0);
  const boshqa = expenses.filter((r: any) => !isSalary(r)).reduce((s, r: any) => s + Number(r.amount || 0), 0);
  const chiqim = material + ish + xodim + usta + boshqa;

  const incomes = inc ?? [];
  const kassaInc = incomes.filter((r: any) => !isContractIncome(r));
  const kirim = sum(kassaInc, "amount");
  const shartnomaKirim = sum(incomes.filter(isContractIncome), "amount");

  const inNaqd = kassaInc.filter((r: any) => String(r.payment_method || "Naqd") === "Naqd").reduce((s, r: any) => s + Number(r.amount || 0), 0);
  const inBank = kirim - inNaqd;
  // Material/ish/usta to'lovlarida usul ko'rsatilmagan — naqd deb hisoblanadi
  const outBank = expenses.filter((r: any) => /bank|karta/i.test(String(r.payment_method ?? ""))).reduce((s, r: any) => s + Number(r.amount || 0), 0);
  const outNaqd = chiqim - outBank;

  return {
    kirim,
    kirim_by_method: { Naqd: inNaqd, Bank: inBank },
    shartnoma_kirim: shartnomaKirim,
    chiqim,
    chiqim_by_category: {
      "Material": material,
      "Ish": ish,
      "Xodimlar (oylik)": xodim,
      "Ustalar (brigada)": usta,
      "Yordamchi/boshqa": boshqa,
    },
    chiqim_by_method: { Naqd: outNaqd, Bank: outBank },
    balans: kirim - chiqim,
    balans_naqd: inNaqd - outNaqd,
    balans_bank: inBank - outBank,
  };
}

async function runTool(name: string, rawArgs: any, ctx: ToolCtx): Promise<any> {
  const { sb, allowedProjects } = ctx;
  try {
    const args: any = rawArgs && typeof rawArgs === "object" ? { ...rawArgs } : {};
    for (const k of ["project_id", "firm_id", "brigade_id", "employee_id", "supplier_id"]) {
      if (args[k] != null && !UUID_RE.test(String(args[k]))) return { error: `${k} noto'g'ri` };
    }
    for (const k of ["since", "until"]) if (args[k] != null && !DATE_RE.test(String(args[k]))) delete args[k];
    if (args.q != null) args.q = String(args.q).slice(0, 100).replace(/[%_,()]/g, " ");
    for (const k of ["category", "payment_method", "status"]) if (args[k] != null) args[k] = String(args[k]).slice(0, 80);
    // Loyiha doirasi (pm/project_manager) — kodda majburiy, promptga tayanilmaydi.
    if (allowedProjects) {
      if (ORG_ONLY_TOOLS.has(name)) return { error: "Bu ma'lumot sizning rolingiz uchun ruxsat etilmagan" };
      if (name !== "list_projects" && !args.project_id) return { error: "Loyihani tanlang (project_id kerak)" };
      if (args.project_id && !allowedProjects.includes(args.project_id)) return { error: "Bu loyiha sizga biriktirilmagan" };
    }
    if (name === "list_projects") {
      let q = sb.from("projects").select("id,name,code,status,total_budget,start_date,end_date,firm_id").order("name").limit(200);
      if (allowedProjects) q = q.in("id", allowedProjects.length ? allowedProjects : ["00000000-0000-0000-0000-000000000000"]);
      const { data } = await q;
      return data;
    }
    if (name === "list_firms") {
      const { data } = await sb.from("firms").select("id,name,inn,phone").order("name").limit(100);
      return data;
    }
    if (name === "get_project") {
      const { data } = await sb.from("projects").select("id,name,code,status,total_budget,start_date,end_date,firm_id").eq("id", args.project_id).maybeSingle();
      return data;
    }
    if (name === "get_master_zayavka") {
      const { data } = await sb.from("project_zayavka")
        .select("id,kind,name,unit,qty,unit_price,total,status,workflow_status,paid_amount,supplier_name")
        .eq("project_id", args.project_id).is("parent_id", null).limit(500);
      return data;
    }
    if (name === "get_zayavka_workflow") {
      let q = sb.from("project_zayavka")
        .select("id,name,unit,qty,unit_price,total,workflow_status,paid_amount,supplier_name,created_at")
        .eq("project_id", args.project_id).order("created_at", { ascending: false }).limit(100);
      if (args.status) q = q.eq("workflow_status", args.status);
      const { data } = await q;
      return data;
    }
    if (name === "get_summary") {
      const pid = args.project_id;
      const [proj, boq, exp, mat, work, vars, inc, pay] = await Promise.all([
        sb.from("projects").select("name,total_budget,start_date,end_date,status").eq("id", pid).maybeSingle(),
        allRows((a, b) => sb.from("boq_items").select("planned_cost,actual_cost,qty").eq("project_id", pid).order("id").range(a, b)),
        allRows((a, b) => sb.from("expenses").select("amount,payment_method,expense_date,category,source").eq("project_id", pid).order("id").range(a, b)),
        allRows((a, b) => sb.from("material_receipts").select("total_price,qty,unit_price").eq("project_id", pid).order("id").range(a, b)),
        allRows((a, b) => sb.from("work_progress").select("total_value,qty_done,unit_price").eq("project_id", pid).order("id").range(a, b)),
        allRows((a, b) => sb.from("project_zayavka").select("status,workflow_status").eq("project_id", pid).order("id").range(a, b)),
        allRows((a, b) => sb.from("incomes").select("amount,payment_method,category").eq("project_id", pid).order("id").range(a, b)),
        allRows((a, b) => sb.from("brigade_payments").select("amount,kind").eq("project_id", pid).order("id").range(a, b)),
      ]);
      const f = finance({ exp: exp.data, inc: inc.data, mat: mat.data, work: work.data, pay: pay.data });
      const today = new Date();
      const start = proj.data?.start_date ? new Date(proj.data.start_date) : null;
      const end = proj.data?.end_date ? new Date(proj.data.end_date) : null;
      let expectedPct = 0, daysLeft: number | null = null;
      if (start && end) {
        const total = +end - +start;
        expectedPct = total > 0 ? Math.max(0, Math.min(100, ((+today - +start) / total) * 100)) : 0;
        daysLeft = Math.round((+end - +today) / 86400000);
      }
      const planned = sum(boq.data ?? [], "planned_cost");
      const actual = sum(boq.data ?? [], "actual_cost");
      const progressPct = planned > 0 ? (actual / planned) * 100 : 0;
      return {
        project: proj.data,
        shartnoma_summasi: proj.data?.total_budget ?? planned,
        ...f,
        boq_planned: planned,
        zayavka_pending: (vars.data ?? []).filter((v: any) => v.status === "pending").length,
        zayavka_approved: (vars.data ?? []).filter((v: any) => v.status === "approved").length,
        progress_pct: Math.round(progressPct * 10) / 10,
        expected_pct: Math.round(expectedPct * 10) / 10,
        delay_pct: Math.round((expectedPct - progressPct) * 10) / 10,
        days_left: daysLeft,
      };
    }
    if (name === "get_warehouse_receipts") {
      const { data } = await sb.from("material_receipts")
        .select("received_at,material_name,qty,unit,unit_price,total_price,supplier_name")
        .eq("project_id", args.project_id).order("received_at", { ascending: false }).limit(clampLimit(args.limit, 30));
      return data;
    }
    if (name === "get_expenses") {
      let q = sb.from("expenses")
        .select("expense_date,category,description,amount,payment_method,paid_by,source")
        .eq("project_id", args.project_id).order("expense_date", { ascending: false });
      if (args.category) q = q.eq("category", args.category);
      if (args.payment_method) q = q.eq("payment_method", args.payment_method);
      if (args.since) q = q.gte("expense_date", args.since);
      if (args.until) q = q.lte("expense_date", args.until);
      const { data } = await q.limit(clampLimit(args.limit, 100));
      return data;
    }
    if (name === "get_incomes") {
      let q = sb.from("incomes")
        .select("income_date,description,payer,amount,category,payment_method")
        .eq("project_id", args.project_id).order("income_date", { ascending: false });
      if (args.since) q = q.gte("income_date", args.since);
      if (args.until) q = q.lte("income_date", args.until);
      const { data } = await q.limit(clampLimit(args.limit, 100));
      const rows = data ?? [];
      const shartnoma = rows.filter(isContractIncome);
      const kassa = rows.filter((r: any) => !isContractIncome(r));
      const by: Record<string, number> = { Naqd: 0, Bank: 0 };
      for (const r of kassa) {
        const m = String(r.payment_method || "Naqd") === "Naqd" ? "Naqd" : "Bank";
        by[m] += Number(r.amount || 0);
      }
      return {
        kirim_total: sum(kassa, "amount"),
        kirim_by_method: by,
        shartnoma_kirim: sum(shartnoma, "amount"),
        items: rows,
      };
    }
    if (name === "get_work_progress") {
      let q = sb.from("work_progress")
        .select("work_date,work_type,qty_done,unit,unit_price,total_value,brigade_name")
        .eq("project_id", args.project_id).order("work_date", { ascending: false });
      if (args.since) q = q.gte("work_date", args.since);
      if (args.until) q = q.lte("work_date", args.until);
      const { data } = await q.limit(clampLimit(args.limit, 50));
      return data;
    }
    if (name === "get_boq") {
      let q = sb.from("boq_items").select("code,description,category,unit,qty,rate,planned_cost,actual_cost").eq("project_id", args.project_id).order("code").limit(1000);
      if (args.category) q = q.eq("category", args.category);
      const { data } = await q;
      return (data ?? []).map((r: any) => ({ ...r, pct: r.planned_cost > 0 ? Math.round((Number(r.actual_cost || 0) / Number(r.planned_cost)) * 1000) / 10 : 0 }));
    }
    if (name === "get_variations") {
      let q = sb.from("variations").select("title,reason,qty,unit,amount,status,requested_by_name,created_at,approved_at").eq("project_id", args.project_id).order("created_at", { ascending: false });
      if (args.status) q = q.eq("status", args.status);
      const { data } = await q.limit(100);
      return data;
    }
    if (name === "get_brigades") {
      const [b, wp, bp] = await Promise.all([
        sb.from("brigades").select("id,name,leader,phone,member_count").limit(500),
        sb.from("work_progress").select("brigade_id,total_value"),
        sb.from("brigade_payments").select("brigade_id,amount,kind"),
      ]);
      const earn: Record<string, number> = {};
      const paid: Record<string, number> = {};
      for (const r of wp.data ?? []) earn[r.brigade_id] = (earn[r.brigade_id] ?? 0) + Number(r.total_value || 0);
      for (const r of bp.data ?? []) if ((r.kind ?? "").toLowerCase() === "avans") paid[r.brigade_id] = (paid[r.brigade_id] ?? 0) + Number(r.amount || 0);
      return (b.data ?? []).map((br: any) => ({ ...br, earned: earn[br.id] ?? 0, paid_avans: paid[br.id] ?? 0, balance: (earn[br.id] ?? 0) - (paid[br.id] ?? 0) }));
    }
    if (name === "get_brigade_detail") {
      const bid = args.brigade_id;
      const [b, m, p, w] = await Promise.all([
        sb.from("brigades").select("id,name,leader,member_count").eq("id", bid).maybeSingle(),
        sb.from("brigade_members").select("full_name,position").eq("brigade_id", bid).limit(100),
        sb.from("brigade_payments").select("payment_date,amount,kind,project_id,note").eq("brigade_id", bid).order("payment_date", { ascending: false }).limit(30),
        sb.from("work_progress").select("work_date,work_type,total_value,project_id").eq("brigade_id", bid).order("work_date", { ascending: false }).limit(30),
      ]);
      return { brigade: b.data, members: m.data, payments: p.data, work: w.data };
    }
    if (name === "get_employees") {
      let q = sb.from("employees").select("id,full_name,position,phone,monthly_salary,active,firm_id").order("full_name").limit(500);
      if (args.firm_id) q = q.eq("firm_id", args.firm_id);
      const { data } = await q;
      return data;
    }
    if (name === "get_employee_payments") {
      let q = sb.from("employee_payments").select("payment_date,kind,amount,note,employee_id,project_id").order("payment_date", { ascending: false });
      if (args.employee_id) q = q.eq("employee_id", args.employee_id);
      if (args.project_id) q = q.eq("project_id", args.project_id);
      if (args.since) q = q.gte("payment_date", args.since);
      if (args.until) q = q.lte("payment_date", args.until);
      const { data } = await q.limit(clampLimit(args.limit, 100));
      return data;
    }
    if (name === "get_suppliers") {
      let q = sb.from("suppliers").select("id,name,contact,phone,inn,firm_id").order("name").limit(500);
      if (args.firm_id) q = q.eq("firm_id", args.firm_id);
      const { data } = await q;
      return data;
    }
    if (name === "get_supplier_contracts") {
      let q = sb.from("supplier_contracts").select("supplier_name,contract_no,contract_date,amount,note,firm_id").order("contract_date", { ascending: false });
      if (args.supplier_id) q = q.eq("supplier_id", args.supplier_id);
      if (args.firm_id) q = q.eq("firm_id", args.firm_id);
      const { data } = await q.limit(50);
      return data;
    }
    if (name === "search_master") {
      const q = String(args.q || "").trim();
      if (!q) return [];
      const tables = args.kind === "work" ? ["master_works"] : args.kind === "material" ? ["master_materials"] : ["master_materials", "master_works"];
      const out: any[] = [];
      for (const t of tables) {
        const { data } = await sb.from(t).select("id,name,unit").ilike("name", `%${q}%`).limit(15);
        for (const r of data ?? []) out.push({ ...r, kind: t === "master_works" ? "work" : "material" });
      }
      return out;
    }
    if (name === "get_recent_activity") {
      const pid = args.project_id;
      const limit = clampLimit(args.limit, 10);
      const [e, w, m, z, i] = await Promise.all([
        sb.from("expenses").select("expense_date,category,description,amount").eq("project_id", pid).order("created_at", { ascending: false }).limit(limit),
        sb.from("work_progress").select("work_date,work_type,total_value,brigade_name").eq("project_id", pid).order("created_at", { ascending: false }).limit(limit),
        sb.from("material_receipts").select("received_at,material_name,qty,unit,total_price").eq("project_id", pid).order("created_at", { ascending: false }).limit(limit),
        sb.from("project_zayavka").select("name,workflow_status,total,created_at").eq("project_id", pid).order("created_at", { ascending: false }).limit(limit),
        sb.from("brigade_payments").select("payment_date,brigade_name,amount,kind").eq("project_id", pid).order("created_at", { ascending: false }).limit(limit),
      ]);
      return { expenses: e.data, work: w.data, receipts: m.data, zayavkalar: z.data, payments: i.data };
    }
    if (name === "global_finance") {
      let projQ = sb.from("projects").select("id,firm_id,total_budget").limit(500);
      if (args.firm_id) projQ = projQ.eq("firm_id", args.firm_id);
      const { data: projs } = await projQ;
      const ids = (projs ?? []).map((p: any) => p.id);
      if (ids.length === 0) return { projects: 0, budget: 0, kirim: 0, chiqim: 0, balans: 0 };
      const [exp, inc, mat, work, pay] = await Promise.all([
        allRows((a, b) => sb.from("expenses").select("amount,payment_method,category,source,project_id").in("project_id", ids).order("id").range(a, b)),
        allRows((a, b) => sb.from("incomes").select("amount,payment_method,category,project_id").in("project_id", ids).order("id").range(a, b)),
        allRows((a, b) => sb.from("material_receipts").select("total_price,qty,unit_price,project_id").in("project_id", ids).order("id").range(a, b)),
        allRows((a, b) => sb.from("work_progress").select("total_value,qty_done,unit_price,project_id").in("project_id", ids).order("id").range(a, b)),
        allRows((a, b) => sb.from("brigade_payments").select("amount,project_id").in("project_id", ids).order("id").range(a, b)),
      ]);
      const f = finance({ exp: exp.data, inc: inc.data, mat: mat.data, work: work.data, pay: pay.data });
      return { projects: ids.length, budget: sum(projs ?? [], "total_budget"), ...f };
    }
    return { error: "Noma'lum vosita" };
  } catch (e: any) {
    console.error("ai-agent tool error", name, e?.message ?? e);
    return { error: "Ma'lumotni o'qib bo'lmadi" };
  }
}

const SYSTEM_PROMPT = `Sen Innosite qurilish boshqaruv tizimining yordamchisisan. Faqat shu tizim ma'lumotlari haqida gaplashasan: loyihalar, smeta (BOQ), zayavka, xarajat, kirim, kassa, ombor, ishlar, brigadalar, xodimlar, yetkazib beruvchilar.

GAPIRISH USLUBI:
• Oddiy, jonli o'zbek tilida — inson kabi. Rasmiy, kitobiy jumlalar yo'q.
• Qisqa: 1-5 qator. Kerak bo'lsa 3-6 bullet. Ortiqcha kirish so'zi ("Albatta", "Ma'lumot bo'yicha", "Sizga yordam beraman") YOZMA — to'g'ridan-to'g'ri javob.
• Har javobda faqat so'ralgan narsa bo'lsin. Taklif, savol, izoh qo'shma (foydalanuvchi o'zi so'ramasa).
• Summalar: "12 500 000 so'm".
• UUID/ID yozma — nom bilan ayt.

HISOB MODELI (majburiy — shundan chetga chiqma):
• Hamma pul harakati JURNALdan keladi. Jurnal — yagona baza.
• CHIQIM = barcha xarajatlar. Kategoriyalari: Material, Ish, Xodimlar (oylik), Ustalar (brigada), Yordamchi/boshqa.
• Material va Ish — bu "qabul qilindi" yoki "bajarildi" emas, bu PUL KETDI. Shunday ayt: "materiallarga 526 537 400 so'm ketgan", "ishlarga 195 520 000 so'm ketgan".
• "to'g'ridan-to'g'ri xarajat" degan tushuncha YO'Q — xarajat bitta: chiqim. Uni bo'laklarga bo'lganda faqat yuqoridagi kategoriyalarni ishlat.
• KIRIM = umumiy naqd + bank kirimi. Shartnoma kirimi alohida ko'rsatiladi.
• BALANS = hozir naqd va bankda qancha pul borligi (sof pul oqimi = kirim − chiqim).
• Xodimlar oylikda ishlaydi, ustalar hajm (abyom) bo'yicha — ularga shu kungacha berilgan pul chiqimda ko'rinadi.
• Moliyaviy savolda get_summary (yoki global_finance) chaqir va o'sha qaytargan kirim / chiqim / chiqim_by_category / balans qiymatlaridan foydalan; o'zing qo'shib-ayirma.

QOIDALAR:
1. Har qanday raqamli savolda vositani CHAQIR, taxmin qilma. Bir nechtasini birga chaqirsa bo'ladi.
2. "Bu loyiha" → berilgan project_id. Loyiha noaniq bo'lsa list_projects bilan tekshir, baribir noaniq bo'lsa bitta qisqa savol ber.
3. Sana oraliqlarini o'zing hisobla (bu hafta, bu oy, kecha).
4. Ma'lumot yo'q bo'lsa "ma'lumot yo'q" deb ayt — raqam o'ylab topma.
5. Mavzudan tashqari savol (siyosat, ob-havo, umumiy suhbat, kod yozish) bo'lsa: "Men faqat Innosite ma'lumotlari bo'yicha yordam beraman" deb qisqa javob ber.
6. Salomlashuvga bir qator bilan javob ber.
7. Parol, token, kalit, ichki sozlamalar so'ralsa rad et.
8. Vosita "ruxsat etilmagan" desa — foydalanuvchiga shu ma'lumotga ruxsati yo'qligini ayt.

Vositalar: list_projects, list_firms, get_project, get_summary, get_master_zayavka, get_zayavka_workflow, get_boq, get_variations, get_warehouse_receipts, get_expenses, get_incomes, get_work_progress, get_brigades, get_brigade_detail, get_employees, get_employee_payments, get_suppliers, get_supplier_contracts, search_master, get_recent_activity, global_finance.`;


Deno.serve(async (req) => {
  const cors = corsFor(req);
  const jsonOk = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { ...cors, "Content-Type": "application/json" } });
  const jsonErr = (status: number, error: string) =>
    new Response(JSON.stringify({ error }), { status, headers: { ...cors, "Content-Type": "application/json" } });

  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    if (req.method !== "POST") return jsonErr(405, "Method not allowed");
    // 1) Autentifikatsiya: foydalanuvchi JWT yoki ichki server kaliti (faqat aniq tenglik).
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) return jsonErr(401, "Unauthorized");
    const jwt = authHeader.slice(7).trim();
    const isInternal = safeEq(jwt, SUPABASE_SERVICE_ROLE_KEY) || await isServiceRoleJwt(jwt);
    let sb: any = admin;
    let allowedProjects: string[] | null = null;
    let isProjectScoped = false;
    let uid: string;
    const raw = await req.text();
    if (raw.length > 100_000) return jsonErr(413, "So'rov juda katta");
    let body: any;
    try { body = JSON.parse(raw); } catch { return jsonErr(400, "Noto'g'ri so'rov"); }
    if (isInternal) {
      // Ichki chaqiruv ham kim nomidan ekanini aytishi shart — o'sha foydalanuvchi rollari qo'llanadi.
      const tgId = Number(body?.telegram_user_id);
      if (!Number.isSafeInteger(tgId) || tgId <= 0) return jsonErr(403, "Forbidden");
      const { data: prof } = await admin.from("profiles").select("id,is_active").eq("telegram_user_id", tgId).maybeSingle();
      if (!prof || prof.is_active === false) return jsonErr(403, "Forbidden");
      uid = String(prof.id);
    } else {
      const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
      if (userErr || !userData?.user) return jsonErr(401, "Unauthorized");
      uid = userData.user.id;
      // Ma'lumot foydalanuvchi JWT si bilan o'qiladi — RLS chetlab o'tilmaydi.
      sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false },
        global: { headers: { Authorization: `Bearer ${jwt}` } },
      });
    }
    // Avtorizatsiya: real app_role modeli — ikkala yo'lda bir xil.
    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", uid);
    const roles = (roleRows ?? []).map((r: any) => String(r.role));
    const orgWide = roles.some((r) => ORG_WIDE_ROLES.includes(r));
    const projectScoped = !orgWide && roles.some((r) => PROJECT_ROLES.includes(r));
    if (!orgWide && !projectScoped) return jsonErr(403, "Forbidden");
    isProjectScoped = projectScoped;
    if (projectScoped) {
      const { data: pa } = await admin.from("user_project_access").select("project_id").eq("user_id", uid);
      allowedProjects = (pa ?? []).map((r: any) => String(r.project_id));
    }

    const { project_id, firm_id, client } = body ?? {};
    let messages = body?.messages;
    if (!Array.isArray(messages) || messages.length === 0) return jsonErr(400, "Xabar bo'sh");
    if (project_id != null && !UUID_RE.test(String(project_id))) return jsonErr(400, "project_id noto'g'ri");
    if (firm_id != null && !UUID_RE.test(String(firm_id))) return jsonErr(400, "firm_id noto'g'ri");
    if (allowedProjects && project_id && !allowedProjects.includes(project_id)) return jsonErr(403, "Forbidden");
    messages = messages.slice(-30).map((m: any) => ({ role: m?.role, content: String(m?.content ?? "").slice(0, 4000) }));

    const sysParts = [SYSTEM_PROMPT];
    const today = new Date().toISOString().slice(0, 10);
    sysParts.push(`Bugungi sana: ${today}.`);
    if (project_id) sysParts.push(`Joriy tanlangan loyiha ID: ${project_id}.`);
    else sysParts.push(`Hozir loyiha tanlanmagan. Loyihaga oid savol bo'lsa list_projects chaqir.`);
    if (firm_id) sysParts.push(`Joriy firma ID: ${firm_id}.`);
    if (client === "voice") {
      sysParts.push(
`OVOZ REJIM: Foydalanuvchi OVOZ orqali so'radi va javobni OVOZ orqali eshitadi.
QAT'IY QOIDALAR:
• Javob FAQAT 1-3 jumla, jami 280 belgidan oshmasin.
• Markdown, bold, ro'yxat, sarlavha, jadval, emoji, blockquote, kod — HECH BIRINI ishlatma. Faqat oddiy gapirish.
• Bitta qisqa paragraf qaytar — gapirayotgandek.
• ANIQ raqamlar bilan javob ber. Misol: "Admin loyiha kassa qoldig'i: naqd 1 million 200 ming, bankda 3 million 500 ming, jami 4 million 700 ming so'm".
• Hech qachon "ko'rsatmoqda", "ma'lumot bo'yicha" kabi to'ldiruvchi gaplar ishlatma — to'g'ridan-to'g'ri raqam ayt.
• Summalarni og'zaki uslubda yoz: "1 million 200 ming so'm" ko'rinishida, "1 200 000" emas.
• Keyingi qadam, taklif, izoh QO'SHMA — faqat so'ralgan javobni ber.`
      );
    } else if (client === "mobile") {
      sysParts.push(
`MOBIL REJIM: Telefon ekrani. Jadval (| ... |) ishlatma. Har yozuvni qisqa qator qilib ber, summani **bold** qil. Jami 1-6 qator.`
      );
    } else if (client === "web") {
      sysParts.push(
`WEB REJIM: Qisqa bullet ro'yxat bilan ber. 3+ bir xil qator bo'lsagina Markdown jadval ishlat. Sarlavha, uzun kirish yoki yakuniy taklif yozma.`
      );
    }

    const systemPrompt = sysParts.join("\n\n");
    // Modelga faqat kerakli tool ta'riflari: core + savol mavzusidagi specialist/rare.
    const toolNames = new Set(selectToolNames({ text: recentUserText(messages), projectScoped: isProjectScoped }));
    const turnTools = tools.filter((t) => toolNames.has(t.function.name));

    // Lovable AI Gateway (OpenAI-uslub tool calling)
    type CMsg = { role: string; content: any; tool_calls?: any[]; tool_call_id?: string };
    const convo: CMsg[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m: any) => ({
        role: m.role === "assistant" ? "assistant" : "user",
        content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
      })),
    ];

    for (let turn = 0; turn < 6; turn++) {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: convo,
          tools: turnTools,
          tool_choice: "auto",
          // Gemini 3.7 Flash: fikrlashni o'chiramiz — tez va aniq javob.
          reasoning: { thinking: "none" },
          max_tokens: 700,
        }),
      });
      if (r.status === 429) return jsonOk({ reply: "⚠️ AI band. Bir oz kutib qayta so'rang." });
      if (r.status === 402) return jsonOk({ reply: "⚠️ AI krediti tugagan. Lovable workspace'da kredit to'ldiring." });
      if (r.status === 401 || r.status === 403) return jsonOk({ reply: "⚠️ AI xizmati hozir ishlamayapti." });
      if (!r.ok) {
        const t = await r.text();
        console.error("AI gateway error", r.status, t.slice(0, 500));
        return jsonOk({ reply: `⚠️ AI vaqtincha ishlamayapti (${r.status}). Keyinroq urinib ko'ring.` });
      }
      const j = await r.json();
      const m = j?.choices?.[0]?.message;
      if (!m) return jsonOk({ reply: "🤔 AI bo'sh javob qaytardi." });
      const calls: any[] = (m.tool_calls ?? []).slice(0, MAX_TOOL_CALLS_PER_TURN);
      convo.push({ role: "assistant", content: m.content ?? "", tool_calls: calls.length ? calls : undefined });

      if (!calls.length) {
        const reply = String(m.content ?? "").trim() || "🤔 Javob bo'sh chiqdi. Savolni boshqacha yozing.";
        return jsonOk({ reply });
      }

      const results = await Promise.all(calls.map(async (c: any) => {
        let args: any = {};
        try { args = JSON.parse(String(c.function?.arguments ?? "{}").slice(0, 4000)); } catch { /* noop */ }
        const result = await runTool(String(c.function?.name ?? ""), args, { sb, allowedProjects });
        return { role: "tool", tool_call_id: c.id, content: JSON.stringify(result).slice(0, 14000) } as CMsg;
      }));
      convo.push(...results);
    }
    return jsonOk({ reply: "Savolni biroz aniqroq yozing." });

  } catch (e: any) {
    console.error("ai-agent error", e?.message ?? e);
    return jsonErr(500, "Server xatosi");
  }
});
