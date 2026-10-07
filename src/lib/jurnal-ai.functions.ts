import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertProjectAccess(userId: string, projectId: string) {
  const { data: roleRows } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
  const roles = (roleRows ?? []).map((r: any) => String(r.role));
  const privileged = ["admin", "ceo", "direktor", "finans", "pm"];
  if (roles.some((r) => privileged.includes(r))) return;
  const { data: acc } = await supabaseAdmin
    .from("user_project_access").select("project_id")
    .eq("user_id", userId).eq("project_id", projectId).maybeSingle();
  if (!acc) throw new Error("Forbidden: project access denied");
}

type ParsedItem = {
  kind: "material" | "work" | "expense" | "income";
  matched_zayavka_id: string | null;
  boq_item_id: string | null;
  boq_code: string | null;
  master_material_id: string | null;
  master_work_id: string | null;
  category: string | null;
  payment_method: string | null;
  name: string;
  unit: string | null;
  qty: number;
  unit_price: number;
  who: string | null;
  note: string | null;
  date: string | null;
};

function aiGatewayErrorMessage(status: number, body: string) {
  let title = "AI tahlil vaqtincha ishlamayapti";
  try {
    const parsed = JSON.parse(body);
    title = String(parsed?.message || parsed?.title || title);
  } catch {
    if (body.trim()) title = body.trim().slice(0, 120);
  }

  if (status === 402 || /not enough credits|payment_required/i.test(body)) {
    return "AI krediti yetarli emas. Yozuvni qo'lda kiriting yoki kredit to'ldirilgandan keyin AI tahlilni qayta ishlating.";
  }
  if (status === 429) {
    return "AI so'rovlari limiti oshib ketdi. Birozdan keyin qayta urinib ko'ring.";
  }
  return `AI xatolik (${status}): ${title}`;
}

// Cyrillic -> Latin (uz) transliteration for fuzzy matching
const CYR: Record<string, string> = {
  а:"a",б:"b",в:"v",г:"g",ғ:"g",д:"d",е:"e",ё:"yo",ж:"j",з:"z",и:"i",й:"y",
  к:"k",қ:"q",л:"l",м:"m",н:"n",ң:"ng",о:"o",ө:"o",ў:"o'",п:"p",р:"r",с:"s",
  т:"t",у:"u",ф:"f",х:"x",ҳ:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sh",ъ:"'",ы:"i",ь:"",
  э:"e",ю:"yu",я:"ya",
};
function norm(s: string): string {
  if (!s) return "";
  let out = "";
  for (const ch of s.toLowerCase()) out += CYR[ch] ?? ch;
  return out.replace(/[^a-z0-9]+/g, "");
}
// rough similarity: 1 if equal/substring, else dice coefficient on bigrams
function sim(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.includes(b) || b.includes(a)) return 0.95;
  const bg = (s: string) => {
    const set = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) set.add(s.slice(i, i + 2));
    return set;
  };
  const A = bg(a), B = bg(b);
  if (!A.size || !B.size) return 0;
  let inter = 0;
  for (const x of A) if (B.has(x)) inter++;
  return (2 * inter) / (A.size + B.size);
}

function parseMoney(text: string): number {
  const lower = text.toLowerCase();
  // Match number with optional thousands separators (space, comma, dot, apostrophe) and optional decimal
  // e.g. "5,000,000,000", "5 000 000", "5.000.000", "1 500.50", "5"
  const m = lower.match(/(\d[\d\s.,'`]*\d|\d)\s*(mlrd|milliard|миллиард|billion|bln|mln|million|млн|ming|минг|k|000)?/i);
  if (!m) return 0;
  const raw = m[1];
  const unit = (m[2] ?? "").toLowerCase();

  // Detect decimal vs thousands separator
  let numStr = raw.replace(/[\s'`]/g, "");
  const hasComma = numStr.includes(",");
  const hasDot = numStr.includes(".");
  if (hasComma && hasDot) {
    // Last one is decimal separator
    const lastComma = numStr.lastIndexOf(",");
    const lastDot = numStr.lastIndexOf(".");
    if (lastComma > lastDot) {
      numStr = numStr.replace(/\./g, "").replace(",", ".");
    } else {
      numStr = numStr.replace(/,/g, "");
    }
  } else if (hasComma) {
    const parts = numStr.split(",");
    // If multiple commas OR comma followed by exactly 3 digits → thousands separator
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      numStr = numStr.replace(/,/g, "");
    } else {
      numStr = numStr.replace(",", ".");
    }
  } else if (hasDot) {
    const parts = numStr.split(".");
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      numStr = numStr.replace(/\./g, "");
    }
  }

  const n = Number(numStr);
  if (!Number.isFinite(n)) return 0;
  if (["mlrd", "milliard", "миллиард", "billion", "bln"].includes(unit)) return n * 1_000_000_000;
  if (["mln", "million", "млн"].includes(unit)) return n * 1_000_000;
  if (["ming", "минг", "k"].includes(unit)) return n * 1_000;
  return n;
}

export const parseJurnalEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { projectId: string; text: string }) => input)
  .handler(async ({ data, context }) => {
    await assertProjectAccess(context.userId, data.projectId);
    const { projectId, text } = data;
    if (!text?.trim()) return { items: [] as ParsedItem[], error: null as string | null };

    const sb = supabaseAdmin;

    if (!process.env.LOVABLE_API_KEY) {
      return { items: [] as ParsedItem[], error: "AI kaliti sozlanmagan. Yozuvni qo'lda kiriting yoki keyinroq qayta urinib ko'ring." };
    }

    const { data: plan } = await sb
      .from("project_zayavka")
      .select("id,kind,name,unit,unit_price,boq_item_id,master_material_id,master_work_id")
      .eq("project_id", projectId)
      .in("kind", ["material", "work"])
      .eq("status", "approved")
      .is("zayavka_no", null);

    const planArr = (plan ?? []) as Array<{ id: string; kind: string; name: string; unit: string | null; unit_price: number | null; boq_item_id: string | null; master_material_id: string | null; master_work_id: string | null }>;
    const matList = planArr.filter(p => p.kind === "material");
    const workList = planArr.filter(p => p.kind === "work");
    const fmt = (p: any) => `${p.id}|${p.name} (${p.unit ?? ""}) — ${p.unit_price ?? 0}`;

    // BOQ codes for matched zayavkas
    const boqIds = Array.from(new Set(planArr.map(p => p.boq_item_id).filter(Boolean) as string[]));
    let boqMap = new Map<string, string>();
    if (boqIds.length) {
      const { data: boqs } = await sb.from("boq_items").select("id,code").in("id", boqIds);
      boqMap = new Map((boqs ?? []).map((b: any) => [b.id, b.code]));
    }

    // Available expense categories
    const { data: cats } = await sb.from("expense_categories").select("name").order("name");
    const catNames = (cats ?? []).map((c: any) => c.name).filter(Boolean);
    const catLine = catNames.length ? catNames.join(" | ") : "Qurilish materiali | Oziq-ovqat | Benzin | Salyarka | Texnika | Ofis/Lager | Oylik | Avans | Boshqa";

    const today = new Date().toISOString().slice(0, 10);
    const sys = `Sen qurilish jurnalga yozuv kirituvchi yordamchisan. Foydalanuvchi qisqa matn (yoki ovoz transkripsiyasi) yozadi — har bir tilga olingan element uchun bitta yozuv qaytarasan.

Loyiha rejasidagi tasdiqlangan MATERIALLAR (id|nom (birlik) — narx):
${matList.map(fmt).join("\n") || "(bo'sh)"}

Loyiha rejasidagi tasdiqlangan ISHLAR (id|nom (birlik) — narx):
${workList.map(fmt).join("\n") || "(bo'sh)"}

QOIDALAR:
- "kind": "material" | "work" | "expense" | "income".
- KIRIM PUL (income): agar matnda "kirim", "pul oldim", "pul keldi", "prixod", "приход", "kassaga tushdi", "tushdi", "to'lov keldi", "investitsiya", "avans oldik", "mijoz to'ladi" kabi PUL KELGANINI bildiruvchi so'zlar bo'lsa — kind="income". Bu xarajat EMAS, bu kassaga pul kirimi. "category" maydoniga to'lov usulini yozing: "Bank" yoki "Naqd" (shartnoma bo'yicha kirim bo'lsa "Shartnoma"). "payment_method": agar "bank", "plastik", "karta", "o'tkazma", "hisob" bo'lsa "Bank"; aks holda (naqd, qo'lga) "Naqd". qty=1, unit_price=summa, name=qisqa izoh (masalan "Mijozdan kirim", "Avans").
- MUHIM: nomlarni TAQQOSLASHDA kirill/lotin farqi, kichik/katta harf, imlo xatolari va qisqartmalar bo'lishi mumkin. Masalan "грунтовка" = "gruntovka" = "guruntovka"; "крилча" = "krilcha" = "kirilcha"; "цемент"="sement"; "кирпич"="g'isht". Agar reja elementi bilan bir xil ma'noni bersa — albatta bog'lang va matched_zayavka_id ni shu elementning id'iga teng qiling.
- Agar element rejadagi MATERIALga mos kelsa: kind="material", matched_zayavka_id=<id>, unit/unit_price rejadan (foydalanuvchi boshqa narx aytmasa).
- Agar element rejadagi ISHga mos kelsa: kind="work", matched_zayavka_id=<id>, unit/unit_price rejadan.
- Agar material yoki ish bo'lsa-yu rejada topilmasa: shu kindni qo'ying, matched_zayavka_id=null.
- Boshqa xarajat (transport, ovqat, ish haqi, texnika, kommunal, yordamchi va h.k.): kind="expense", "category" maydoniga kategoriya nomi. Mavjud kategoriyalar: ${catLine}. Mos kelmasa "Boshqa".
- qty: matndan aniqlang. Topa olmasangiz 1.
- date: matnda sana bo'lsa YYYY-MM-DD; bo'lmasa "${today}".
- who: ta'minotchi/brigada/ishchi/pul beruvchi nomi yoki null.
- note: qo'shimcha izoh yoki null.
- Faqat JSON: {"items":[{"kind":"material|work|expense|income","matched_zayavka_id":"uuid|null","category":"...|null","payment_method":"Naqd|Bank|null","name":"...","unit":"...|null","qty":number,"unit_price":number,"who":"...|null","note":"...|null","date":"YYYY-MM-DD|null"}]}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: text },
        ],
      }),
    });
    if (!res.ok) {
      const t = await res.text();
      return { items: [] as ParsedItem[], error: aiGatewayErrorMessage(res.status, t) };
    }
    const j = await res.json();
    const txt: string = j?.choices?.[0]?.message?.content ?? "";
    let parsed: any = { items: [] };
    try {
      parsed = JSON.parse(txt);
    } catch {
      // Try to extract first { ... } block
      const m = txt.match(/\{[\s\S]*\}/);
      if (m) {
        try { parsed = JSON.parse(m[0]); } catch {
          // Try to salvage items array even if truncated
          const arrMatch = txt.match(/"items"\s*:\s*\[([\s\S]*)/);
          if (arrMatch) {
            // Find last complete object inside the array
            const body = arrMatch[1];
            const objs: string[] = [];
            let depth = 0, start = -1;
            for (let i = 0; i < body.length; i++) {
              const c = body[i];
              if (c === "{") { if (depth === 0) start = i; depth++; }
              else if (c === "}") { depth--; if (depth === 0 && start >= 0) { objs.push(body.slice(start, i + 1)); start = -1; } }
            }
            const items: any[] = [];
            for (const o of objs) { try { items.push(JSON.parse(o)); } catch {} }
            parsed = { items };
          }
        }
      }
    }
    if (!parsed.items) parsed.items = [];

    const planById = new Map(planArr.map(p => [p.id, p]));
    const planNorm = planArr.map(p => ({ ...p, _n: norm(p.name) }));

    // keyword fallback for income detection
    const incomeRe = /\b(kirim|prixod|prexod|приход|пул\s*олд|pul\s*old|pul\s*keldi|kassaga|tushdi|to'?lov\s*keldi|investitsiya|avans\s*old|mijoz\s*to'?la)/i;
    const bankRe = /\b(bank|plastik|karta|o'?tkazma|hisob|перевод|карта)/i;

    const items = (parsed.items ?? []).map((it: any) => {
      let kind: "material" | "work" | "expense" | "income" =
        it?.kind === "material" ? "material"
        : it?.kind === "work" ? "work"
        : it?.kind === "income" ? "income"
        : "expense";
      let matched: string | null = it?.matched_zayavka_id ?? null;

      // validate AI match
      if (matched && !planById.has(matched)) matched = null;

      // keyword override: detect income from name/note
      const blob = `${text} ${it?.name ?? ""} ${it?.note ?? ""} ${it?.category ?? ""} ${it?.description ?? ""}`;
      if (kind !== "income" && (incomeRe.test(blob) || ((parsed.items ?? []).length === 1 && incomeRe.test(text)))) {
        kind = "income";
        matched = null;
      }

      // local fuzzy fallback for material/work (skip for income)
      if (!matched && kind !== "income") {
        const target = norm(String(it?.name ?? ""));
        if (target && target.length >= 3) {
          let best: { id: string; kind: string; score: number } | null = null;
          for (const p of planNorm) {
            const s = sim(target, p._n);
            if (!best || s > best.score) best = { id: p.id, kind: p.kind, score: s };
          }
          if (best && best.score >= 0.7) {
            matched = best.id;
            if (best.kind === "material") kind = "material";
            else if (best.kind === "work") kind = "work";
          }
        }
      }

      // pull unit/price from plan if matched and missing
      let unit = it?.unit ?? null;
      let unit_price = Number(it?.unit_price) || Number(it?.amount) || 0;
      // Always cross-check parsed money from raw text; prefer larger value when text clearly indicates it (mlrd/mln/ming or comma-grouped)
      const parsedFromText = parseMoney(blob);
      if (parsedFromText > unit_price) unit_price = parsedFromText;
      if (kind === "income" && !unit_price) unit_price = parsedFromText;
      if (matched) {
        const p = planById.get(matched)!;
        if (!unit) unit = p.unit;
        if (!unit_price) unit_price = Number(p.unit_price) || 0;
      }

      // payment_method for income
      let payment_method: string | null = it?.payment_method ?? null;
      if (kind === "income") {
        if (!payment_method) payment_method = bankRe.test(blob) ? "Bank" : "Naqd";
      }

      const matchedPlan = matched ? planById.get(matched) ?? null : null;
      const boq_item_id = matchedPlan?.boq_item_id ?? null;
      const boq_code = boq_item_id ? (boqMap.get(boq_item_id) ?? null) : null;
      const master_material_id = matchedPlan && matchedPlan.kind === "material" ? (matchedPlan.master_material_id ?? null) : null;
      const master_work_id = matchedPlan && matchedPlan.kind === "work" ? (matchedPlan.master_work_id ?? null) : null;

      return {
        kind,
        matched_zayavka_id: matched,
        boq_item_id,
        boq_code,
        master_material_id,
        master_work_id,
        category: kind === "income" ? (payment_method === "Bank" ? "Bank" : "Naqd") : (it?.category ?? null),
        payment_method,
        name: String(it?.name ?? "").trim() || (kind === "income" ? "Kirim" : ""),
        unit,
        qty: Number(it?.qty) || 1,
        unit_price,
        who: it?.who ?? null,
        note: it?.note ?? null,
        date: it?.date ?? null,
      } as ParsedItem;
    }) as ParsedItem[];

    return { items, error: null as string | null };
  });
