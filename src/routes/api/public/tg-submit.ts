import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createHmac } from "crypto";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Validate Telegram WebApp initData (HMAC)
function verifyInitData(initData: string, botToken: string): { ok: boolean; userId?: number; username?: string } {
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return { ok: false };
    params.delete("hash");
    const dataCheck = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join("\n");
    const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
    const computed = createHmac("sha256", secret).update(dataCheck).digest("hex");
    if (computed !== hash) return { ok: false };
    const userJson = params.get("user");
    if (!userJson) return { ok: true };
    const u = JSON.parse(userJson);
    return { ok: true, userId: u.id, username: u.username ?? u.first_name };
  } catch {
    return { ok: false };
  }
}

export const Route = createFileRoute("/api/public/tg-submit")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: cors }),
      POST: async ({ request }) => {
        const body = (await request.json()) as {
          initData: string;
          project_id: string;
          rows: Array<{
            kind: "material" | "work" | "expense" | "brigade_pay";
            date?: string;
            name?: string;
            unit?: string;
            qty?: number;
            unit_price?: number;
            master_id?: string | null;
            brigade_id?: string | null;
            brigade?: string | null;
            supplier?: string | null;
            category?: string;
            description?: string;
            amount?: number;
            payment_method?: string;
            paid_by?: string | null;
            kind_pay?: string;
            note?: string | null;
          }>;
        };
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return new Response(JSON.stringify({ error: "no token" }), { status: 500, headers: { "Content-Type": "application/json", ...cors } });
        const v = verifyInitData(body.initData, token);
        if (!v.ok) return new Response(JSON.stringify({ error: "invalid initData" }), { status: 401, headers: { "Content-Type": "application/json", ...cors } });

        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
        const SRC = "telegram_webapp";
        const SRC_NOTE = `📱 WebApp shablon orqali (@${v.username ?? v.userId ?? "tg"})`;

        // Pre-resolve master_id -> { boq_item_id, boq_code } from the project plan
        const matMasterIds = Array.from(new Set((body.rows ?? []).filter((r) => r.kind === "material" && r.master_id).map((r) => r.master_id as string)));
        const workMasterIds = Array.from(new Set((body.rows ?? []).filter((r) => r.kind === "work" && r.master_id).map((r) => r.master_id as string)));
        const boqByMat = new Map<string, { boq_item_id: string | null; boq_code: string | null; zayavka_id: string | null }>();
        const boqByWork = new Map<string, { boq_item_id: string | null; boq_code: string | null; zayavka_id: string | null }>();
        async function fillBoqMap(masterIds: string[], col: "master_material_id" | "master_work_id", target: typeof boqByMat) {
          if (!masterIds.length) return;
          const { data: rows } = await sb
            .from("project_zayavka")
            .select(`id, ${col}, boq_item_id`)
            .eq("project_id", body.project_id)
            .in(col, masterIds);
          const codeIds = Array.from(new Set(((rows ?? []) as any[]).map((r) => r.boq_item_id).filter(Boolean)));
          const codeMap = new Map<string, string>();
          if (codeIds.length) {
            const { data: bs } = await sb.from("boq_items").select("id,code").in("id", codeIds);
            (bs ?? []).forEach((b: any) => codeMap.set(b.id, b.code));
          }
          ((rows ?? []) as any[]).forEach((r) => {
            const mid = r[col] as string | null;
            if (!mid || target.has(mid)) return;
            target.set(mid, { boq_item_id: r.boq_item_id ?? null, boq_code: r.boq_item_id ? codeMap.get(r.boq_item_id) ?? null : null, zayavka_id: r.id ?? null });
          });
        }
        await Promise.all([
          fillBoqMap(matMasterIds, "master_material_id", boqByMat),
          fillBoqMap(workMasterIds, "master_work_id", boqByWork),
        ]);

        let ok = 0;
        const errs: string[] = [];
        for (const it of body.rows ?? []) {
          let err: any = null;
          const date = it.date || new Date().toISOString().slice(0, 10);
          if (it.kind === "material") {
            const link = it.master_id ? boqByMat.get(it.master_id) ?? null : null;
            ({ error: err } = await sb.from("material_receipts").insert({
              project_id: body.project_id,
              master_material_id: it.master_id ?? null,
              boq_item_id: link?.boq_item_id ?? null,
              boq_code: link?.boq_code ?? null,
              zayavka_id: link?.zayavka_id ?? null,
              material_name: it.name ?? "Noma'lum",
              qty: Number(it.qty) || 0,
              unit: it.unit ?? null,
              unit_price: Number(it.unit_price) || 0,
              supplier_name: it.supplier ?? null,
              received_at: date,
              telegram_user_id: v.userId,
              source: SRC,
              source_note: SRC_NOTE,
            }));
          } else if (it.kind === "work") {
            const link = it.master_id ? boqByWork.get(it.master_id) ?? null : null;
            ({ error: err } = await sb.from("work_progress").insert({
              project_id: body.project_id,
              master_work_id: it.master_id ?? null,
              boq_item_id: link?.boq_item_id ?? null,
              boq_code: link?.boq_code ?? null,
              zayavka_id: link?.zayavka_id ?? null,
              work_type: it.name ?? "Noma'lum",
              qty_done: Number(it.qty) || 0,
              unit: it.unit ?? null,
              unit_price: Number(it.unit_price) || 0,
              brigade_id: it.brigade_id ?? null,
              brigade_name: it.brigade ?? null,
              work_date: date,
              telegram_user_id: v.userId,
              source: SRC,
              source_note: SRC_NOTE,
            }));
          } else if (it.kind === "expense") {
            ({ error: err } = await sb.from("expenses").insert({
              project_id: body.project_id,
              category: it.category ?? "Boshqa",
              description: it.description ?? it.name ?? null,
              amount: Number(it.amount) || 0,
              payment_method: (it.payment_method as any) ?? "Naqd",
              paid_by: it.paid_by ?? null,
              expense_date: date,
              telegram_user_id: v.userId,
              source: SRC,
              source_note: SRC_NOTE,
            }));
          } else if (it.kind === "brigade_pay") {
            let bid = it.brigade_id;
            if (!bid && it.brigade) {
              const name = String(it.brigade).trim();
              const { data: existing } = await sb.from("brigades").select("id").ilike("name", name).maybeSingle();
              if (existing) bid = existing.id;
              else {
                const { data: created } = await sb.from("brigades").insert({ name }).select("id").single();
                if (created) bid = created.id;
              }
            }
            if (!bid) { errs.push("brigada yo'q"); continue; }
            ({ error: err } = await sb.from("brigade_payments").insert({
              project_id: body.project_id,
              brigade_id: bid,
              brigade_name: it.brigade ?? null,
              kind: (it.kind_pay as any) ?? "avans",
              amount: Number(it.amount) || 0,
              note: it.note ?? SRC_NOTE,
              payment_date: date,
              telegram_user_id: v.userId,
              source: SRC,
              source_note: SRC_NOTE,
            }));
          }
          if (err) errs.push(err.message);
          else ok++;
        }

        return new Response(JSON.stringify({ ok, errors: errs }), {
          headers: { "Content-Type": "application/json", ...cors },
        });
      },
    },
  },
});
