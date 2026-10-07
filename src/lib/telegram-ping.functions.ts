import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const sendTelegramPing = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: adminRole } = await supabaseAdmin
      .from("user_roles").select("role")
      .eq("user_id", context.userId).eq("role", "admin").maybeSingle();
    if (!adminRole) throw new Error("Faqat adminlar uchun");
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return { ok: false, error: "TELEGRAM_BOT_TOKEN sozlanmagan", results: [] as any[] };

  const { data: roles, error } = await supabaseAdmin
    .from("user_roles").select("user_id").eq("role", "admin");
  if (error) return { ok: false, error: error.message, results: [] };
  const adminIds = (roles ?? []).map((r: any) => r.user_id);
  const { data: profs } = adminIds.length
    ? await supabaseAdmin.from("profiles")
        .select("id, telegram_user_id, full_name").in("id", adminIds)
    : { data: [] as any[] };

  const targets = (profs ?? [])
    .map((p: any) => ({
      chat_id: p.telegram_user_id as number | null,
      name: (p.full_name as string | null) ?? "Admin",
    }))
    .filter((t) => !!t.chat_id);

  if (targets.length === 0) {
    return { ok: false, error: "Hech bir adminga telegram_user_id biriktirilmagan", results: [] };
  }

  const text =
    `🧪 <b>Sinov xabari</b>\n\n` +
    `Agar siz buni o'qiyotgan bo'lsangiz — Telegram bot to'g'ri sozlangan ✅\n` +
    `Vaqt: ${new Date().toLocaleString("uz-UZ")}`;

  const results = await Promise.all(
    targets.map(async (t) => {
      try {
        const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: t.chat_id, text, parse_mode: "HTML" }),
        });
        const j: any = await r.json().catch(() => ({}));
        return { name: t.name, chat_id: t.chat_id, ok: !!j?.ok, error: j?.description ?? null };
      } catch (e: any) {
        return { name: t.name, chat_id: t.chat_id, ok: false, error: e?.message ?? "fetch error" };
      }
    })
  );

  const sent = results.filter((r) => r.ok).length;
  return { ok: sent > 0, sent, total: targets.length, results, error: null as string | null };
});
