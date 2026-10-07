import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type RawRow = Record<string, any>;

function admin() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function normName(s: string): string {
  if (!s) return "";
  const cyr: Record<string, string> = {
    а:"a",б:"b",в:"v",г:"g",ғ:"g",д:"d",е:"e",ё:"yo",ж:"j",з:"z",и:"i",й:"y",
    к:"k",қ:"q",л:"l",м:"m",н:"n",ң:"ng",о:"o",ө:"o",ў:"o",п:"p",р:"r",с:"s",
    т:"t",у:"u",ф:"f",х:"x",ҳ:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sh",ъ:"",ы:"i",ь:"",
    э:"e",ю:"yu",я:"ya",
  };
  let out = "";
  for (const ch of s.toLowerCase()) out += cyr[ch] ?? ch;
  return out.replace(/[^a-z0-9]+/g, "");
}

async function callAI(messages: any[], model = "google/gemini-2.5-flash") {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`AI xatolik (${res.status}): ${txt.slice(0, 200)}`);
  }
  const j = await res.json();
  const txt: string = j?.choices?.[0]?.message?.content ?? "";
  return safeParseJson(txt);
}

function safeParseJson(raw: string): any {
  if (!raw) return {};
  let s = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1) return {};
  s = end > start ? s.slice(start, end + 1) : s.slice(start);
  const tryParse = (x: string) => { try { return JSON.parse(x); } catch { return undefined; } };
  let out = tryParse(s);
  if (out) return out;
  // clean control chars + trailing commas
  let cleaned = s.replace(/[\x00-\x1F\x7F]/g, " ").replace(/,\s*([}\]])/g, "$1");
  out = tryParse(cleaned);
  if (out) return out;
  // progressively truncate + balance brackets (handles truncation)
  for (let i = cleaned.length; i > 100; i -= 50) {
    let c = cleaned.slice(0, i).replace(/,\s*$/, "").replace(/:\s*"[^"]*$/, ': ""').replace(/:\s*[^,}\]\s]*$/, ': null');
    const openB = (c.match(/\{/g) || []).length - (c.match(/\}/g) || []).length;
    const openA = (c.match(/\[/g) || []).length - (c.match(/\]/g) || []).length;
    c = c.replace(/,\s*$/, "") + "]".repeat(Math.max(0, openA)) + "}".repeat(Math.max(0, openB));
    const r = tryParse(c);
    if (r) return r;
  }
  return {};
}

export const normalizeZayavkaRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: RawRow[] }) => {
    if (!input || !Array.isArray(input.rows)) throw new Error("rows majburiy");
    // Hajm cheklovi: AI va DB yuklamasini nazoratda saqlaydi
    return { rows: input.rows.slice(0, 2000) };
  })
  .handler(async ({ data, context }) => {
    // Faqat tizimda roli bor xodimlar (AI krediti va katalog ma'lumoti ochiq qolmasin)
    const { data: hasRole } = await context.supabase.rpc("has_any_role", { _user_id: context.userId });
    if (!hasRole) throw new Error("Ruxsat yo'q");
    const { rows } = data;
    if (!rows?.length) return { items: [] };

    // 1) AI normalizatsiya — material/work ajratish
    const sys = `Sen Excel jadvalidan qurilish smetasini (B.O.Q) normalizatsiya qiluvchi yordamchisan.
Foydalanuvchi ixtiyoriy ustun nomlari bilan qatorlarni yuboradi (uz/ru/en, kirill/lotin aralash).
Har bir qatorni "material" yoki "work" (ish) sifatida ANIQ tasniflang.

QOIDALAR:
- "kind": "material" yoki "work". Material: sement, g'isht, armatura, qum, bo'yoq, plitka, kabel, truba, izolyatsiya... Work (ish): suvash, terish, qoplash, montaj, kovlash, beton quyish, payvandlash, bo'yash, plitka yotqizish...
- "name": tovar/ish nomi (toza, qisqa, o'zbekcha).
- "unit": birlik (dona, qop, m, m2, m3, kg, tonna, litr). Bo'sh bo'lsa "dona".
- "qty": son. Vergul/probelni tozalang.
- "unit_price": birlik narxi (so'mda). Bo'sh bo'lsa 0.
- "notes": qo'shimcha izoh yoki null.
- Sarlavha (header), jami/итого/total qatorlari, bo'sh qatorlarni TASHLAB YUBORING.

Faqat JSON qaytaring:
{"items":[{"kind":"material|work","name":"...","unit":"...","qty":number,"unit_price":number,"notes":"...|null"}]}`;

    // Chunk rows to avoid upstream timeout on large smeta files
    const CHUNK = 40;
    const chunks: RawRow[][] = [];
    for (let i = 0; i < rows.length; i += CHUNK) chunks.push(rows.slice(i, i + CHUNK));

    const chunkResults = await Promise.all(
      chunks.map((chunk) =>
        callAI([
          { role: "system", content: sys },
          { role: "user", content: `Quyidagi qatorlarni normalizatsiya qiling:\n\n${JSON.stringify(chunk, null, 2)}` },
        ], "google/gemini-2.5-flash").catch((e) => {
          console.error("[normalize-chunk]", e);
          return { items: [] };
        })
      )
    );
    const items: any[] = chunkResults.flatMap((r: any) => r?.items ?? []);
    if (!items.length) return { items: [] };

    // 2) Master katalog bilan solishtirish
    const sb = admin();
    const [mm, mw] = await Promise.all([
      sb.from("master_materials").select("id,name,unit,aliases").limit(2000),
      sb.from("master_works").select("id,name,unit,aliases").limit(2000),
    ]);
    const masterMat = (mm.data ?? []) as any[];
    const masterWork = (mw.data ?? []) as any[];

    // 3) Innosite tarixiy narxlar (eng so'nggi qabul qilingan narx)
    const matIds = masterMat.map((r) => r.id);
    const workIds = masterWork.map((r) => r.id);
    const priceByMatId = new Map<string, number>();
    const priceByWorkId = new Map<string, number>();
    if (matIds.length) {
      const { data: mr } = await sb
        .from("material_receipts")
        .select("master_material_id,unit_price,received_at")
        .in("master_material_id", matIds)
        .order("received_at", { ascending: false })
        .limit(5000);
      for (const r of mr ?? []) {
        const mid = (r as any).master_material_id as string | null;
        if (!mid || priceByMatId.has(mid)) continue;
        const p = Number((r as any).unit_price) || 0;
        if (p > 0) priceByMatId.set(mid, p);
      }
    }
    if (workIds.length) {
      const { data: wp } = await sb
        .from("work_progress")
        .select("master_work_id,unit_price,work_date")
        .in("master_work_id", workIds)
        .order("work_date", { ascending: false })
        .limit(5000);
      for (const r of wp ?? []) {
        const wid = (r as any).master_work_id as string | null;
        if (!wid || priceByWorkId.has(wid)) continue;
        const p = Number((r as any).unit_price) || 0;
        if (p > 0) priceByWorkId.set(wid, p);
      }
    }
    // Master katalogda topilmaganlar uchun ham nom bo'yicha so'nggi narxni olamiz
    const { data: histMat } = await sb
      .from("material_receipts")
      .select("material_name,unit_price,received_at")
      .order("received_at", { ascending: false })
      .limit(2000);
    const priceByMatName = new Map<string, number>();
    for (const r of histMat ?? []) {
      const n = normName(String((r as any).material_name || ""));
      if (!n || priceByMatName.has(n)) continue;
      const p = Number((r as any).unit_price) || 0;
      if (p > 0) priceByMatName.set(n, p);
    }
    const { data: histWork } = await sb
      .from("work_progress")
      .select("work_type,unit_price,work_date")
      .order("work_date", { ascending: false })
      .limit(2000);
    const priceByWorkName = new Map<string, number>();
    for (const r of histWork ?? []) {
      const n = normName(String((r as any).work_type || ""));
      if (!n || priceByWorkName.has(n)) continue;
      const p = Number((r as any).unit_price) || 0;
      if (p > 0) priceByWorkName.set(n, p);
    }

    function matchMaster(kind: "material" | "work", name: string): { id: string; unit: string; price: number } | null {
      const list = kind === "material" ? masterMat : masterWork;
      const priceMap = kind === "material" ? priceByMatId : priceByWorkId;
      const n = normName(name);
      if (!n) return null;
      let best: any = null;
      let bestScore = 0;
      for (const it of list) {
        const candidates = [it.name, ...(Array.isArray(it.aliases) ? it.aliases : [])];
        for (const c of candidates) {
          const cn = normName(String(c));
          if (!cn) continue;
          let score = 0;
          if (cn === n) score = 100;
          else if (n.includes(cn) || cn.includes(n)) score = Math.min(cn.length, n.length);
          if (score > bestScore) { bestScore = score; best = it; }
        }
      }
      if (!best || bestScore < 4) return null;
      return { id: best.id, unit: best.unit || "dona", price: priceMap.get(best.id) || 0 };
    }

    // 4) Birinchi bosqich birlashtirish
    type Enriched = {
      kind: "material" | "work"; name: string; unit: string; qty: number;
      unit_price: number; notes: string | null; master_id: string | null; off_plan: boolean;
      _needsMarketPrice?: boolean;
    };
    const enriched: Enriched[] = items
      .filter((it) => it && (it.kind === "material" || it.kind === "work") && it.name)
      .map((it) => {
        const kind = it.kind as "material" | "work";
        const match = matchMaster(kind, String(it.name));
        const excelPrice = Number(it.unit_price) || 0;
        const histMap = kind === "material" ? priceByMatName : priceByWorkName;
        const histPrice = histMap.get(normName(String(it.name))) || 0;
        // Prioritet: master katalog narxi → tarixiy narx → excel narxi
        const dbPrice = (match?.price || 0) || histPrice;
        const price = dbPrice > 0 ? dbPrice : excelPrice;
        return {
          kind,
          name: String(it.name).trim(),
          unit: (match?.unit || String(it.unit || "dona")).trim(),
          qty: Number(it.qty) || 0,
          unit_price: price,
          notes: it.notes ?? null,
          master_id: match?.id ?? null,
          // Excel smetadagi qatorlar HAR DOIM asosiy rejaga kiradi (off_plan=false).
          // off_plan faqat AI tomonidan qo'shilgan qo'shimcha materiallar/ishlar uchun.
          off_plan: false,
          _needsMarketPrice: price <= 0,
        };
      });

    // 5+6) Narx va off-plan AI chaqiruvlarini PARALLEL bajaramiz (timeout oldini olish)
    const needPrice = enriched.filter((e) => e._needsMarketPrice);

    const pricePromise = needPrice.length
      ? callAI([
          { role: "system", content: "Sen O'zbekiston qurilish narxlari bo'yicha ekspertsan. Faqat JSON qaytarasan." },
          { role: "user", content: `Sen O'zbekiston (Toshkent) qurilish bozori narxlari bo'yicha mutaxassissan. Quyidagi material/ish turlari uchun 2025-2026 yilgi taxminiy bozor narxini so'mda (UZS) ber. Real, oqilona narxlar bo'lsin. Faqat JSON qaytar:
{"prices":[{"name":"...","unit_price":number}]}

Ro'yxat:
${JSON.stringify(needPrice.map((e) => ({ kind: e.kind, name: e.name, unit: e.unit })), null, 2)}` },
        ], "google/gemini-2.5-flash-lite").catch((err) => { console.error("[market-price-ai]", err); return { prices: [] }; })
      : Promise.resolve({ prices: [] });

    const offPlanPromise = callAI([
      { role: "system", content: "Sen qurilish loyihasi rejadan tashqari xarajatlarini tahlil qiluvchi yordamchisan." },
      { role: "user", content: `Sen qurilish smeta tahlilchisisan. Quyida loyihaga yuklangan smetadagi material va ish turlari berilgan.
Loyiha turini tahminlash uchun ulardan foydalan va smetada YO'Q lekin amaliyotda KO'P UCHRAYDIGAN qo'shimcha material/ish turlarini taklif qil (transport, kran, chiqindi olib chiqish, anker, dyubel, mayda elektr montaj va h.k.).
Faqat smetada bo'lmagan, lekin jarayonda kerak bo'ladigan 5-15 ta element ber. Har biriga taxminiy O'zbekiston bozor narxini ber.

Smetadagi qatorlar:
${JSON.stringify(enriched.slice(0, 60).map((e) => ({ kind: e.kind, name: e.name, unit: e.unit })), null, 2)}

Faqat JSON:
{"items":[{"kind":"material|work","name":"...","unit":"...","qty":number,"unit_price":number,"notes":"nima uchun kerakligi"}]}` },
    ], "google/gemini-2.5-flash-lite").catch((err) => { console.error("[off-plan-ai]", err); return { items: [] }; });

    const [priceRes, ext] = await Promise.all([pricePromise, offPlanPromise]);

    // Narxlarni qo'llash
    const priceMap = new Map<string, number>();
    for (const p of (priceRes as any).prices ?? []) {
      const n = normName(String(p.name || ""));
      const v = Number(p.unit_price) || 0;
      if (n && v > 0) priceMap.set(n, v);
    }
    for (const e of needPrice) {
      const v = priceMap.get(normName(e.name));
      if (v && v > 0) e.unit_price = v;
    }

    // Off-plan qo'shimcha item'lar
    const existing = new Set(enriched.map((e) => normName(e.name)));
    const extra: Enriched[] = ((ext as any).items ?? [])
      .filter((it: any) => it && (it.kind === "material" || it.kind === "work") && it.name)
      .filter((it: any) => !existing.has(normName(String(it.name))))
      .map((it: any) => ({
        kind: it.kind as "material" | "work",
        name: String(it.name).trim(),
        unit: String(it.unit || "dona").trim(),
        qty: Number(it.qty) || 1,
        unit_price: Number(it.unit_price) || 0,
        notes: it.notes ? `[AI taxmini] ${it.notes}` : "[AI taxmini] rejadan tashqari",
        master_id: null,
        off_plan: true,
      }));

    // _needsMarketPrice ichki maydonini olib tashlash
    const finalItems = [...enriched, ...extra].map(({ _needsMarketPrice, ...rest }) => rest);
    return { items: finalItems };
  });
