import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertHasAnyRole(userId: string, roles: string[]) {
  const { data } = await supabaseAdmin
    .from("user_roles").select("role").eq("user_id", userId);
  const have = (data ?? []).map((r: any) => String(r.role));
  if (!roles.some((r) => have.includes(r))) throw new Error("Forbidden");
}

export const sendZayavkaToMake = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ zayavka_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.userId, ["admin", "ceo", "direktor", "finans", "pm", "taminotchi"]);
    const url = process.env.MAKE_ZAYAVKA_WEBHOOK_URL;
    if (!url) throw new Error("MAKE_ZAYAVKA_WEBHOOK_URL not configured");

    const { data: z, error } = await supabaseAdmin
      .from("project_zayavka")
      .select("id,kind,name,unit,qty,unit_price,total,notes,workflow_status,created_by,project_id,boq_item_id")
      .eq("id", data.zayavka_id)
      .single();
    if (error || !z) throw new Error(error?.message ?? "Zayavka not found");

    const projectUrl = process.env.SUPABASE_URL ?? "";
    const callback = `${projectUrl.replace(".supabase.co", ".lovable.app").replace(/^https?:\/\/[^.]+/, "https://project--6ca67d43-c1ef-4bc2-9166-54a51970bdbd")}/api/public/zayavka-callback`;

    const payload = {
      id: z.id,
      category: z.kind,
      name: z.name,
      unit: z.unit,
      quantity: Number(z.qty),
      unit_price: Number(z.unit_price),
      total_price: Number(z.total ?? 0),
      created_by: z.created_by,
      comment: z.notes,
      status: "Submitted",
      project_id: z.project_id,
      boq_item_id: z.boq_item_id,
      callback_url: "https://project--6ca67d43-c1ef-4bc2-9166-54a51970bdbd.lovable.app/api/public/zayavka-callback",
      callback_secret: process.env.MAKE_CALLBACK_SECRET ?? "",
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      throw new Error(`Make webhook failed: ${res.status} ${t}`);
    }
    return { ok: true };
  });

// Submit bo'lgan zayavka uchun barcha adminlarga Telegram orqali xabar
// + Approve/Reject inline tugmalari yuboradi.
export const notifyAdminsZayavkaSubmitted = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ zayavka_id: z.string().uuid() }).parse)
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.userId, ["admin", "ceo", "direktor", "finans", "pm", "taminotchi", "omborchi"]);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { ok: false, sent: 0, reason: "no_token" };

    const { data: zay, error: zErr } = await supabaseAdmin
      .from("project_zayavka")
      .select("id,name,unit,qty,unit_price,total,notes,project_id")
      .eq("id", data.zayavka_id)
      .single();
    if (zErr || !zay) return { ok: false, sent: 0, reason: "no_zayavka" };

    const { data: proj } = await supabaseAdmin
      .from("projects").select("name,code").eq("id", zay.project_id).single();

    // Adminlarning telegram_user_id larini olish (FK yo'q — 2 bosqichli so'rov)
    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", "admin");
    const adminIds = (roles ?? []).map((r: any) => r.user_id);
    const { data: profs } = adminIds.length
      ? await supabaseAdmin.from("profiles")
          .select("id, telegram_user_id, full_name").in("id", adminIds)
      : { data: [] as any[] };

    const targets = (profs ?? [])
      .map((p: any) => ({ chat_id: p.telegram_user_id as number | null, name: p.full_name as string | null }))
      .filter((t) => !!t.chat_id);

    if (targets.length === 0) return { ok: true, sent: 0, reason: "no_admin_chat_ids" };

    const fmt = (n: number) =>
      new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(n) + " so'm";
    const text =
      `🆕 <b>Yangi zayavka tasdig'ga keldi</b>\n\n` +
      `📦 <b>${zay.name}</b>\n` +
      `🔢 ${zay.qty} ${zay.unit} × ${fmt(Number(zay.unit_price))}\n` +
      `💰 Jami: <b>${fmt(Number(zay.total ?? 0))}</b>\n` +
      (proj?.name ? `🏗 Loyiha: ${proj.name}${proj.code ? ` (${proj.code})` : ""}\n` : "") +
      (zay.notes ? `📝 Izoh: ${zay.notes}\n` : "");

    const reply_markup = {
      inline_keyboard: [[
        { text: "✅ Tasdiqlash", callback_data: `zay:approve:${zay.id}` },
        { text: "❌ Rad etish", callback_data: `zay:reject:${zay.id}` },
      ]],
    };

    let sent = 0;
    await Promise.all(
      targets.map(async (t) => {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: t.chat_id, text, parse_mode: "HTML", reply_markup }),
        });
        if (r.ok) sent++;
      })
    );

    return { ok: true, sent, total: targets.length };
  });

// Bosqich o'zgarganda mas'ul rolga (taminotchi/omborchi/buxgalter/...) Telegram xabar.
const STAGE_MSG: Record<string, { title: string; emoji: string }> = {
  taminotchi: { title: "Sotib olish bosqichi sizda", emoji: "🛒" },
  omborchi: { title: "Material qabuli sizda", emoji: "📥" },
  buxgalter: { title: "To'lov bosqichi sizda", emoji: "💳" },
  admin: { title: "Yangilanish", emoji: "🔔" },
  pm: { title: "PM tasdig'i kerak", emoji: "✅" },
  direktor: { title: "Direktor tasdig'i kerak", emoji: "💵" },
  ceo: { title: "CEO tasdig'i kerak", emoji: "👔" },
};

export const notifyRoleZayavkaStage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({
    zayavka_id: z.string().uuid(),
    role: z.string(),
    extra_note: z.string().optional(),
  }).parse)
  .handler(async ({ data, context }) => {
    await assertHasAnyRole(context.userId, ["admin", "ceo", "direktor", "finans", "pm", "taminotchi", "omborchi", "buxgalter"]);
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) return { ok: false, sent: 0, reason: "no_token" };

    const { data: zay } = await supabaseAdmin
      .from("project_zayavka")
      .select("id,name,unit,qty,unit_price,total,notes,project_id,workflow_status")
      .eq("id", data.zayavka_id).single();
    if (!zay) return { ok: false, sent: 0, reason: "no_zayavka" };

    const { data: proj } = await supabaseAdmin
      .from("projects").select("name,code").eq("id", zay.project_id).single();

    const { data: roles } = await supabaseAdmin
      .from("user_roles").select("user_id").eq("role", data.role as any);
    const ids = (roles ?? []).map((r: any) => r.user_id);
    const { data: profs } = ids.length
      ? await supabaseAdmin.from("profiles").select("id,telegram_user_id,full_name").in("id", ids)
      : { data: [] as any[] };

    const targets = (profs ?? [])
      .map((p: any) => ({ chat_id: p.telegram_user_id as number | null, name: p.full_name }))
      .filter((t) => !!t.chat_id);
    if (targets.length === 0) return { ok: true, sent: 0, reason: "no_chat_ids", role: data.role };

    const meta = STAGE_MSG[data.role] ?? { title: "Yangilanish", emoji: "🔔" };
    const fmt = (n: number) =>
      new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(n) + " so'm";
    const text =
      `${meta.emoji} <b>${meta.title}</b>\n\n` +
      `📦 <b>${zay.name}</b>\n` +
      `🔢 ${zay.qty} ${zay.unit} × ${fmt(Number(zay.unit_price))}\n` +
      `💰 Jami: <b>${fmt(Number(zay.total ?? 0))}</b>\n` +
      (proj?.name ? `🏗 Loyiha: ${proj.name}${proj.code ? ` (${proj.code})` : ""}\n` : "") +
      `📊 Holat: <b>${zay.workflow_status}</b>\n` +
      (data.extra_note ? `\n📝 ${data.extra_note}\n` : "");

    let sent = 0;
    await Promise.all(targets.map(async (t) => {
      const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chat_id: t.chat_id, text, parse_mode: "HTML" }),
      });
      if (r.ok) sent++;
    }));
    return { ok: true, sent, total: targets.length, role: data.role };
  });
