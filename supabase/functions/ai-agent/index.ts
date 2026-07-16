// AI agent for QurilishNazorat. Uses Lovable AI gateway with tool calling.
// Tools query Supabase data via service role (read-only) to keep the agent honest.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY")!;
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-5";
const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const tools = [
  { type: "function", function: { name: "list_projects", description: "Tizimdagi barcha loyihalar (id, nom, kod, status, byudjet, sanalar, firma).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "list_firms", description: "Barcha firmalar ro'yxati.", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_project", description: "Bitta loyiha to'liq ma'lumoti (sanalar, byudjet, firma, status).", parameters: { type: "object", properties: { project_id: { type: "string" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_master_zayavka", description: "Loyiha master zayavkasi (material/ish reja qatorlari, qabul/qoldi).", parameters: { type: "object", properties: { project_id: { type: "string" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_zayavka_workflow", description: "Loyiha zayavkalari workflow holati. status: pending_pm/approved/rejected/in_purchase/delivered/invoiced/paid.", parameters: { type: "object", properties: { project_id: { type: "string" }, status: { type: "string" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_summary", description: "Loyihaning umumiy moliyaviy holati: byudjet, fakt, kirim/chiqim (Naxd/Bank), kassa qoldig'i, material/ish summalari, bajarilish %, deadline.", parameters: { type: "object", properties: { project_id: { type: "string" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_warehouse_receipts", description: "Loyihaga kelgan oxirgi nakladnoylar (material qabuli).", parameters: { type: "object", properties: { project_id: { type: "string" }, limit: { type: "number" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_expenses", description: "Loyiha xarajatlari. Filterlar: kategoriya, payment_method (Naqd/Bank/Karta), sana oraliqi.", parameters: { type: "object", properties: { project_id: { type: "string" }, category: { type: "string" }, payment_method: { type: "string" }, since: { type: "string" }, until: { type: "string" }, limit: { type: "number" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_incomes", description: "Loyiha kirimi (brigade_payments dan kind != 'avans'). Manba (Naqd/Bank/Karta) bo'yicha taqsimot.", parameters: { type: "object", properties: { project_id: { type: "string" }, since: { type: "string" }, until: { type: "string" }, limit: { type: "number" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_work_progress", description: "Loyiha bo'yicha bajarilgan ishlar (turi, hajmi, summasi, brigada, sana).", parameters: { type: "object", properties: { project_id: { type: "string" }, since: { type: "string" }, until: { type: "string" }, limit: { type: "number" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_boq", description: "Loyiha BOQ (smeta) qatorlari va har birining bajarilish %, fakt vs reja.", parameters: { type: "object", properties: { project_id: { type: "string" }, category: { type: "string" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_variations", description: "Loyiha bo'yicha variations (qo'shimcha ish/o'zgartirishlar) ro'yxati va statuslari.", parameters: { type: "object", properties: { project_id: { type: "string" }, status: { type: "string" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "get_brigades", description: "Barcha brigadalar va ularning balansi (ishlangan − to'langan).", parameters: { type: "object", properties: {} } } },
  { type: "function", function: { name: "get_brigade_detail", description: "Bitta brigada to'liq: a'zolar, oxirgi to'lovlar, qilingan ishlar.", parameters: { type: "object", properties: { brigade_id: { type: "string" } }, required: ["brigade_id"] } } },
  { type: "function", function: { name: "get_employees", description: "Xodimlar ro'yxati (lavozim, oylik, faollik).", parameters: { type: "object", properties: { firm_id: { type: "string" } } } } },
  { type: "function", function: { name: "get_employee_payments", description: "Xodim oylik/avans to'lovlari. Filterlar: employee_id, project_id, sana.", parameters: { type: "object", properties: { employee_id: { type: "string" }, project_id: { type: "string" }, since: { type: "string" }, until: { type: "string" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "get_suppliers", description: "Yetkazib beruvchilar va kontaktlari.", parameters: { type: "object", properties: { firm_id: { type: "string" } } } } },
  { type: "function", function: { name: "get_supplier_contracts", description: "Yetkazib beruvchilar bilan shartnomalar.", parameters: { type: "object", properties: { supplier_id: { type: "string" }, firm_id: { type: "string" } } } } },
  { type: "function", function: { name: "search_master", description: "Master katalogdan material/ish nomi bo'yicha qidirish.", parameters: { type: "object", properties: { q: { type: "string" }, kind: { type: "string", enum: ["material", "work"] } }, required: ["q"] } } },
  { type: "function", function: { name: "get_recent_activity", description: "Loyiha bo'yicha so'nggi aktivlik (yangi xarajat, kirim, ish, qabul, zayavka).", parameters: { type: "object", properties: { project_id: { type: "string" }, limit: { type: "number" } }, required: ["project_id"] } } },
  { type: "function", function: { name: "global_finance", description: "Butun tizim yoki firma kesimida moliya: kirim, chiqim (method bo'yicha), kassa qoldig'i, sof natija.", parameters: { type: "object", properties: { firm_id: { type: "string" } } } } },
];

const sum = (rows: any[] = [], k: string) => rows.reduce((a, r) => a + Number(r[k] || 0), 0);

async function runTool(name: string, args: any): Promise<any> {
  try {
    if (name === "list_projects") {
      const { data } = await sb.from("projects").select("id,name,code,status,total_budget,start_date,end_date,firm_id").order("name");
      return data;
    }
    if (name === "list_firms") {
      const { data } = await sb.from("firms").select("id,name,inn,phone").order("name");
      return data;
    }
    if (name === "get_project") {
      const { data } = await sb.from("projects").select("*").eq("id", args.project_id).maybeSingle();
      return data;
    }
    if (name === "get_master_zayavka") {
      const { data } = await sb.from("project_zayavka")
        .select("id,kind,name,unit,qty,unit_price,total,status,workflow_status,paid_amount,supplier_name")
        .eq("project_id", args.project_id).is("parent_id", null);
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
      const [proj, boq, exp, mat, work, vars, inc] = await Promise.all([
        sb.from("projects").select("name,total_budget,start_date,end_date,status").eq("id", pid).maybeSingle(),
        sb.from("boq_items").select("planned_cost,actual_cost,qty").eq("project_id", pid),
        sb.from("expenses").select("amount,payment_method,expense_date,category").eq("project_id", pid),
        sb.from("material_receipts").select("total_price").eq("project_id", pid),
        sb.from("work_progress").select("total_value").eq("project_id", pid),
        sb.from("project_zayavka").select("status,workflow_status").eq("project_id", pid),
        sb.from("brigade_payments").select("amount,kind,source").eq("project_id", pid),
      ]);
      const incomes = (inc.data ?? []).filter((r: any) => (r.kind ?? "").toLowerCase() !== "avans");
      const byMethod = { Naqd: 0, Bank: 0, Karta: 0, Boshqa: 0 } as Record<string, number>;
      for (const r of exp.data ?? []) { const m = String(r.payment_method || "Boshqa"); byMethod[m] = (byMethod[m] || 0) + Number(r.amount || 0); }
      const inByKind: Record<string, number> = {};
      for (const r of incomes) { const k = String(r.source || r.kind || "Boshqa"); inByKind[k] = (inByKind[k] || 0) + Number(r.amount || 0); }
      const payIn = sum(incomes, "amount");
      const totalOut = sum(exp.data ?? [], "amount");
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
        budget: proj.data?.total_budget ?? planned,
        boq_planned: planned,
        boq_actual: actual,
        materials: sum(mat.data ?? [], "total_price"),
        work: sum(work.data ?? [], "total_value"),
        expenses_total: totalOut,
        expenses_by_method: byMethod,
        income_total: payIn,
        income_by_source: inByKind,
        kassa_balance: payIn - totalOut,
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
        .eq("project_id", args.project_id).order("received_at", { ascending: false }).limit(args.limit ?? 30);
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
      const { data } = await q.limit(args.limit ?? 100);
      return data;
    }
    if (name === "get_incomes") {
      let q = sb.from("brigade_payments")
        .select("payment_date,brigade_name,amount,kind,source,note")
        .eq("project_id", args.project_id).neq("kind", "avans").order("payment_date", { ascending: false });
      if (args.since) q = q.gte("payment_date", args.since);
      if (args.until) q = q.lte("payment_date", args.until);
      const { data } = await q.limit(args.limit ?? 100);
      const total = sum(data ?? [], "amount");
      const by: Record<string, number> = {};
      for (const r of data ?? []) { const k = String(r.source || r.kind || "Boshqa"); by[k] = (by[k] || 0) + Number(r.amount || 0); }
      return { total, by_source: by, items: data };
    }
    if (name === "get_work_progress") {
      let q = sb.from("work_progress")
        .select("work_date,work_type,qty_done,unit,unit_price,total_value,brigade_name")
        .eq("project_id", args.project_id).order("work_date", { ascending: false });
      if (args.since) q = q.gte("work_date", args.since);
      if (args.until) q = q.lte("work_date", args.until);
      const { data } = await q.limit(args.limit ?? 50);
      return data;
    }
    if (name === "get_boq") {
      let q = sb.from("boq_items").select("code,description,category,unit,qty,rate,planned_cost,actual_cost").eq("project_id", args.project_id).order("code");
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
        sb.from("brigades").select("id,name,leader,phone,member_count"),
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
        sb.from("brigades").select("*").eq("id", bid).maybeSingle(),
        sb.from("brigade_members").select("*").eq("brigade_id", bid),
        sb.from("brigade_payments").select("payment_date,amount,kind,project_id,note").eq("brigade_id", bid).order("payment_date", { ascending: false }).limit(30),
        sb.from("work_progress").select("work_date,work_type,total_value,project_id").eq("brigade_id", bid).order("work_date", { ascending: false }).limit(30),
      ]);
      return { brigade: b.data, members: m.data, payments: p.data, work: w.data };
    }
    if (name === "get_employees") {
      let q = sb.from("employees").select("id,full_name,position,phone,monthly_salary,active,firm_id").order("full_name");
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
      const { data } = await q.limit(args.limit ?? 100);
      return data;
    }
    if (name === "get_suppliers") {
      let q = sb.from("suppliers").select("id,name,contact,phone,inn,firm_id").order("name");
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
      const limit = args.limit ?? 10;
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
      let projQ = sb.from("projects").select("id,firm_id,total_budget");
      if (args.firm_id) projQ = projQ.eq("firm_id", args.firm_id);
      const { data: projs } = await projQ;
      const ids = (projs ?? []).map((p: any) => p.id);
      if (ids.length === 0) return { projects: 0, budget: 0, payIn: 0, totalOut: 0, kassa: 0 };
      const [exp, inc] = await Promise.all([
        sb.from("expenses").select("amount,payment_method,project_id").in("project_id", ids),
        sb.from("brigade_payments").select("amount,kind,source,project_id").in("project_id", ids),
      ]);
      const incomes = (inc.data ?? []).filter((r: any) => (r.kind ?? "").toLowerCase() !== "avans");
      const byMethod: Record<string, number> = { Naqd: 0, Bank: 0, Karta: 0, Boshqa: 0 };
      for (const r of exp.data ?? []) { const m = String(r.payment_method || "Boshqa"); byMethod[m] = (byMethod[m] || 0) + Number(r.amount || 0); }
      const inBy: Record<string, number> = {};
      for (const r of incomes) { const k = String(r.source || r.kind || "Boshqa"); inBy[k] = (inBy[k] || 0) + Number(r.amount || 0); }
      const payIn = sum(incomes, "amount");
      const totalOut = sum(exp.data ?? [], "amount");
      return {
        projects: ids.length,
        budget: sum(projs ?? [], "total_budget"),
        payIn, in_by_source: inBy,
        totalOut, out_by_method: byMethod,
        kassa: payIn - totalOut,
        net: payIn - totalOut,
      };
    }
    return { error: `Noma'lum vosita: ${name}` };
  } catch (e: any) {
    return { error: e?.message ?? String(e) };
  }
}

const SYSTEM_PROMPT = `Sen "QurilishNazorat" qurilish boshqaruv tizimining bosh AI yordamchisisan — admin, loyiha menejeri (PM) va direktor (CEO) uchun ishlaysan. O'zbek tilida do'stona, aniq va professional javob ber. HAR QANDAY savolga javob ber: tizim ma'lumotlari, moliyaviy tahlil, taqqoslash, prognoz, salomlashish, umumiy maslahat, qurilish bo'yicha bilim.

TIZIM BO'LIMLARI VA VOSITALAR:
• Loyihalar / firmalar — list_projects, list_firms, get_project
• Moliya (byudjet, kirim, chiqim, kassa qoldig'i, sof natija) — get_summary, get_expenses, get_incomes, global_finance
• Buyurtma (zayavka) reja va workflow — get_master_zayavka, get_zayavka_workflow
• BOQ (smeta) va bajarilish % — get_boq
• Variations (qo'shimcha ish) — get_variations
• Ombor qabuli (nakladnoylar) — get_warehouse_receipts
• Bajarilgan ishlar — get_work_progress
• Brigadalar (balans, a'zolar, to'lovlar) — get_brigades, get_brigade_detail
• Xodimlar va maoshlar — get_employees, get_employee_payments
• Yetkazib beruvchilar va shartnomalar — get_suppliers, get_supplier_contracts
• Master katalog — search_master
• So'nggi aktivlik — get_recent_activity

QOIDALAR:
1. Loyihaga oid HAR QANDAY savolda kerakli vositalarni CHAQIR — taxmin qilma. Bir nechtasini parallel chaqirib natijalarni birlashtir.
2. "Hozirgi/shu/joriy loyiha" → yetkazilgan project_id ni ishlat. Loyiha aytilmagan bo'lsa va savol loyihaga oidsa: avval list_projects bilan ro'yxatni ol, foydalanuvchi nomini matndan toping yoki aniq qaysi loyiha ekanini so'rang.
3. Sana oraliqlari ("bu hafta", "bu oy", "yil boshidan", "kecha") — o'zing hisobla va since/until parametrlarda yubor.
4. Summalar formatda: "12 500 000 so'm" (3 honali probel ajratuvchi).
5. Ko'p qatorli ma'lumot uchun Markdown jadval ishlat. Jami va o'rtacha summalarni alohida ko'rsat.
6. Tahlil/solishtirish so'ralganda: foiz, farq, tendensiya, anomaliya (juda katta xarajat, kechiktirilgan to'lov, byudjetdan oshgan BOQ) ni o'zing topib aytib ber.
7. Topilmasa "topilmadi" deb ayt — soxta raqam yozma.
8. Javob qisqa va aniq (3-8 qator). Foydalanuvchi "batafsil" desa kengaytir, jadval ber.
9. Maxfiy ma'lumot (parol, token, RLS qoidalari, boshqa loyihalar haqida ruxsatsiz) so'ralsa rad et.
10. Salom/umumiy savolda — vositalarni chaqirma, samimiy javob ber.
11. Foydalanuvchi savolida bir nechta loyiha nomi yoki sana eslatilsa — har birini alohida tekshir.
12. Qisqa xulosalar oxirida foydali keyingi qadam taklif qil (masalan: "Tasdiqlanmagan 5 ta zayavkani ko'rishni xohlaysizmi?").`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { messages, project_id, firm_id, client } = await req.json();
    if (!Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Xabar bo'sh" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
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
`MOBIL REJIM: Foydalanuvchi telefondan yozyapti. Markdown JADVAL (| ... |) ISHLATMA — kichik ekranda chiqib ketadi.
O'rniga har bir yozuvni alohida blok qilib ber:

**Nomi**
• Maydon: qiymat
• Maydon: qiymat

Bloklar orasida bo'sh qator qoldir. Summalarni **bold** qil. Javob qisqa va vertikal o'qishga qulay bo'lsin.`
      );
    } else if (client === "web") {
      sysParts.push(
`WEB REJIM: Foydalanuvchi katta ekranda ko'radi. Javobni chiroyli va o'qishga oson tuz:

• Bo'limlar uchun "## Sarlavha" (h2) yoki "### Kichik sarlavha" (h3) ishlat — bittadan ortiq bo'lim bo'lsa.
• Asosiy ko'rsatkichlarni (byudjet, kassa, qoldiq, bajarilish %) qisqa bullet ro'yxat bilan ber:
  - **Byudjet:** 11 000 000 000 so'm
  - **Bajarilish:** 42 %
  - **Kassa qoldig'i:** 250 000 so'm
• 3+ qator bir xil turdagi ma'lumot bo'lsa — Markdown jadval (| Ustun | ... |) ishlat, sarlavha qatori va kerak bo'lsa "**Jami**" qatori bilan.
• Bo'limlar orasida bo'sh qator qoldir. Har abzats 1-3 qator bo'lsin.
• Muhim ogohlantirish: "> ⚠️ ..." blockquote bilan ajrat. Yaxshi yangilik: "> ✅ ...".
• Oxirida qisqa **Keyingi qadam:** taklif bilan tugat (1 qator).
• Xom ID/UUID yozma — foydalanuvchi tushunadigan nomda ko'rsat.`
      );
    }

    const systemPrompt = sysParts.join("\n\n");

    // OpenAI-style tools → Anthropic format
    const anthropicTools = tools.map((t: any) => ({
      name: t.function.name,
      description: t.function.description,
      input_schema: t.function.parameters,
    }));

    // OpenAI-style messages → Anthropic format (skip system; convert tool role)
    type AMsg = { role: "user" | "assistant"; content: any };
    const convo: AMsg[] = messages.map((m: any) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
    }));

    for (let turn = 0; turn < 14; turn++) {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 4096,
          system: systemPrompt,
          messages: convo,
          tools: anthropicTools,
        }),
      });
      if (r.status === 429) return new Response(JSON.stringify({ error: "AI limit oshib ketdi, biroz kuting.", reply: "⚠️ AI so'rov limiti vaqtincha oshib ketdi. Bir oz kutib qaytadan urinib ko'ring." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (r.status === 401 || r.status === 403) return new Response(JSON.stringify({ error: "Anthropic kaliti noto'g'ri.", reply: "⚠️ Anthropic API kaliti noto'g'ri yoki muddati o'tgan. Lovable secrets'da ANTHROPIC_API_KEY ni yangilang." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (r.status === 402 || r.status === 529) return new Response(JSON.stringify({ error: "Anthropic krediti tugadi.", reply: "⚠️ Anthropic balansi tugadi yoki overload. console.anthropic.com'da balansni tekshiring." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (!r.ok) {
        const t = await r.text();
        console.error("Anthropic error", r.status, t);
        return new Response(JSON.stringify({ error: `AI xato: ${r.status}`, reply: `⚠️ AI xatosi: ${r.status}. ${t.slice(0, 200)}` }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const j = await r.json();
      const contentBlocks: any[] = j?.content ?? [];
      if (!contentBlocks.length) return new Response(JSON.stringify({ error: "AI bo'sh javob", reply: "🤔 AI bo'sh javob qaytardi." }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      // Push assistant turn as-is (content blocks)
      convo.push({ role: "assistant", content: contentBlocks });

      const toolUses = contentBlocks.filter((b) => b.type === "tool_use");
      if (!toolUses.length) {
        const reply = contentBlocks
          .filter((b) => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim() || "🤔 Javob bo'sh chiqdi. Savolni boshqacha shaklda yozib ko'ring.";
        return new Response(JSON.stringify({ reply }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const toolResults = await Promise.all(toolUses.map(async (tu: any) => {
        const result = await runTool(tu.name, tu.input ?? {});
        return { type: "tool_result", tool_use_id: tu.id, content: JSON.stringify(result).slice(0, 14000) };
      }));
      convo.push({ role: "user", content: toolResults });
    }
    return new Response(JSON.stringify({ reply: "Iltimos savolni aniqroq yozing." }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e: any) {
    console.error("ai-agent error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "Server xato" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
