import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type RawRow = Record<string, any>;

export const normalizeExcelRows = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string; rows: RawRow[] }) => input)
  .handler(async ({ data }) => {
    const { projectId, rows } = data;
    if (!rows?.length) return { items: [] };

    const [mm, mw, brigs] = await Promise.all([
      supabaseAdmin.from("master_materials").select("id,name,unit,aliases"),
      supabaseAdmin.from("master_works").select("id,name,unit,aliases"),
      supabaseAdmin.from("brigades").select("id,name,leader"),
    ]);

    const mmList = (mm.data ?? []).map((c: any) => `${c.id}|${c.name} (${c.unit})`).join("\n");
    const mwList = (mw.data ?? []).map((c: any) => `${c.id}|${c.name} (${c.unit})`).join("\n");
    const bList = (brigs.data ?? []).map((b: any) => `${b.id}|${b.name}${b.leader ? ` (${b.leader})` : ""}`).join("\n");

    const sys = `Sen Excel jadvalidan qurilish ma'lumotlarini normalizatsiya qiluvchi yordamchisan. Foydalanuvchi yagona shablondan qatorlarni yuboradi. Har bir qator turi: "material", "work" (ish), "expense" (xarajat) yoki "brigade_pay" (brigada to'lovi).

Master materiallar (id|nom (birlik)):
${mmList || "(yo'q)"}

Master ishlar (id|nom (birlik)):
${mwList || "(yo'q)"}

Brigadalar (id|nom):
${bList || "(yo'q)"}

QOIDALAR:
- "tur" maydoni bo'sh bo'lsa, nom va kontekstdan turini aniqla.
- Nom uchun eng mos master_id ni tanla, topa olmasang null.
- Brigada nomidan brigade_id ni tanla, topa olmasang null lekin "brigade" ga yozilgan nomni saqla.
- expense uchun category: Material (BOQ)|Ish (BOQ)|Qo'shimcha (BOQ)|Bozorlik|Transport|Yordamchi|Xodimlar|Boshqa
- payment_method: Naqd|Plastik|O'tkazma|Hisob (default Naqd)
- brigade_pay kind: avans|yakuniy|boshqa (default avans)
- Sanani YYYY-MM-DD formatga keltir; bo'sh bo'lsa bugun.

Faqat JSON qaytar:
{"items":[
  {"kind":"material","date":"YYYY-MM-DD","master_id":"uuid|null","name":"...","unit":"...","qty":number,"unit_price":number,"supplier":"...|null","note":"...|null"},
  {"kind":"work","date":"YYYY-MM-DD","master_id":"uuid|null","work_type":"...","unit":"...","qty_done":number,"unit_price":number,"brigade_id":"uuid|null","brigade":"...|null","note":"...|null"},
  {"kind":"expense","date":"YYYY-MM-DD","category":"...","description":"...","amount":number,"payment_method":"...","paid_by":"...|null"},
  {"kind":"brigade_pay","date":"YYYY-MM-DD","brigade_id":"uuid|null","brigade":"...","kind_pay":"avans|yakuniy|boshqa","amount":number,"note":"...|null"}
]}`;

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: sys },
          { role: "user", content: `Quyidagi qatorlarni normalizatsiya qil:\n\n${JSON.stringify(rows, null, 2)}` },
        ],
      }),
    });
    if (!res.ok) throw new Error(`AI error ${res.status}: ${await res.text()}`);
    const j = await res.json();
    const txt: string = j?.choices?.[0]?.message?.content ?? "";
    const m = txt.match(/\{[\s\S]*\}/);
    const parsed = m ? JSON.parse(m[0]) : { items: [] };
    return { items: parsed.items ?? [], projectId };
  });

export const saveExcelItems = createServerFn({ method: "POST" })
  .inputValidator((input: { projectId: string; items: any[] }) => input)
  .handler(async ({ data }) => {
    const { projectId, items } = data;
    let ok = 0;
    const errs: string[] = [];
    for (const it of items) {
      let err: any = null;
      const date = it.date ?? null;
      if (it.kind === "material") {
        ({ error: err } = await supabaseAdmin.from("material_receipts").insert({
          project_id: projectId,
          master_material_id: it.master_id ?? null,
          material_name: it.name ?? "Noma'lum",
          qty: Number(it.qty) || 0,
          unit: it.unit ?? null,
          unit_price: Number(it.unit_price) || 0,
          supplier_name: it.supplier ?? null,
          received_at: date ?? new Date().toISOString().slice(0, 10),
        }));
      } else if (it.kind === "work") {
        ({ error: err } = await supabaseAdmin.from("work_progress").insert({
          project_id: projectId,
          master_work_id: it.master_id ?? null,
          work_type: it.work_type ?? "Noma'lum",
          qty_done: Number(it.qty_done) || 0,
          unit: it.unit ?? null,
          unit_price: Number(it.unit_price) || 0,
          brigade_id: it.brigade_id ?? null,
          brigade_name: it.brigade ?? null,
          work_date: date ?? new Date().toISOString().slice(0, 10),
        }));
      } else if (it.kind === "expense") {
        ({ error: err } = await supabaseAdmin.from("expenses").insert({
          project_id: projectId,
          category: it.category ?? "Boshqa",
          description: it.description ?? null,
          amount: Number(it.amount) || 0,
          payment_method: it.payment_method ?? "Naqd",
          paid_by: it.paid_by ?? null,
          expense_date: date ?? new Date().toISOString().slice(0, 10),
        }));
      } else if (it.kind === "brigade_pay") {
        let bid = it.brigade_id;
        if (!bid && it.brigade) {
          const name = String(it.brigade).trim();
          const { data: existing } = await supabaseAdmin.from("brigades").select("id").ilike("name", name).maybeSingle();
          if (existing) bid = existing.id;
          else {
            const { data: created } = await supabaseAdmin.from("brigades").insert({ name }).select("id").single();
            if (created) bid = created.id;
          }
        }
        if (!bid) { errs.push("brigada yo'q"); continue; }
        ({ error: err } = await supabaseAdmin.from("brigade_payments").insert({
          project_id: projectId,
          brigade_id: bid,
          brigade_name: it.brigade ?? null,
          kind: it.kind_pay ?? "avans",
          amount: Number(it.amount) || 0,
          note: it.note ?? null,
          payment_date: date ?? new Date().toISOString().slice(0, 10),
        }));
      }
      if (err) errs.push(err.message);
      else ok++;
    }
    return { ok, errors: errs };
  });
